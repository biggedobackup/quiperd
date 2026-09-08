#Requires -Version 7
# Recette des notifications push (Firebase Cloud Messaging) — Défis en Ligne.
#
# Elle complète parcours-api.ps1 et parcours-temps-reel.ps1 sur le seul terrain qu'aucun des
# deux ne couvre : ce que reçoit un joueur dont l'application est FERMÉE. Le socket ne prouve
# rien là-dessus — il meurt avec le premier plan.
#
# Deux étapes, parce qu'il faut une vraie application entre les deux :
#
#   pwsh -File tests/parcours-push.ps1 -Etape preparer
#       Crée deux joueurs (A = celui du téléphone, B = l'adversaire), confirme les adresses,
#       approvisionne les portefeuilles, et écrit tests/tmp/push-comptes.json.
#       Se connecter ENSUITE sur l'émulateur avec les identifiants affichés : c'est cette
#       connexion qui enregistre le jeton FCM de l'appareil.
#
#   pwsh -File tests/parcours-push.ps1 -Etape verifier
#       Vérifie que le jeton est bien arrivé en base, puis déclenche les trois événements que
#       l'utilisateur attend : un défi créé, un défi rejoint, un résultat déclaré.
#
# L'API doit tourner avec FCM_ACTIF=true, PostgreSQL et Redis accessibles, psql dans le PATH.
param(
  [ValidateSet('preparer', 'verifier')]
  [string]$Etape = 'preparer'
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$env:PGCLIENTENCODING = 'UTF8'

$Base = 'http://127.0.0.1:8080/api'
$Scratch = Join-Path $PSScriptRoot 'tmp'; New-Item -ItemType Directory -Force $Scratch | Out-Null
$Comptes = Join-Path $Scratch 'push-comptes.json'
$DotEnv = @{}; Get-Content (Join-Path $PSScriptRoot '..\.env') | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' } | ForEach-Object { $DotEnv[$Matches[1]] = $Matches[2] }
$env:PGPASSWORD = $DotEnv['DB_PASSWORD']; $PgHost = $DotEnv['DB_HOST'] ?? 'localhost'; $PgUser = $DotEnv['DB_USER'] ?? 'defisenligne'; $PgDb = $DotEnv['DB_NAME'] ?? 'qui_perd'; $PgPort = $DotEnv['DB_PORT'] ?? '5432'

$script:Results = [System.Collections.Generic.List[object]]::new()
function Check([string]$name, [bool]$ok, [string]$detail = '') {
  $script:Results.Add([pscustomobject]@{ Test = $name; OK = $ok; Detail = $detail })
  $tag = if ($ok) { 'PASS' } else { 'FAIL' }
  $d = if ($detail) { " -- $detail" } else { '' }
  Write-Host ("[{0}] {1}{2}" -f $tag, $name, $d)
}
function Section([string]$t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

function Api([string]$Method, [string]$Path, $Body = $null, [string]$Token = '') {
  $p = @{ Uri = "$Base$Path"; Method = $Method; SkipHttpErrorCheck = $true }
  $h = @{}
  if ($Token) { $h['Authorization'] = "Bearer $Token" }
  $p['Headers'] = $h
  if ($null -ne $Body) {
    $p['ContentType'] = 'application/json'
    $p['Body'] = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress))
  }
  try { $r = Invoke-WebRequest @p } catch { return [pscustomobject]@{ Status = -1; Body = $null; Raw = $_.Exception.Message } }
  $raw = ''
  if ($r.RawContentStream) { $raw = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) } else { $raw = [string]$r.Content }
  $json = $null
  if ($raw) { try { $json = $raw | ConvertFrom-Json -Depth 30 } catch { $json = $null } }
  return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $json; Raw = $raw }
}
function Sql([string]$q) { $out = & psql -h $PgHost -p $PgPort -U $PgUser -d $PgDb -At -c $q 2>&1; return (@($out | ForEach-Object { "$_" }) -join "`n") }
function Redis([string]$cmd) {
  $c = [System.Net.Sockets.TcpClient]::new('127.0.0.1', 6379)
  $s = $c.GetStream()
  $w = [System.IO.StreamWriter]::new($s); $w.NewLine = "`r`n"; $w.AutoFlush = $true
  $w.WriteLine($cmd)
  Start-Sleep -Milliseconds 200
  $buf = New-Object byte[] 262144
  $n = $s.Read($buf, 0, $buf.Length)
  $c.Close()
  return [Text.Encoding]::UTF8.GetString($buf, 0, $n)
}

# ─────────────────────────────────────────────────────────────────────────────
if ($Etape -eq 'preparer') {
  $Suffix = (Get-Date -Format 'HHmmss')
  Section "Préparation des comptes (suffixe $Suffix)"

  $joueurs = @{}
  foreach ($role in @('A', 'B')) {
    $nom = if ($role -eq 'A') { "push_tel_$Suffix" } else { "push_adv_$Suffix" }
    $c = @{ nomUtilisateur = $nom; email = "$nom@test.local"; motDePasse = 'Secret123!'
            telephone = "+22507000000$(if ($role -eq 'A') { '11' } else { '12' })"; pays = "Côte d'Ivoire" }

    $r = Api POST '/auth/inscription' $c
    Check "inscription $role ($nom)" ($r.Status -eq 201 -or $r.Status -eq 200) "statut=$($r.Status)"
    $jeton = $r.Body.jeton
    $id = $r.Body.utilisateur.id

    # Confirmation de l'adresse : le code vit en Redis, comme dans parcours-api.ps1. Sans elle,
    # POST /defis répond 403 et rien ne peut être déclenché.
    $brut = Redis "HGET verif:email:$id code"
    $code = if ($brut -match '(\d{6})') { $Matches[1] } else { '' }
    $r = Api POST '/auth/verification-email' @{ code = $code } $jeton
    Check "confirmation d'adresse $role" ($r.Status -eq 200) "statut=$($r.Status)"

    # Le portefeuille est créé à la DEMANDE, pas à l'inscription : sans cette lecture, la mise à
    # jour qui suit ne trouverait aucune ligne et le joueur resterait à zéro — on ne s'en
    # apercevrait qu'au premier « solde insuffisant », trois étapes plus loin.
    Api GET '/portefeuille' $null $jeton | Out-Null
    # Approvisionnement direct : la recette du push n'a pas à rejouer tout le parcours de dépôt,
    # déjà couvert par parcours-api.ps1.
    Sql "update portefeuilles set solde_disponible = 50000 where utilisateur_id = '$id'" | Out-Null
    $solde = Sql "select coalesce(solde_disponible::text,'') from portefeuilles where utilisateur_id = '$id'"
    Check "portefeuille $role approvisionné" ($solde -eq '50000.00') "solde=$solde"
    $joueurs[$role] = @{ nom = $nom; email = $c.email; motDePasse = $c.motDePasse; id = $id; jeton = $jeton }
  }

  $r = Api GET '/jeux'
  $jeu = $r.Body[0]
  $r = Api GET '/plateformes'
  $plateforme = $r.Body[0]
  Check 'catalogue disponible (jeu + plateforme)' ($null -ne $jeu -and $null -ne $plateforme) "jeu=$($jeu.nom) plateforme=$($plateforme.nom)"

  @{ A = $joueurs['A']; B = $joueurs['B']; jeuId = $jeu.id; plateformeId = $plateforme.id } |
    ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $Comptes

  Write-Host "`n─────────────────────────────────────────────" -ForegroundColor Yellow
  Write-Host " Se connecter sur l'ÉMULATEUR avec :" -ForegroundColor Yellow
  Write-Host "   e-mail      : $($joueurs['A'].email)" -ForegroundColor Yellow
  Write-Host "   mot de passe: $($joueurs['A'].motDePasse)" -ForegroundColor Yellow
  Write-Host " puis : pwsh -File tests/parcours-push.ps1 -Etape verifier" -ForegroundColor Yellow
  Write-Host "─────────────────────────────────────────────" -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
if ($Etape -eq 'verifier') {
  if (-not (Test-Path $Comptes)) { Write-Host "Lancer d'abord -Etape preparer" -ForegroundColor Red; exit 1 }
  $d = Get-Content -Raw $Comptes | ConvertFrom-Json
  $A = $d.A; $B = $d.B

  Section 'Jeton FCM de l''appareil'
  $jetonFcm = Sql "select coalesce(jeton_fcm,'') from sessions_utilisateurs where utilisateur_id='$($A.id)' and jeton_fcm <> '' order by date_creation desc limit 1"
  Check 'le téléphone a enregistré son jeton FCM' ($jetonFcm.Length -gt 50) "longueur=$($jetonFcm.Length)"

  # Les jetons de l'étape « preparer » ont pu expirer : on se reconnecte.
  $r = Api POST '/auth/connexion' @{ email = $B.email; motDePasse = $B.motDePasse }
  $jB = $r.Body.jeton
  Check 'reconnexion adversaire' ($r.Status -eq 200) "statut=$($r.Status)"
  $r = Api POST '/auth/connexion' @{ email = $A.email; motDePasse = $A.motDePasse }
  $jA = $r.Body.jeton
  Check 'reconnexion joueur du téléphone' ($r.Status -eq 200) "statut=$($r.Status)"

  Section '1. L''adversaire crée un défi -> annonce à la salle (topic)'
  $r = Api POST '/defis' @{ jeuId = $d.jeuId; plateformeId = $d.plateformeId; montantMise = 1500; dureeHeures = 24 } $jB
  Check 'défi créé par l''adversaire' ($r.Status -eq 201) "statut=$($r.Status)"
  $defiB = $r.Body.id
  Start-Sleep -Seconds 4

  Section '2. L''adversaire rejoint le défi du joueur -> notification personnelle'
  $r = Api POST '/defis' @{ jeuId = $d.jeuId; plateformeId = $d.plateformeId; montantMise = 1000; dureeHeures = 24 } $jA
  Check 'défi créé par le joueur du téléphone' ($r.Status -eq 201) "statut=$($r.Status)"
  $defiA = $r.Body.id
  $r = Api POST "/defis/$defiA/rejoindre" $null $jB
  Check 'défi rejoint par l''adversaire' ($r.Status -eq 200 -or $r.Status -eq 201) "statut=$($r.Status)"
  $matchId = $r.Body.id ?? $r.Body.matchId
  $n = Sql "select count(*) from notifications where utilisateur_id='$($A.id)' and type='defi_rejoint'"
  Check 'notification defi_rejoint enregistrée pour le joueur' ([int]$n -ge 1) "entrées=$n"
  Start-Sleep -Seconds 4

  Section '3. L''adversaire déclare le résultat -> notification au joueur'
  $r = Api POST "/matchs/$matchId/declaration" @{ resultat = 'gagne' } $jB
  Check 'résultat déclaré par l''adversaire' ($r.Status -eq 200) "statut=$($r.Status)"
  $n = Sql "select count(*) from notifications where utilisateur_id='$($A.id)' and type in ('match_score','match_a_valider')"
  Check 'notification de déclaration enregistrée pour le joueur' ([int]$n -ge 1) "entrées=$n"
  Start-Sleep -Seconds 4

  Write-Host "`nDéfis créés : adversaire=$defiB joueur=$defiA match=$matchId"
  Write-Host "Vérifier maintenant sur l'émulateur : trois bannières doivent être tombées." -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
$ko = @($script:Results | Where-Object { -not $_.OK })
Write-Host ("`n{0} vérifications, {1} en échec" -f $script:Results.Count, $ko.Count) -ForegroundColor $(if ($ko.Count -eq 0) { 'Green' } else { 'Red' })
if ($ko.Count -gt 0) { $ko | ForEach-Object { Write-Host "  FAIL $($_.Test) -- $($_.Detail)" -ForegroundColor Red }; exit 1 }
