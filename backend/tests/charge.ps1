#Requires -Version 7
<#
.SYNOPSIS
  Montée en charge de Défis en Ligne : combien de joueurs tiennent en même temps sur le socket temps
  réel de la page /defis, et combien de défis peuvent être créés et rejoints simultanément.

.DESCRIPTION
  Le script n'est qu'un pilote : la charge elle-même est produite par l'outil Go
  `tests/outils/charge` (un client, rien d'autre — il n'importe aucun paquet du backend).

  Deux cibles :

    -Cible local        démarre une instance DÉDIÉE du backend (APP_ENV=production, port 8090,
                        e-mails coupés) sur la base de développement, crée des comptes de charge,
                        puis mesure le plafond réel de l'application. C'est la mesure qui dit ce
                        que le CODE sait encaisser.

    -Cible production   ne crée AUCUN compte, n'écrit RIEN : uniquement des sockets « visiteur »
                        vers le site public, exactement ce qu'ouvre un internaute sur /defis.
                        C'est la mesure qui dit ce que la CHAÎNE DÉPLOYÉE (proxy, tunnel, serveur)
                        laisse passer — le résultat inclut la liaison Internet du poste de test.

  Prérequis : Go, psql dans le PATH, PostgreSQL et Redis joignables (cible locale uniquement).

.EXAMPLE
  pwsh -File tests/charge.ps1
  pwsh -File tests/charge.ps1 -Cible production -PaliersVisiteur 100,250,500,1000
#>
param(
  [ValidateSet('local', 'production')] [string]$Cible = 'local',
  [string]$UrlProduction = 'https://defisenligne.ouesergegedeon.com',
  [int]$Port = 8090,
  [int]$Comptes = 40,
  [string]$PaliersVisiteur = '250,500,1000,2000,4000,6000,8000',
  [string]$PaliersAuthentifie = '250,500,1000,2000',
  [int]$Cadence = 500,
  [string]$Maintien = '15s',
  [string]$ConcurrencesDefis = '16,32,64,128',
  [int]$IterationsDefis = 400,
  [int]$RueeCandidats = 30,
  [int]$RueeManches = 20,
  [switch]$SansNettoyage,
  [switch]$SansDefis,
  [switch]$SansSockets
)

$ErrorActionPreference = 'Stop'
# psql écrit en UTF-8 ; PowerShell, lui, décode la sortie d'un programme externe avec la page
# de codes de la console. Sur un terminal en cp1252, « délai » revenait en « dÃ©lai » et une
# vérification portant sur un mot accentué échouait alors que la base était juste. Fixer les
# deux bouts rend la recette indépendante du terminal qui la lance.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$env:PGCLIENTENCODING = 'UTF8'
$Racine = Split-Path $PSScriptRoot -Parent          # …/backend
$Tmp = Join-Path $PSScriptRoot 'tmp'
New-Item -ItemType Directory -Force $Tmp | Out-Null
$Horodatage = Get-Date -Format 'yyyyMMdd-HHmmss'
$Suffixe = Get-Date -Format 'HHmmss'
$Rapports = [System.Collections.Generic.List[object]]::new()

function Section([string]$t) {
  Write-Host ''
  Write-Host ('═' * 78) -ForegroundColor DarkCyan
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host ('═' * 78) -ForegroundColor DarkCyan
}
function Info([string]$t) { Write-Host "  $t" -ForegroundColor DarkGray }
function Bien([string]$t) { Write-Host "  $t" -ForegroundColor Green }
function Alerte([string]$t) { Write-Host "  $t" -ForegroundColor Yellow }

# ─────────────────────────────────────────────────────────── Accès base et API
$DotEnv = @{}
Get-Content (Join-Path $Racine '.env') |
  Where-Object { $_ -match '^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$' } |
  ForEach-Object { $DotEnv[$Matches[1]] = $Matches[2] }
$env:PGPASSWORD = $DotEnv['DB_PASSWORD']
$PgHost = $DotEnv['DB_HOST'] ?? 'localhost'; $PgUser = $DotEnv['DB_USER'] ?? 'defisenligne'
$PgDb = $DotEnv['DB_NAME'] ?? 'qui_perd'; $PgPort = $DotEnv['DB_PORT'] ?? '5432'

function Sql([string]$q) {
  $out = & psql -h $PgHost -p $PgPort -U $PgUser -d $PgDb -At -c $q 2>&1
  return (@($out | ForEach-Object { "$_" }) -join "`n")
}

function Api([string]$Method, [string]$Url, $Body = $null, [string]$Token = '') {
  $p = @{ Uri = $Url; Method = $Method; SkipHttpErrorCheck = $true; TimeoutSec = 30 }
  $h = @{}
  if ($Token) { $h['Authorization'] = "Bearer $Token" }
  $p['Headers'] = $h
  if ($null -ne $Body) {
    $p['ContentType'] = 'application/json'
    $p['Body'] = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress))
  }
  try { $r = Invoke-WebRequest @p } catch { return [pscustomobject]@{ Status = -1; Body = $null; Raw = $_.Exception.Message } }
  $raw = if ($r.RawContentStream) { [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) } else { [string]$r.Content }
  $json = $null
  if ($raw) { try { $json = $raw | ConvertFrom-Json -Depth 30 } catch { $json = $null } }
  return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $json; Raw = $raw }
}

# Lance l'outil de charge en processus séparé et ÉCHANTILLONNE le serveur pendant qu'il tourne :
# c'est le seul moyen d'attraper la pointe de mémoire, qui retombe dès la fin du palier.
#
# ATTENTION : Start-Process -ArgumentList assemble le tableau en une seule ligne SANS jamais
# protéger les espaces. Le dépôt vit dans « QUI PERD » : un chemin passé nu se scinderait en
# deux arguments, l'analyse des options de l'outil s'arrêterait là (le paquet flag de Go stoppe
# au premier argument qui n'est pas une option) et toutes les options suivantes seraient
# silencieusement ignorées. D'où le guillemetage explicite ci-dessous.
function Charger([string[]]$Arguments, [System.Diagnostics.Process]$Serveur, [string]$Etiquette) {
  $journal = Join-Path $Tmp "charge-$Etiquette-$Horodatage.log"
  $ligne = ($Arguments | ForEach-Object {
      if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join ' '
  $proc = Start-Process -FilePath $OutilCharge -ArgumentList $ligne -NoNewWindow -PassThru `
    -RedirectStandardOutput $journal -RedirectStandardError "$journal.err"
  $rssMax = 0; $poigneesMax = 0; $cpuDebut = 0
  if ($Serveur -and -not $Serveur.HasExited) { $cpuDebut = $Serveur.TotalProcessorTime.TotalSeconds }
  while (-not $proc.HasExited) {
    if ($Serveur -and -not $Serveur.HasExited) {
      $Serveur.Refresh()
      $rss = [math]::Round($Serveur.WorkingSet64 / 1MB, 1)
      if ($rss -gt $rssMax) { $rssMax = $rss }
      if ($Serveur.HandleCount -gt $poigneesMax) { $poigneesMax = $Serveur.HandleCount }
    }
    Start-Sleep -Milliseconds 400
  }
  $cpu = 0
  if ($Serveur -and -not $Serveur.HasExited) {
    $Serveur.Refresh(); $cpu = [math]::Round($Serveur.TotalProcessorTime.TotalSeconds - $cpuDebut, 1)
  }
  $sortie = if (Test-Path $journal) { "$(Get-Content $journal -Raw)" } else { '' }
  $erreurs = if (Test-Path "$journal.err") { "$(Get-Content "$journal.err" -Raw)".Trim() } else { '' }
  Write-Host $sortie
  if ($erreurs) { Alerte "stderr de l'outil : $erreurs" }
  return [pscustomobject]@{ Code = $proc.ExitCode; Sortie = $sortie; RssMaxMo = $rssMax; CpuSecondes = $cpu; PoigneesMax = $poigneesMax }
}

# ═══════════════════════════════════════════════════ 0. Outil de charge (Go)
Section '0. Compilation de l''outil de charge'
$OutilCharge = Join-Path $Tmp 'charge.exe'
Push-Location $Racine
try {
  $env:GOFLAGS = '-mod=mod'; $env:GOPROXY = 'off'   # connexion lente : jamais de téléchargement
  & go build -o $OutilCharge ./tests/outils/charge 2>&1 | Write-Host
  if ($LASTEXITCODE -ne 0) { throw "compilation de l'outil de charge impossible" }
} finally { Pop-Location }
Bien "outil compilé : $OutilCharge"

$Serveur = $null
$Comptes_ = @()
$JeuId = ''; $PlateformeId = ''
$BaseApi = ''; $BaseWs = ''

if ($Cible -eq 'production') {
  $BaseWs = ($UrlProduction -replace '^https://', 'wss://' -replace '^http://', 'ws://') + '/api/temps-reel'
  Info "cible : $UrlProduction (sockets visiteur uniquement, aucune écriture)"
}
else {
  # ═══════════════════════════════════════════════ 1. Instance dédiée du backend
  Section '1. Instance dédiée du backend (mode production, e-mails coupés)'
  $Binaire = Join-Path $Tmp 'defisenligne-charge.exe'
  Push-Location $Racine
  try {
    & go build -o $Binaire . 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw 'compilation du backend impossible' }
  } finally { Pop-Location }

  $journalServeur = Join-Path $Tmp "serveur-charge-$Horodatage.log"
  $variables = @{
    APP_ENV = 'production'; APP_PORT = "$Port"; APP_HOST = '127.0.0.1'
    EMAIL_ACTIF = 'false'          # 40 inscriptions ne doivent pas partir sur le SMTP réel
    FCM_ACTIF = 'false'
    CORS_ORIGIN = "http://127.0.0.1:$Port"
    WS_ORIGINES_AUTORISEES = '*'
  }
  foreach ($k in $variables.Keys) { Set-Item -Path "env:$k" -Value $variables[$k] }
  $Serveur = Start-Process -FilePath $Binaire -WorkingDirectory $Racine -NoNewWindow -PassThru `
    -RedirectStandardOutput $journalServeur -RedirectStandardError "$journalServeur.err"
  foreach ($k in $variables.Keys) { Remove-Item -Path "env:$k" -ErrorAction SilentlyContinue }

  $BaseApi = "http://127.0.0.1:$Port/api"
  $BaseWs = "ws://127.0.0.1:$Port/api/temps-reel"
  $pret = $false
  foreach ($essai in 1..40) {
    Start-Sleep -Milliseconds 500
    $r = Api GET "$BaseApi/sante"
    if ($r.Status -eq 200) { $pret = $true; break }
  }
  if (-not $pret) {
    Alerte (Get-Content $journalServeur -Raw -ErrorAction SilentlyContinue)
    throw "l'instance de charge n'a pas démarré sur le port $Port"
  }
  $Serveur.Refresh()
  Bien "instance prête sur le port $Port (PID $($Serveur.Id)), mémoire au repos $([math]::Round($Serveur.WorkingSet64/1MB,1)) Mo"

  # ═══════════════════════════════════════════════ 2. Comptes de charge
  Section "2. Comptes de charge ($Comptes joueurs)"
  $jeux = Api GET "$BaseApi/jeux"; $plateformes = Api GET "$BaseApi/plateformes"
  $JeuId = $jeux.Body[0].id; $PlateformeId = $plateformes.Body[0].id
  if (-not $JeuId -or -not $PlateformeId) { throw 'catalogue vide (aucun jeu ou aucune plateforme)' }
  Info "jeu $JeuId / plateforme $PlateformeId"

  # La mise est lue dans la configuration financière, jamais codée en dur : une mise
  # sous le minimum ferait répondre 400 à TOUTES les créations et la mesure de charge
  # ne mesurerait plus que le rejet de validation (c'est arrivé, d'où cette lecture).
  $Mise = [int]([double](Sql "select valeur from configurations_financieres where type = 'mise_minimale' and statut = 'actif' order by date_creation desc limit 1"))
  if ($Mise -le 0) { $Mise = 500 }

  $prefixe = "charge$Suffixe"
  $crees = 1..$Comptes | ForEach-Object -ThrottleLimit 12 -Parallel {
    $nom = "$using:prefixe`_$_"
    $corps = @{ nomUtilisateur = $nom; email = "$nom@charge.local"; motDePasse = 'Test1234!'; pays = 'CI' } |
      ConvertTo-Json -Compress
    try {
      $r = Invoke-WebRequest -Uri "$using:BaseApi/auth/inscription" -Method POST -ContentType 'application/json' `
        -Body ([Text.Encoding]::UTF8.GetBytes($corps)) -SkipHttpErrorCheck -TimeoutSec 30
      $j = ([Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json)
      if ([int]$r.StatusCode -in 200, 201) {
        [pscustomobject]@{ id = $j.utilisateur.id; nom = $nom; jeton = $j.jeton }
      }
    } catch { }
  }
  $Comptes_ = @($crees | Where-Object { $_ -and $_.id })
  if ($Comptes_.Count -lt 4) { throw "seulement $($Comptes_.Count) comptes créés, insuffisant" }

  # Confirmation d'adresse et crédit : en base, directement. Le parcours réel (code à 6 chiffres,
  # dépôt Mobile Money) est déjà couvert par parcours-api.ps1 — ici on ne teste que la charge.
  $ids = ($Comptes_ | ForEach-Object { "'$($_.id)'" }) -join ','
  Sql "update utilisateurs set email_verifie = true where id in ($ids)" | Out-Null
  Sql "insert into portefeuilles (id, utilisateur_id, devise, solde_disponible, solde_bloque, date_creation, date_modification)
       select gen_random_uuid(), id, 'XOF', 100000000, 0, now(), now() from utilisateurs where id in ($ids)
       on conflict (utilisateur_id) do update set solde_disponible = 100000000, solde_bloque = 0" | Out-Null
  $FichierComptes = Join-Path $Tmp "comptes-charge-$Horodatage.json"
  $Comptes_ | ConvertTo-Json -Depth 5 | Set-Content -Path $FichierComptes -Encoding utf8
  Bien "$($Comptes_.Count) comptes créés, adresses confirmées, portefeuilles crédités"
}

try {
  # ═══════════════════════════════════════════════ 3. Sockets — visiteurs
  if (-not $SansSockets) {
    Section '3. Socket temps réel — montée en charge « visiteur » (page /defis publique)'
    $args3 = @('sockets', '-ws', $BaseWs, '-paliers', $PaliersVisiteur, '-cadence', "$Cadence",
      '-maintien', $Maintien, '-salon', 'public:defis',
      '-json', (Join-Path $Tmp "sockets-visiteur-$Horodatage.json"))
    if ($Cible -eq 'local') {
      $args3 += @('-api', $BaseApi, '-jeton-sonde', $Comptes_[0].jeton, '-jeu', $JeuId, '-plateforme', $PlateformeId)
    }
    $r3 = Charger $args3 $Serveur 'sockets-visiteur'
    $Rapports.Add([pscustomobject]@{ Phase = 'sockets visiteur'; Resultat = $r3 })
    if ($Serveur) { Info "pointe mémoire du backend : $($r3.RssMaxMo) Mo — CPU consommé : $($r3.CpuSecondes) s — poignées : $($r3.PoigneesMax)" }
  }

  if ($Cible -eq 'local' -and -not $SansSockets) {
    # ═══════════════════════════════════════════════ 4. Sockets — joueurs connectés
    Section '4. Socket temps réel — montée en charge « joueur connecté » (ticket par connexion)'
    $r4 = Charger @('sockets', '-ws', $BaseWs, '-api', $BaseApi, '-comptes', $FichierComptes,
      '-paliers', $PaliersAuthentifie, '-cadence', "$Cadence", '-maintien', $Maintien,
      '-salon', 'public:defis', '-jeton-sonde', $Comptes_[0].jeton, '-jeu', $JeuId, '-plateforme', $PlateformeId,
      '-json', (Join-Path $Tmp "sockets-joueur-$Horodatage.json")) $Serveur 'sockets-joueur'
    $Rapports.Add([pscustomobject]@{ Phase = 'sockets joueur'; Resultat = $r4 })
    Info "pointe mémoire du backend : $($r4.RssMaxMo) Mo — CPU consommé : $($r4.CpuSecondes) s"
  }

  if ($Cible -eq 'local') {
    if (-not $SansDefis) {
      # ═══════════════════════════════════════════ 5. Défis simultanés — cas nominal
      Section '5. Défis simultanés — création puis acceptation (cas nominal)'
      Info "concurrences balayées : $ConcurrencesDefis — mise $Mise XOF (minimum configuré)"
      $r5 = Charger @('defis', '-api', $BaseApi, '-comptes', $FichierComptes, '-mode', 'paires',
        '-concurrences', $ConcurrencesDefis, '-iterations', "$IterationsDefis",
        '-jeu', $JeuId, '-plateforme', $PlateformeId, '-mise', "$Mise",
        '-json', (Join-Path $Tmp "defis-paires-$Horodatage.json")) $Serveur 'defis-paires'
      $Rapports.Add([pscustomobject]@{ Phase = 'défis paires'; Resultat = $r5 })
      Info "pointe mémoire du backend : $($r5.RssMaxMo) Mo — CPU consommé : $($r5.CpuSecondes) s"

      # ═══════════════════════════════════════════ 6. Ruée sur un même défi
      Section '6. Défis simultanés — ruée : N joueurs sur LE MÊME défi'
      $r6 = Charger @('defis', '-api', $BaseApi, '-comptes', $FichierComptes, '-mode', 'ruee',
        '-concurrence', "$RueeCandidats", '-iterations', "$RueeManches",
        '-jeu', $JeuId, '-plateforme', $PlateformeId, '-mise', "$Mise",
        '-json', (Join-Path $Tmp "defis-ruee-$Horodatage.json")) $Serveur 'defis-ruee'
      $Rapports.Add([pscustomobject]@{ Phase = 'défis ruée'; Resultat = $r6 })
      Info "pointe mémoire du backend : $($r6.RssMaxMo) Mo — CPU consommé : $($r6.CpuSecondes) s"

      # Contrôle d'intégrité : aucune mise ne doit avoir été bloquée deux fois.
      Section '7. Contrôle d''intégrité comptable après la charge'
      $incoherences = Sql "select count(*) from portefeuilles p
        where p.utilisateur_id in ($ids) and (p.solde_disponible < 0 or p.solde_bloque < 0)"
      $doubles = Sql "select count(*) from (select defi_id, utilisateur_id, count(*) c from mises
        where utilisateur_id in ($ids) group by 1,2 having count(*) > 1) x"
      $miseVsBloque = Sql "select count(*) from portefeuilles p where p.utilisateur_id in ($ids)
        and p.solde_bloque <> coalesce((select sum(m.montant) from mises m
          where m.utilisateur_id = p.utilisateur_id and m.statut = 'bloquee'), 0)"
      if ($incoherences -eq '0') { Bien 'aucun solde négatif' } else { Alerte "$incoherences portefeuille(s) à solde négatif" }
      if ($doubles -eq '0') { Bien 'aucune mise enregistrée deux fois sur le même défi' } else { Alerte "$doubles doublon(s) de mise" }
      if ($miseVsBloque -eq '0') { Bien 'solde bloqué = somme des mises bloquées, pour chaque compte' }
      else { Alerte "$miseVsBloque portefeuille(s) dont le solde bloqué ne correspond pas aux mises" }
    }
  }
}
finally {
  # ═══════════════════════════════════════════════ Nettoyage
  if ($Cible -eq 'local') {
    if (-not $SansNettoyage -and $Comptes_.Count -gt 0) {
      Section 'Nettoyage des données de charge'
      $ids = ($Comptes_ | ForEach-Object { "'$($_.id)'" }) -join ','
      $u = "select id from utilisateurs where id in ($ids)"
      $d = "select id from defis where createur_id in ($u)"
      $m = "select id from matchs where defi_id in ($d) or joueur_1_id in ($u) or joueur_2_id in ($u)"
      foreach ($requete in @(
          "delete from transactions_portefeuilles where portefeuille_id in (select id from portefeuilles where utilisateur_id in ($u))",
          "delete from transactions_portefeuilles where match_id in ($m)",
          "delete from resultats_declares where match_id in ($m) or utilisateur_id in ($u)",
          "delete from choix_nuls where match_id in ($m) or utilisateur_id in ($u)",
          "delete from preuves_matchs where match_id in ($m) or utilisateur_id in ($u)",
          "delete from litiges where match_id in ($m) or ouvert_par_id in ($u)",
          "delete from matchs where defi_id in ($d) or joueur_1_id in ($u) or joueur_2_id in ($u)",
          "delete from mises where utilisateur_id in ($u) or defi_id in ($d)",
          "delete from defis where createur_id in ($u)",
          "delete from portefeuilles where utilisateur_id in ($u)",
          "delete from notifications where utilisateur_id in ($u)",
          "delete from journaux_audit where utilisateur_id in ($u)",
          "delete from sessions_utilisateurs where utilisateur_id in ($u)",
          "delete from comptes_gamers where utilisateur_id in ($u)",
          "delete from utilisateurs where id in ($ids)")) {
        Sql $requete | Out-Null
      }
      Bien 'comptes, défis, matchs et écritures de la charge supprimés'
    }
    if ($Serveur -and -not $Serveur.HasExited) {
      Info "arrêt de l'instance de charge (PID $($Serveur.Id))"
      $Serveur.CloseMainWindow() | Out-Null
      Stop-Process -Id $Serveur.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

Section 'Synthèse'
foreach ($r in $Rapports) {
  $etat = if ($r.Resultat.Code -eq 0) { 'OK  ' } else { 'ÉCHEC' }
  Write-Host ("  [{0}] {1,-20} mémoire max {2,7} Mo   CPU {3,6} s" -f $etat, $r.Phase, $r.Resultat.RssMaxMo, $r.Resultat.CpuSecondes)
}
Info "journaux et rapports JSON : $Tmp"
