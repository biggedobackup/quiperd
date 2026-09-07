#Requires -Version 7
# Parcours de recette du temps réel WebSocket de Défis en Ligne — plusieurs clients connectés en même
# temps, comme deux joueurs sur leurs téléphones plus un visiteur du site public.
#
# Le serveur testé est le hub Go/Fiber (backend/tempsreel). Ce script n'est qu'un CLIENT : il utilise
# System.Net.WebSockets.ClientWebSocket, fourni par PowerShell 7, sans rien installer.
#
# Prérequis : l'API tourne (go run . ou quiperd-backend.exe), PostgreSQL + Redis accessibles,
# psql dans le PATH — mêmes prérequis que parcours-api.ps1.
#   pwsh -File tests/parcours-temps-reel.ps1
#
# Chaque vérification part du principe que RIEN n'est redemandé par le client : si un changement
# d'état n'arrive pas poussé par le serveur dans le délai imparti, le test échoue.
$ErrorActionPreference = 'Continue'
# psql écrit en UTF-8 ; PowerShell, lui, décode la sortie d'un programme externe avec la page
# de codes de la console. Sur un terminal en cp1252, « délai » revenait en « dÃ©lai » et une
# vérification portant sur un mot accentué échouait alors que la base était juste. Fixer les
# deux bouts rend la recette indépendante du terminal qui la lance.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$env:PGCLIENTENCODING = 'UTF8'
$Base = 'http://127.0.0.1:8080/api'   # IPv4 direct : « localhost » tente ::1 d'abord sous Windows
$WsBase = 'ws://127.0.0.1:8080/api/temps-reel'
$Scratch = Join-Path $PSScriptRoot 'tmp'; New-Item -ItemType Directory -Force $Scratch | Out-Null
$DotEnv = @{}; Get-Content (Join-Path $PSScriptRoot '..\.env') | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' } | ForEach-Object { $DotEnv[$Matches[1]] = $Matches[2] }
$env:PGPASSWORD = $DotEnv['DB_PASSWORD']; $PgHost = $DotEnv['DB_HOST'] ?? 'localhost'; $PgUser = $DotEnv['DB_USER'] ?? 'quiperd'; $PgDb = $DotEnv['DB_NAME'] ?? 'qui_perd'; $PgPort = $DotEnv['DB_PORT'] ?? '5432'
$Suffix = (Get-Date -Format 'HHmmss')

$script:Results = [System.Collections.Generic.List[object]]::new()
function Check([string]$name, [bool]$ok, [string]$detail = '') {
  $script:Results.Add([pscustomobject]@{ Test = $name; OK = $ok; Detail = $detail })
  $tag = if ($ok) { 'PASS' } else { 'FAIL' }
  $d = if ($detail) { " -- $detail" } else { '' }
  Write-Host ("[{0}] {1}{2}" -f $tag, $name, $d)
  return $ok
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
  $raw = if ($r.RawContentStream) { [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) } else { [string]$r.Content }
  $json = $null
  if ($raw) { try { $json = $raw | ConvertFrom-Json -Depth 30 } catch { $json = $null } }
  return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $json; Raw = $raw }
}
function Sql([string]$q) { $out = & psql -h $PgHost -p $PgPort -U $PgUser -d $PgDb -At -c $q 2>&1; return (@($out | ForEach-Object { "$_" }) -join "`n") }

# Commande Redis brute : sert à lire le code de confirmation d'adresse, que l'API ne renvoie
# évidemment jamais. Sans confirmation, créer un défi répondrait 403 et tout le parcours tomberait.
function Redis([string]$cmd) {
  $c = [System.Net.Sockets.TcpClient]::new('127.0.0.1', 6379)
  $s = $c.GetStream()
  $w = [System.IO.StreamWriter]::new($s); $w.NewLine = "`r`n"; $w.AutoFlush = $true
  $w.WriteLine($cmd)
  Start-Sleep -Milliseconds 200
  $buf = New-Object byte[] 65536
  $n = $s.Read($buf, 0, $buf.Length)
  $c.Close()
  return [Text.Encoding]::UTF8.GetString($buf, 0, $n)
}

# ---------------------------------------------------------------- Client WebSocket
# Aucune tâche de fond : le socket est « pompé » à la demande. Une lecture en cours qui n'a rien
# reçu est CONSERVÉE d'un pompage à l'autre (jamais annulée), sans quoi ClientWebSocket passerait
# en état Aborted au premier délai dépassé.
function NouveauClient([string]$Nom, [string]$Jeton = '') {
  $url = $WsBase
  $ticket = ''
  if ($Jeton) {
    $t = Api POST '/temps-reel/ticket' @{} $Jeton
    if ($t.Status -ne 200 -or -not $t.Body.ticket) { throw "$Nom : ticket refusé ($($t.Status)) $($t.Raw)" }
    $ticket = $t.Body.ticket
    $url = "$WsBase`?ticket=$([uri]::EscapeDataString($ticket))"
  }
  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  [void]$ws.ConnectAsync([uri]$url, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
  return [pscustomobject]@{
    Nom       = $Nom
    Socket    = $ws
    Ticket    = $ticket
    # Tableau brut, jamais un ArraySegment : PowerShell déballe les valeurs énumérables
    # rangées dans un objet et rendrait un Object[] au relecture. Le segment est construit
    # au moment de l'appel (il ne fait qu'envelopper le tableau, sans copie).
    Tampon    = [byte[]]::new(131072)
    Tache     = $null
    Morceaux  = [System.Text.StringBuilder]::new()
    Recus     = [System.Collections.Generic.List[object]]::new()
  }
}

function Pomper($c, [int]$Millisecondes = 250) {
  $fin = (Get-Date).AddMilliseconds($Millisecondes)
  do {
    if ($c.Socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) { return }
    # Segment construit ici : ClientWebSocket expose deux surcharges de ReceiveAsync
    # (ArraySegment -> Task, Memory -> ValueTask) et la seconde ne serait pas attendable
    # avec .Wait(). Le segment enveloppe le tableau du client, sans copie.
    if ($null -eq $c.Tache) { $c.Tache = $c.Socket.ReceiveAsync([ArraySegment[byte]]::new([byte[]]$c.Tampon), [System.Threading.CancellationToken]::None) }
    if ($c.Tache.Wait(60)) {
      $r = $c.Tache.Result
      $c.Tache = $null
      if ($r.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { return }
      [void]$c.Morceaux.Append([Text.Encoding]::UTF8.GetString([byte[]]$c.Tampon, 0, $r.Count))
      if ($r.EndOfMessage) {
        $texte = $c.Morceaux.ToString(); [void]$c.Morceaux.Clear()
        try { $c.Recus.Add(($texte | ConvertFrom-Json -Depth 30)) } catch { }
      }
    }
  } while ((Get-Date) -lt $fin)
}

function Envoyer($c, $Objet) {
  $octets = [Text.Encoding]::UTF8.GetBytes(($Objet | ConvertTo-Json -Depth 10 -Compress))
  [void]$c.Socket.SendAsync([ArraySegment[byte]]::new($octets), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

# Cherche un événement déjà reçu, sinon pompe jusqu'au délai. Renvoie le message ou $null.
function Attendre($c, [string]$Evenement, [scriptblock]$Predicat = { $true }, [int]$Delai = 8000) {
  $trouve = { param($cl) @($cl.Recus | Where-Object { $_.evenement -eq $Evenement -and (& $Predicat $_.charge) }) | Select-Object -First 1 }
  $m = & $trouve $c
  if ($m) { return $m }
  $fin = (Get-Date).AddMilliseconds($Delai)
  while ((Get-Date) -lt $fin) {
    Pomper $c 200
    $m = & $trouve $c
    if ($m) { return $m }
  }
  return $null
}

function CheckEvenement($c, [string]$Nom, [string]$Evenement, [scriptblock]$Predicat = { $true }, [int]$Delai = 8000, [scriptblock]$Detail = { '' }) {
  $m = Attendre $c $Evenement $Predicat $Delai
  if ($m) { [void](Check $Nom $true (& $Detail $m.charge)) } else { [void](Check $Nom $false "« $Evenement » jamais reçu en $Delai ms par $($c.Nom)") }
  return $m
}

function JamaisRecu($c, [string]$Evenement, [scriptblock]$Predicat = { $true }) {
  return -not @($c.Recus | Where-Object { $_.evenement -eq $Evenement -and (& $Predicat $_.charge) }).Count
}

# Attend la confirmation qui rend compte de TOUS les salons demandés : le serveur renvoie dans
# `salons` la liste complète des salons de la connexion après l'action, et dans `refuses` ceux
# que cette requête s'est vu refuser. Un salon demandé doit donc figurer dans l'une des deux.
function Abonner($c, [string[]]$Salons) {
  Envoyer $c @{ action = 'abonner'; salons = $Salons }
  return Attendre $c 'abonnement.confirme' {
    param($ch)
    $connus = @($ch.salons) + @($ch.refuses)
    @($Salons | Where-Object { $connus -notcontains $_ }).Count -eq 0
  }
}

function Fermer($c) {
  try { if ($c.Socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) { $c.Socket.Abort() } } catch { }
  try { $c.Socket.Dispose() } catch { }
}

# ---------------------------------------------------------------- Comptes de recette
function NouveauJoueur([string]$Prefixe, [int]$Credit) {
  $ident = @{ nomUtilisateur = "$Prefixe$Suffix"; email = "$Prefixe$Suffix@test.local"; motDePasse = 'Test1234!'; pays = 'CI' }
  $r = Api POST '/auth/inscription' $ident
  if ($r.Status -notin 200, 201) { throw "inscription $Prefixe : $($r.Status) $($r.Raw)" }
  $id = $r.Body.utilisateur.id
  # Confirmation de l'adresse : depuis l'ajout du code à 6 chiffres, miser l'exige. Le code
  # n'est jamais renvoyé par l'API, on le lit dans le hachage Redis où le backend le range.
  $rep = Redis "HGET verif:email:$id code"
  if ($rep -match '(\d{6})') {
    $rc = Api POST '/auth/verification-email' @{ code = $Matches[1] } $r.Body.jeton
    if ($rc.Status -ne 200) { throw "confirmation d'adresse $Prefixe : $($rc.Status) $($rc.Raw)" }
  } else {
    throw "code de confirmation introuvable en Redis pour $Prefixe"
  }
  # Crédit direct en base : le parcours de dépôt Mobile Money est déjà couvert par parcours-api.ps1.
  Sql "insert into portefeuilles (id, utilisateur_id, devise, solde_disponible, solde_bloque, date_creation, date_modification)
       values (gen_random_uuid(), '$id', 'XOF', $Credit, 0, now(), now())
       on conflict (utilisateur_id) do update set solde_disponible = $Credit, solde_bloque = 0" | Out-Null
  return [pscustomobject]@{ Id = $id; Jeton = $r.Body.jeton; Nom = $ident.nomUtilisateur }
}
# Déclenche un traitement différé depuis un PROCESSUS SÉPARÉ (voir tests/outils/declencher) :
# c'est ce qui prouve que la diffusion temps réel traverse Redis entre processus, exactement
# comme le ferait un worker Asynq déployé à part de l'API.
function Declencher([string[]]$Arguments) {
  $ancienGoflags = $env:GOFLAGS; $ancienGoproxy = $env:GOPROXY
  $env:GOFLAGS = '-mod=mod'; $env:GOPROXY = 'off'   # connexion très lente : jamais de téléchargement
  Push-Location (Join-Path $PSScriptRoot '..')
  try {
    $sortie = (& go run ./tests/outils/declencher @Arguments 2>&1 | Out-String).Trim()
    return [pscustomobject]@{ Code = $LASTEXITCODE; Sortie = $sortie }
  } finally {
    Pop-Location
    $env:GOFLAGS = $ancienGoflags; $env:GOPROXY = $ancienGoproxy
  }
}
function Soldes([string]$UtilisateurId) {
  $l = (Sql "select solde_disponible, solde_bloque from portefeuilles where utilisateur_id = '$UtilisateurId'").Split('|')
  return [pscustomobject]@{ Disponible = [double]$l[0]; Bloque = [double]$l[1] }
}
function NouveauDefi($Joueur, [string]$JeuId, [string]$PlateformeId, [int]$Mise = 1000) {
  $r = Api POST '/defis' @{ jeuId = $JeuId; plateformeId = $PlateformeId; montantMise = $Mise; regles = "Recette temps réel $Suffix"; dureeHeures = 24 } $Joueur.Jeton
  if ($r.Status -ne 201) { throw "création de défi : $($r.Status) $($r.Raw)" }
  return $r.Body
}

# ================================================================== PARCOURS
$Clients = [System.Collections.Generic.List[object]]::new()
try {
  Section 'Préparation'
  $r = Api GET '/sante'
  if (-not (Check 'API joignable et en bonne santé' ($r.Status -eq 200) $r.Raw)) { throw 'API indisponible' }
  $jeux = Api GET '/jeux'; $plateformes = Api GET '/plateformes'
  $JeuId = $jeux.Body[0].id; $PlateformeId = $plateformes.Body[0].id
  if (-not (Check 'catalogue disponible (au moins un jeu et une plateforme)' ([bool]$JeuId -and [bool]$PlateformeId))) { throw 'catalogue vide' }
  $J1 = NouveauJoueur 'tr1_' 50000
  $J2 = NouveauJoueur 'tr2_' 50000
  [void](Check 'deux joueurs de recette créés et crédités' $true "$($J1.Nom) / $($J2.Nom)")

  Section '1. Connexion au hub et autorisation des salons'
  $Visiteur = NouveauClient 'visiteur'; $Clients.Add($Visiteur)
  $accueil = CheckEvenement $Visiteur 'visiteur sans ticket : connexion acceptée' 'connexion.prete' { $true } 8000 { param($c) "rôle=$($c.role)" }
  [void](Check 'visiteur : rôle « visiteur », aucun identifiant utilisateur' ($accueil.charge.role -eq 'visiteur' -and -not $accueil.charge.utilisateurId) ($accueil.charge | ConvertTo-Json -Compress))

  $C1 = NouveauClient 'joueur1' $J1.Jeton; $Clients.Add($C1)
  $C2 = NouveauClient 'joueur2' $J2.Jeton; $Clients.Add($C2)
  $a1 = CheckEvenement $C1 'joueur 1 : ticket accepté' 'connexion.prete' { $true } 8000 { param($c) "rôle=$($c.role)" }
  [void](CheckEvenement $C2 'joueur 2 : ticket accepté' 'connexion.prete')
  [void](Check 'joueur 1 : identité portée par la connexion' ($a1.charge.utilisateurId -eq $J1.Id) $a1.charge.utilisateurId)

  # Un ticket est à usage unique : le rejouer ne doit jamais rouvrir une session authentifiée.
  $Rejeu = $null
  try {
    $ws = [System.Net.WebSockets.ClientWebSocket]::new()
    [void]$ws.ConnectAsync([uri]"$WsBase`?ticket=$([uri]::EscapeDataString($C1.Ticket))", [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $Rejeu = [pscustomobject]@{ Nom = 'rejeu'; Socket = $ws; Ticket = ''; Tampon = [byte[]]::new(65536); Tache = $null; Morceaux = [System.Text.StringBuilder]::new(); Recus = [System.Collections.Generic.List[object]]::new() }
    $Clients.Add($Rejeu)
    Pomper $Rejeu 2000
    $m = @($Rejeu.Recus)[0]
    [void](Check 'ticket rejoué : refusé ou dégradé en visiteur' ($m.evenement -eq 'connexion.refusee' -or ($m.evenement -eq 'connexion.prete' -and $m.charge.role -eq 'visiteur')) "$($m.evenement)")
  } catch {
    [void](Check 'ticket rejoué : refusé ou dégradé en visiteur' $true "connexion refusée par le serveur : $($_.Exception.Message)")
  }

  $abo1 = Abonner $C1 @('public:defis', "utilisateur:$($J1.Id)", "utilisateur:$($J2.Id)", 'admin')
  [void](Check 'joueur 1 : salons public et personnel accordés' ((@($abo1.charge.salons) -contains 'public:defis') -and (@($abo1.charge.salons) -contains "utilisateur:$($J1.Id)")) (@($abo1.charge.salons) -join ','))
  [void](Check 'joueur 1 : salon personnel d''AUTRUI refusé' (@($abo1.charge.refuses) -contains "utilisateur:$($J2.Id)") (@($abo1.charge.refuses) -join ','))
  [void](Check 'joueur 1 : salon administrateur refusé' (@($abo1.charge.refuses) -contains 'admin') (@($abo1.charge.refuses) -join ','))
  [void](Abonner $C2 @('public:defis', "utilisateur:$($J2.Id)"))
  [void](Abonner $Visiteur @('public:defis'))
  $aboV = Abonner $Visiteur @('admin', "utilisateur:$($J1.Id)")
  [void](Check 'visiteur : salons privé et administrateur refusés' (@($aboV.charge.refuses).Count -eq 2) (@($aboV.charge.refuses) -join ','))

  Section '2. Défi créé — vu en direct par tous, sans rechargement'
  $Defi = NouveauDefi $J1 $JeuId $PlateformeId 1000
  $vu = CheckEvenement $C2 'joueur 2 reçoit « defi.cree » sans rien demander' 'defi.cree' { param($c) $c.id -eq $Defi.id } 8000 { param($c) "mise=$($c.montantMise)" }
  [void](CheckEvenement $Visiteur 'visiteur du site public reçoit « defi.cree »' 'defi.cree' { param($c) $c.id -eq $Defi.id })
  if ($vu) {
    [void](Check '« defi.cree » porte les libellés joints (créateur, jeu, plateforme)' ([bool]$vu.charge.createurNom -and [bool]$vu.charge.jeuNom -and [bool]$vu.charge.plateformeNom) "$($vu.charge.createurNom) · $($vu.charge.jeuNom) · $($vu.charge.plateformeNom)")
    [void](Check '« defi.cree » ne divulgue aucune donnée privée sur le salon public' (-not $vu.charge.PSObject.Properties['email'] -and -not $vu.charge.PSObject.Properties['soldeDisponible'] -and -not $vu.charge.PSObject.Properties['telephone']))
  }
  [void](CheckEvenement $C1 'créateur : solde mis à jour en direct (mise bloquée)' 'portefeuille.maj' { $true } 8000 { param($c) "dispo=$($c.soldeDisponible) bloqué=$($c.soldeBloque)" })

  Section '3. Défi annulé — disparaît en direct'
  $DefiAnnule = NouveauDefi $J1 $JeuId $PlateformeId 800
  [void](Attendre $C2 'defi.cree' { param($c) $c.id -eq $DefiAnnule.id })
  $r = Api DELETE "/defis/$($DefiAnnule.id)" $null $J1.Jeton
  [void](Check 'DELETE /defis/:id -> 204' ($r.Status -eq 204) "statut=$($r.Status)")
  [void](CheckEvenement $C2 'joueur 2 reçoit « defi.annule »' 'defi.annule' { param($c) $c.defiId -eq $DefiAnnule.id })
  [void](CheckEvenement $Visiteur 'visiteur reçoit « defi.annule »' 'defi.annule' { param($c) $c.defiId -eq $DefiAnnule.id })

  Section '3 bis. Défi expiré — retiré à la seconde, publié depuis un AUTRE processus'
  # Le seul moyen de prouver que la diffusion traverse bien Redis Pub/Sub entre processus :
  # l'outil ci-dessous n'a aucun socket ouvert, seuls les clients de l'API doivent être servis.
  $DefiExpire = NouveauDefi $J1 $JeuId $PlateformeId 700
  [void](Attendre $Visiteur 'defi.cree' { param($c) $c.id -eq $DefiExpire.id })
  $dispoAvantExpiration = (Soldes $J1.Id).Disponible
  $exp = Declencher @('defi-expiration', $DefiExpire.id)
  [void](Check 'expiration déclenchée depuis un processus séparé' ($exp.Code -eq 0) $exp.Sortie)
  [void](CheckEvenement $Visiteur 'le défi expiré disparaît en direct chez le visiteur (« defi.expire »)' 'defi.expire' { param($c) $c.defiId -eq $DefiExpire.id } 15000)
  [void](CheckEvenement $C2 'le défi expiré disparaît aussi chez le joueur 2' 'defi.expire' { param($c) $c.defiId -eq $DefiExpire.id } 15000)
  [void](CheckEvenement $C1 'créateur : mise rendue poussée en direct après expiration' 'portefeuille.maj' { param($c) [double]$c.soldeDisponible -ge ($dispoAvantExpiration + 699.99) } 15000 { param($c) "dispo=$($c.soldeDisponible)" })
  $statutExpire = Sql "select statut from defis where id = '$($DefiExpire.id)'"
  [void](Check 'défi expiré en base' ($statutExpire -eq 'expire') "statut=$statutExpire")
  # Règle produit : personne n'a rejoint le défi, la mise revient EN TOTALITÉ (700, sans retenue).
  [void](Check 'expiration : mise rendue intégralement, sans commission (700)' ([math]::Abs((Soldes $J1.Id).Disponible - ($dispoAvantExpiration + 700)) -lt 0.01) "avant=$dispoAvantExpiration après=$((Soldes $J1.Id).Disponible)")

  Section '4. Défi rejoint — les deux joueurs basculent ensemble'
  $r = Api POST "/defis/$($Defi.id)/rejoindre" @{} $J2.Jeton
  [void](Check 'POST /defis/:id/rejoindre -> 201' ($r.Status -eq 201) "statut=$($r.Status) $($r.Raw)")
  $MatchId = $r.Body.id
  [void](CheckEvenement $Visiteur 'le défi rejoint disparaît de la liste publique (« defi.rejoint »)' 'defi.rejoint' { param($c) $c.defiId -eq $Defi.id } 8000 { param($c) "match=$($c.matchId)" })
  [void](CheckEvenement $C1 'créateur prévenu en direct que son défi est pris (« match.cree »)' 'match.cree' { param($c) $c.id -eq $MatchId })
  [void](CheckEvenement $C2 'adversaire reçoit « match.cree »' 'match.cree' { param($c) $c.id -eq $MatchId })
  $aboVM = Abonner $Visiteur @("match:$MatchId")
  [void](Check 'salon du match refusé à un tiers' (@($aboVM.charge.refuses) -contains "match:$MatchId") (@($aboVM.charge.refuses) -join ','))
  [void](Abonner $C1 @("match:$MatchId")); [void](Abonner $C2 @("match:$MatchId"))

  Section '5. Résultat déclaré puis confirmé — règlement immédiat, sans preuve ni arbitre'
  $avantJ1 = Soldes $J1.Id
  $r = Api POST "/matchs/$MatchId/declaration" @{ resultat = 'gagne' } $J1.Jeton
  [void](Check 'POST /matchs/:id/declaration -> 200' ($r.Status -eq 200) "statut=$($r.Status) $($r.Raw)")
  $prop = CheckEvenement $C2 'l''adversaire voit le résultat proposé en direct (« match.score_propose »)' 'match.score_propose' { param($c) $c.matchId -eq $MatchId } 8000 { param($c) "$($c.scorePour)-$($c.scoreContre)" }
  if ($prop) { [void](Check '« match.score_propose » porte une échéance de confirmation' ([bool]$prop.charge.echeanceConfirmation) $prop.charge.echeanceConfirmation) }
  [void](CheckEvenement $C1 'une échéance de confirmation est poussée (« match.chrono »)' 'match.chrono' { param($c) $c.matchId -eq $MatchId -and $c.type -eq 'confirmation' } 8000 { param($c) "échéance=$($c.echeance)" })

  $r = Api POST "/matchs/$MatchId/confirmation" @{} $J2.Jeton
  [void](Check 'POST /matchs/:id/confirmation -> 200' ($r.Status -eq 200) "statut=$($r.Status) $($r.Raw)")
  [void](CheckEvenement $C2 'accord constaté en direct (« match.score_confirme »)' 'match.score_confirme' { param($c) $c.matchId -eq $MatchId } 8000 { param($c) "gagnant=$($c.gagnantId)" })
  [void](CheckEvenement $C1 'match réglé et poussé aux deux joueurs (« match.termine »)' 'match.termine' { param($c) $c.id -eq $MatchId } 8000 { param($c) "gain=$($c.gain)" })
  [void](CheckEvenement $C1 'gagnant : solde crédité en direct' 'portefeuille.maj' { param($c) [double]$c.soldeDisponible -gt $avantJ1.Disponible } 8000 { param($c) "dispo=$($c.soldeDisponible)" })
  [void](CheckEvenement $C1 'gagnant : ligne de grand livre poussée (« transaction.creee »)' 'transaction.creee' { param($c) $c.type -eq 'gain' } 8000 { param($c) "$($c.type) $($c.montant)" })

  $statut = Sql "select statut from matchs where id = '$MatchId'"
  [void](Check 'accord des deux joueurs : match TERMINÉ sans arbitre ni preuve' ($statut -eq 'termine') "statut=$statut")
  $apresJ1 = Soldes $J1.Id
  # Mise de 1000 chacun, commission de 10 % sur les 2000 en jeu : le gagnant récupère 1800.
  [void](Check 'escrow réglé : le gagnant récupère la mise doublée moins la commission' ([math]::Abs($apresJ1.Disponible - ($avantJ1.Disponible + 1800)) -lt 0.01) "avant=$($avantJ1.Disponible) après=$($apresJ1.Disponible)")
  [void](Check 'plus rien de bloqué chez le gagnant' ($apresJ1.Bloque -eq 0) "bloqué=$($apresJ1.Bloque)")
  [void](Check 'aucune preuve exigée sur un match réglé par accord' ((JamaisRecu $C1 'match.desaccord') -and (JamaisRecu $C2 'match.desaccord')))

  Section '5 bis. Adversaire qui ne répond jamais — abandon sur échéance'
  $DefiA = NouveauDefi $J1 $JeuId $PlateformeId 1000
  [void](Api POST "/defis/$($DefiA.id)/rejoindre" @{} $J2.Jeton)
  $mA = Attendre $C2 'match.cree' { param($c) $c.defiId -eq $DefiA.id }
  $MatchA = $mA.charge.id
  [void](Abonner $C1 @("match:$MatchA")); [void](Abonner $C2 @("match:$MatchA"))
  $dispoAvantAbandon = (Soldes $J1.Id).Disponible
  [void](Api POST "/matchs/$MatchA/declaration" @{ resultat = 'gagne' } $J1.Jeton)
  [void](Attendre $C1 'match.chrono' { param($c) $c.matchId -eq $MatchA -and $c.type -eq 'confirmation' })

  # Garde-fou : tant que l'échéance n'est pas atteinte, la tâche ne doit RIEN faire, même si
  # elle est exécutée (retard de file, tâche rejouée par Asynq).
  $tot = Declencher @('match-echeance', $MatchA, 'confirmation', '1')
  $statutTot = Sql "select statut from matchs where id = '$MatchA'"
  [void](Check 'échéance traitée trop tôt : sans effet, le match reste en cours' (($tot.Code -eq 0) -and ($statutTot -eq 'en_cours')) "statut=$statutTot")

  # Le joueur 2 ne confirme jamais. On avance l'horloge plutôt que d'attendre le délai réel
  # (30 minutes par défaut) : le traitement métier, lui, n'est pas contourné.
  [void](Sql "update matchs set echeance = now() - interval '1 minute' where id = '$MatchA'")
  $ech = Declencher @('match-echeance', $MatchA, 'confirmation', '1')
  [void](Check 'échéance de confirmation dépassée, traitée depuis un processus séparé' ($ech.Code -eq 0) $ech.Sortie)
  [void](CheckEvenement $C1 'abandon poussé en direct au joueur resté présent (« match.abandon »)' 'match.abandon' { param($c) $c.matchId -eq $MatchA } 15000 { param($c) "gagnant=$($c.gagnantId)" })
  [void](CheckEvenement $C2 'abandon : l''absent reçoit aussi la fin de match' 'match.termine' { param($c) $c.id -eq $MatchA } 15000)
  $etatA = (Sql "select statut, coalesce(gagnant_id::text,'-') from matchs where id = '$MatchA'").Split('|')
  [void](Check 'abandon : match terminé et gagnant désigné' ($etatA[0] -eq 'termine' -and $etatA[1] -eq $J1.Id) ($etatA -join ' | '))
  [void](Check 'abandon : le gain est réellement versé (1000 misés -> 1800 crédités)' ([math]::Abs((Soldes $J1.Id).Disponible - ($dispoAvantAbandon + 1800)) -lt 0.01) "avant=$dispoAvantAbandon après=$((Soldes $J1.Id).Disponible)")
  $ech2 = Declencher @('match-echeance', $MatchA, 'confirmation', '1')
  [void](Check 'échéance rejouée : idempotente, aucun second paiement' (($ech2.Code -eq 0) -and ([math]::Abs((Soldes $J1.Id).Disponible - ($dispoAvantAbandon + 1800)) -lt 0.01)) "solde=$((Soldes $J1.Id).Disponible)")

  Section '6. Déclarations divergentes — preuve exigée des deux côtés'
  $DefiB = NouveauDefi $J1 $JeuId $PlateformeId 1000
  [void](Api POST "/defis/$($DefiB.id)/rejoindre" @{} $J2.Jeton)
  $mB = Attendre $C2 'match.cree' { param($c) $c.defiId -eq $DefiB.id }
  $MatchB = $mB.charge.id
  [void](Abonner $C1 @("match:$MatchB")); [void](Abonner $C2 @("match:$MatchB"))
  [void](Api POST "/matchs/$MatchB/declaration" @{ resultat = 'gagne' } $J1.Jeton)
  [void](Api POST "/matchs/$MatchB/declaration" @{ resultat = 'gagne' } $J2.Jeton)
  [void](CheckEvenement $C1 'désaccord poussé aux deux joueurs (« match.desaccord »)' 'match.desaccord' { param($c) $c.matchId -eq $MatchB } 8000 { param($c) "échéance preuve=$($c.echeancePreuve)" })
  $statutB = Sql "select statut from matchs where id = '$MatchB'"
  [void](Check 'désaccord : match en « preuve_requise »' ($statutB -eq 'preuve_requise') "statut=$statutB")
  [void](Check 'désaccord : les mises restent bloquées' ((Soldes $J1.Id).Bloque -gt 0) "bloqué=$((Soldes $J1.Id).Bloque)")

  Section '7. Match nul — revanche sans mouvement d''argent, puis partage'
  $DefiC = NouveauDefi $J1 $JeuId $PlateformeId 1000
  [void](Api POST "/defis/$($DefiC.id)/rejoindre" @{} $J2.Jeton)
  $mC = Attendre $C2 'match.cree' { param($c) $c.defiId -eq $DefiC.id }
  $MatchC = $mC.charge.id
  [void](Abonner $C1 @("match:$MatchC")); [void](Abonner $C2 @("match:$MatchC"))
  $bloqueAvantNul = (Soldes $J1.Id).Bloque
  [void](Api POST "/matchs/$MatchC/declaration" @{ resultat = 'nul' } $J1.Jeton)
  [void](Api POST "/matchs/$MatchC/declaration" @{ resultat = 'nul' } $J2.Jeton)
  [void](CheckEvenement $C1 'nul constaté, choix demandé aux deux (« match.nul »)' 'match.nul' { param($c) $c.matchId -eq $MatchC } 8000 { param($c) "manche=$($c.manche)" })
  $r = Api POST "/matchs/$MatchC/choix-nul" @{ choix = 'rejouer' } $J1.Jeton
  [void](Check 'POST /matchs/:id/choix-nul -> 200' ($r.Status -eq 200) "statut=$($r.Status) $($r.Raw)")
  [void](CheckEvenement $C2 'l''adversaire voit le choix en direct (« match.nul_choix »)' 'match.nul_choix' { param($c) $c.matchId -eq $MatchC -and $c.choix -eq 'rejouer' })
  [void](Api POST "/matchs/$MatchC/choix-nul" @{ choix = 'rejouer' } $J2.Jeton)
  [void](CheckEvenement $C1 'les deux acceptent : nouvelle manche (« match.rejoue »)' 'match.rejoue' { param($c) $c.matchId -eq $MatchC } 8000 { param($c) "manche=$($c.manche)" })
  $etat = (Sql "select statut, manche, coalesce(score_joueur_1::text,'-'), coalesce(gagnant_id::text,'-') from matchs where id = '$MatchC'").Split('|')
  [void](Check 'revanche : match remis en cours, manche incrémentée, scores effacés' ($etat[0] -eq 'en_cours' -and [int]$etat[1] -eq 2 -and $etat[2] -eq '-' -and $etat[3] -eq '-') ($etat -join ' | '))
  [void](Check 'revanche : AUCUN mouvement d''argent, la mise reste bloquée' ((Soldes $J1.Id).Bloque -eq $bloqueAvantNul) "bloqué=$((Soldes $J1.Id).Bloque) (avant $bloqueAvantNul)")

  $dispoAvantPartage = (Soldes $J1.Id).Disponible
  [void](Api POST "/matchs/$MatchC/declaration" @{ resultat = 'nul' } $J1.Jeton)
  [void](Api POST "/matchs/$MatchC/declaration" @{ resultat = 'nul' } $J2.Jeton)
  [void](Attendre $C1 'match.nul' { param($c) $c.matchId -eq $MatchC -and $c.manche -eq 2 })
  [void](Api POST "/matchs/$MatchC/choix-nul" @{ choix = 'rejouer' } $J1.Jeton)
  [void](Api POST "/matchs/$MatchC/choix-nul" @{ choix = 'partager' } $J2.Jeton)
  [void](CheckEvenement $C1 'choix opposés : partage automatique (« match.partage »)' 'match.partage' { param($c) $c.matchId -eq $MatchC } 8000 { param($c) "rendu=$($c.rendu) commission=$($c.commission)" })
  $statutC = Sql "select statut from matchs where id = '$MatchC'"
  [void](Check 'partage : match terminé' ($statutC -eq 'termine') "statut=$statutC")
  $dispoApresPartage = (Soldes $J1.Id).Disponible
  [void](Check 'partage : chacun récupère sa mise moins la commission (1000 -> 900)' ([math]::Abs($dispoApresPartage - ($dispoAvantPartage + 900)) -lt 0.01) "avant=$dispoAvantPartage après=$dispoApresPartage")
  $commission = Sql "select coalesce(sum(montant),0) from transactions_portefeuilles where match_id = '$MatchC' and type = 'commission'"
  [void](Check 'partage : la plateforme garde sa commission des deux côtés' ([math]::Abs([double]$commission - 200) -lt 0.01) "commission=$commission")

  Section '8. Étanchéité des salons et vie du direct'
  Pomper $Visiteur 500; Pomper $C2 500
  [void](Check 'le visiteur n''a reçu aucun événement privé' ((JamaisRecu $Visiteur 'portefeuille.maj') -and (JamaisRecu $Visiteur 'transaction.creee') -and (JamaisRecu $Visiteur 'match.score_propose') -and (JamaisRecu $Visiteur 'notification.nouvelle')))
  $soldesRecus = @($C2.Recus | Where-Object { $_.evenement -eq 'portefeuille.maj' })
  [void](Check 'joueur 2 n''a jamais reçu le solde du joueur 1' (@($soldesRecus | Where-Object { $_.salon -and $_.salon -ne "utilisateur:$($J2.Id)" }).Count -eq 0) "$($soldesRecus.Count) événements de solde reçus")
  [void](Check 'les joueurs reçoivent leurs notifications en direct' (@($C1.Recus | Where-Object { $_.evenement -eq 'notification.nouvelle' }).Count -gt 0) "$(@($C1.Recus | Where-Object { $_.evenement -eq 'notification.nouvelle' }).Count) notifications")
  [void](Check 'un compteur de joueurs en ligne est diffusé' (@($Visiteur.Recus | Where-Object { $_.evenement -eq 'compteur.en_ligne' }).Count -gt 0) "$(@($Visiteur.Recus | Where-Object { $_.evenement -eq 'compteur.en_ligne' }) | Select-Object -Last 1 | ForEach-Object { $_.charge.joueursEnLigne })")
} catch {
  [void](Check 'parcours interrompu par une erreur' $false ($_.Exception.Message + ' | ' + $_.ScriptStackTrace))
} finally {
  foreach ($c in $Clients) { Fermer $c }
}

# ------------------------------------------------------------------ Résumé
Section 'RÉSUMÉ'
$ok = @($Results | Where-Object OK).Count; $ko = @($Results | Where-Object { -not $_.OK }).Count
Write-Host ("TOTAL: {0} tests, {1} PASS, {2} FAIL" -f $Results.Count, $ok, $ko) -ForegroundColor $(if ($ko) { 'Yellow' } else { 'Green' })
if ($ko) { Write-Host "`nÉCHECS :" -ForegroundColor Red; $Results | Where-Object { -not $_.OK } | ForEach-Object { Write-Host (" - {0}`n     {1}" -f $_.Test, $_.Detail) } }
$Results | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Scratch 'resultats-temps-reel.json') -Encoding UTF8
exit $(if ($ko) { 1 } else { 0 })
