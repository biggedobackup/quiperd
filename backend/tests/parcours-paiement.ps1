#Requires -Version 7
# Parcours de recette du dépôt Mobile Money MoneyFusion, de bout en bout, contre la
# doublure locale `tests/outils/stub-fusion` (MoneyFusion n'offre ni bac à sable ni clés
# de test : sans doublure, ce parcours ne serait jamais exercé).
#
# Ce qu'il prouve, règle par règle (skill « api_paiement_skill_FusionMoney ») :
#   - le catalogue public ne propose que les passerelles activées ET configurées ;
#   - un dépôt MoneyFusion sans numéro est refusé côté backend, pas seulement dans l'UI ;
#   - créer un paiement ne déplace aucun fonds ;
#   - un webhook ne fait jamais foi : un webhook « paid » sur une transaction restée
#     « pending » ne crédite rien ;
#   - le crédit vaut Montant + frais (`data.Montant` est NET des frais) ;
#   - un montant fractionnaire est refusé (le XOF n'a pas de subdivision) ;
#   - un montant sous le plancher de la passerelle est refusé AVANT l'appel ;
#   - la même notification rejouée ne crédite qu'une fois (idempotence) ;
#   - « failure » clôt le dépôt en échec sans mouvement d'argent ;
#   - le polling de secours conclut même si aucun webhook n'arrive ;
#   - le joueur revient sur le site, jamais sur l'API.
#
# Prérequis : API sur 127.0.0.1:8080, PostgreSQL + Redis, psql dans le PATH, et le .env
# du backend pointant FUSIONMONEY_API_URL vers la doublure :
#   go build -o defisenligne-stub-fusion.exe ./tests/outils/stub-fusion ; .\defisenligne-stub-fusion.exe -port 8099
#   FUSIONMONEY_API_URL=http://127.0.0.1:8099/defisenligne/paiement
#
# Usage :  pwsh -File tests/parcours-paiement.ps1  [-SansPolling]
param([switch]$SansPolling)

$ErrorActionPreference = 'Continue'
# psql écrit en UTF-8 ; PowerShell, lui, décode la sortie d'un programme externe avec la page
# de codes de la console. Sur un terminal en cp1252, « délai » revenait en « dÃ©lai » et une
# vérification portant sur un mot accentué échouait alors que la base était juste. Fixer les
# deux bouts rend la recette indépendante du terminal qui la lance.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$env:PGCLIENTENCODING = 'UTF8'
$Base = 'http://127.0.0.1:8080/api'   # IPv4 direct : « localhost » tente ::1 d'abord sous Windows
$Stub = 'http://127.0.0.1:8099'
$DotEnv = @{}; Get-Content (Join-Path $PSScriptRoot '..\.env') | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' } | ForEach-Object { $DotEnv[$Matches[1]] = $Matches[2] }
$env:PGPASSWORD = $DotEnv['DB_PASSWORD']; $PgHost = $DotEnv['DB_HOST'] ?? 'localhost'; $PgUser = $DotEnv['DB_USER'] ?? 'defisenligne'; $PgDb = $DotEnv['DB_NAME'] ?? 'qui_perd'; $PgPort = $DotEnv['DB_PORT'] ?? '5432'
$Suffix = (Get-Date -Format 'HHmmss')

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
  $raw = if ($r.RawContentStream) { [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) } else { [string]$r.Content }
  $json = $null
  if ($raw) { try { $json = $raw | ConvertFrom-Json -Depth 30 } catch { $json = $null } }
  return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $json; Raw = $raw }
}
# Pilotage de la doublure : bascule l'état constaté, puis (sauf `webhook=non`) notifie le backend.
function Pilote([string]$Token, [string]$Etat, [string]$Requete = '') {
  $u = "$Stub/_recette/$Token/$Etat"
  if ($Requete) { $u += "?$Requete" }
  try { return Invoke-RestMethod -Uri $u -Method POST -TimeoutSec 20 } catch { return $null }
}
function Sql([string]$q) { $out = & psql -h $PgHost -p $PgPort -U $PgUser -d $PgDb -At -c $q 2>&1; return (@($out | ForEach-Object { "$_" }) -join "`n").Trim() }
function Redis([string]$cmd) {
  $c = [System.Net.Sockets.TcpClient]::new('127.0.0.1', 6379)
  $s = $c.GetStream(); $w = [System.IO.StreamWriter]::new($s); $w.NewLine = "`r`n"; $w.AutoFlush = $true
  $w.WriteLine($cmd); Start-Sleep -Milliseconds 200
  $buf = New-Object byte[] 65536; $n = $s.Read($buf, 0, $buf.Length); $c.Close()
  return [Text.Encoding]::UTF8.GetString($buf, 0, $n)
}
function Solde([string]$tok) { [decimal](Api GET '/portefeuille' -Token $tok).Body.soldeDisponible }
# Le crédit passe par le webhook puis par une vérification HTTP : on laisse un court délai
# à la goroutine, sans jamais transformer l'attente en boucle de sondage métier.
function AttendreStatut([string]$paiementId, [string]$attendu, [int]$secondes = 15) {
  $limite = (Get-Date).AddSeconds($secondes)
  do {
    $s = Sql "select statut from paiements where id='$paiementId'"
    if ($s -eq $attendu) { return $s }
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $limite)
  return $s
}

# ------------------------------------------------------------------ 0. Préalables
Section '0. Préalables — API, doublure, configuration'
$r = Api GET '/sante'
Check 'API en ligne (postgres + redis ok)' ($r.Status -eq 200 -and $r.Body.postgres -eq 'ok' -and $r.Body.redis -eq 'ok') $r.Raw
$stubOk = $false
try { Invoke-RestMethod "$Stub/_recette/transactions" -TimeoutSec 5 | Out-Null; $stubOk = $true } catch { $stubOk = $false }
Check 'doublure MoneyFusion joignable sur 127.0.0.1:8099' $stubOk 'lancer : .\defisenligne-stub-fusion.exe -port 8099'
if (-not $stubOk) { Write-Host "`nDoublure absente : parcours interrompu." -ForegroundColor Red; exit 1 }
if ($DotEnv['FUSIONMONEY_API_URL'] -notlike '*127.0.0.1:8099*') {
  Write-Host "`nCe parcours ne s'exécute que contre la doublure : FUSIONMONEY_API_URL vise actuellement la vraie passerelle." -ForegroundColor Yellow
  Write-Host "  Pour le lancer : FUSIONMONEY_API_URL=http://127.0.0.1:8099/defisenligne/paiement puis redémarrer l'API." -ForegroundColor Yellow
  exit 2
}
Check 'FUSIONMONEY_API_URL sans sous-domaine www. (certificat auto-signé)' (-not ($DotEnv['FUSIONMONEY_API_URL'] -match '://www\.'))

# ------------------------------------------------------------------ 1. Catalogue public
Section '1. GET /paiements/prestataires — seulement l''activé ET le configuré'
$r = Api GET '/paiements/prestataires'
Check 'route publique (sans jeton) -> 200' ($r.Status -eq 200) $r.Raw
$presta = @($r.Body)
Check 'réponse : tableau JSON' ($null -ne $r.Body -and $r.Raw.TrimStart().StartsWith('[')) $r.Raw
$fusion = $presta | Where-Object code -eq 'fusionmoney'
Check 'MoneyFusion listé (URL marchand configurée)' ($null -ne $fusion) (($presta | ForEach-Object code) -join ',')
Check 'MoneyFusion : libellé et numeroRequis=true' ($fusion.libelle -eq 'MoneyFusion' -and $fusion.numeroRequis -eq $true) $r.Raw
# Plancher de la passerelle (200 F chez MoneyFusion, constaté contre la vraie API) : sans
# lui, un dépôt de 100 F partirait dans le vide et resterait « en attente » pour toujours.
Check 'MoneyFusion : montantMinimum publié (200)' ($fusion.montantMinimum -eq 200) $r.Raw
$ligdi = $presta | Where-Object code -eq 'ligdicash'
$ligdiConfigure = ($DotEnv['LIGDICASH_API_KEY']) -and ($DotEnv['LIGDICASH_API_TOKEN'])
Check 'LigdiCash absent tant qu''aucune clé n''est configurée' (($null -ne $ligdi) -eq [bool]$ligdiConfigure) ("configuré=$ligdiConfigure listé=" + ($null -ne $ligdi))
Check 'aucun secret dans la réponse (ni URL marchand, ni clé)' (-not ($r.Raw -match 'apiUrl|api_url|token|cle|key|8099')) $r.Raw

# ------------------------------------------------------------------ 2. Un joueur
Section '2. Joueur de recette'
$J = @{ nomUtilisateur = "payeur_$Suffix"; email = "payeur_$Suffix@test.local"; motDePasse = 'Secret123!'; telephone = '+2250700009001'; pays = 'Côte d''Ivoire' }
$rJ = Api POST '/auth/inscription' $J
Check 'inscription -> 201' ($rJ.Status -eq 201 -and $rJ.Body.jeton) $rJ.Raw
$T = $rJ.Body.jeton; $UID = $rJ.Body.utilisateur.id
$code = ''
if ((Redis "HGET verif:email:$UID code") -match '(\d{6})') { $code = $Matches[1] }
$r = Api POST '/auth/verification-email' @{ code = $code } -Token $T
Check 'adresse confirmée -> 200' ($r.Status -eq 200) $r.Raw
$soldeDepart = Solde $T
Check 'solde disponible initial = 0' ($soldeDepart -eq 0) "solde=$soldeDepart"

# ------------------------------------------------------------------ 3. Refus côté backend
Section '3. Refus : prestataire non configuré, numéro manquant'
$r = Api POST '/paiements/depot' @{ montant = 5000; prestataire = 'ligdicash' } -Token $T
if ($ligdiConfigure) {
  Check 'LigdiCash configuré : le dépôt n''est pas refusé pour cause de configuration' ($r.Status -ne 400 -or -not ($r.Body.erreur -match 'indisponible')) $r.Raw
}
else {
  Check 'dépôt LigdiCash non configuré -> 400 « indisponible »' ($r.Status -eq 400) $r.Raw
}
$r = Api POST '/paiements/depot' @{ montant = 5000; prestataire = 'inconnu' } -Token $T
Check 'prestataire inconnu -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/paiements/depot' @{ montant = 5000; prestataire = 'fusionmoney' } -Token $T
Check 'MoneyFusion sans numéro -> 400 avec details.numero' ($r.Status -eq 400 -and $r.Body.details.numero) $r.Raw
$r = Api POST '/paiements/depot' @{ montant = 150; prestataire = 'fusionmoney'; numero = '+2250700009001' } -Token $T
Check 'sous le plancher de la passerelle (150 < 200) -> 400 avec details.montant' ($r.Status -eq 400 -and $r.Body.details.montant) $r.Raw
Check 'aucun paiement créé par une demande refusée' ((Sql "select count(*) from paiements where utilisateur_id='$UID'") -eq '0') 'table paiements vide pour ce joueur'
$r = Api POST '/paiements/depot' @{ montant = 5000; prestataire = 'fusionmoney'; numero = '+2250700009001' }
Check 'dépôt sans jeton -> 401' ($r.Status -eq 401) $r.Raw

# ------------------------------------------------------------------ 4. Création du paiement
Section '4. Création du paiement — aucun fonds déplacé'
$r = Api POST '/paiements/depot' @{ montant = 5000; prestataire = 'fusionmoney'; numero = '+2250700009001' } -Token $T
Check 'POST /paiements/depot -> 200/201' ($r.Status -in 200, 201) $r.Raw
$P1 = $r.Body.paiement.id
Check 'paiement créé en_attente' ($r.Body.paiement.statut -eq 'en_attente') $r.Raw
Check 'urlPaiement renvoyée par le backend (page hébergée)' ($r.Body.urlPaiement -like "$Stub/paiement/*") $r.Body.urlPaiement
Check 'la réponse ne divulgue pas l''URL d''API du marchand' (-not ($r.Raw -match 'defisenligne/paiement')) $r.Raw
$tok1 = Sql "select reference_prestataire from paiements where id='$P1'"
Check 'token du prestataire stocké (reference_prestataire)' ($tok1 -like 'stub-*') "token=$tok1"
Check 'solde inchangé à la création' ((Solde $T) -eq $soldeDepart) "solde=$(Solde $T)"
Check 'aucune transaction de portefeuille créée' ((Sql "select count(*) from transactions_portefeuilles t join portefeuilles pf on pf.id=t.portefeuille_id where pf.utilisateur_id='$UID'") -eq '0')
$tr = Invoke-RestMethod "$Stub/_recette/transactions"
$vueStub = $tr | Where-Object token -eq $tok1
Check 'la doublure a bien reçu totalPrice=5000 et le numéro' ($vueStub.total -eq 5000 -and $vueStub.numero -eq '+2250700009001') ($vueStub | ConvertTo-Json -Compress)
Check 'la doublure a reçu notre référence interne (personal_Info)' ($vueStub.reference -like 'PAY-*') $vueStub.reference
# Le joueur doit revenir sur le SITE, pas sur l'API : APP_BASE_URL désigne le backend,
# un return_url pointé dessus renverrait le payeur sur un 404 juste après avoir payé.
$site = ($DotEnv['SITE_URL'] ?? $DotEnv['CORS_ORIGIN']).TrimEnd('/')
Check 'return_url pointe le frontend, route /joueur/portefeuille' ($vueStub.retour -like "$site/joueur/portefeuille?*") $vueStub.retour
Check 'return_url porte la référence du paiement' ($vueStub.retour -like '*paiement=retour*' -and $vueStub.retour -like "*ref=$($vueStub.reference)*") $vueStub.retour
$page = ''
try { $page = (Invoke-WebRequest $r.Body.urlPaiement -TimeoutSec 10).Content } catch { $page = '' }
Check 'l''URL de paiement s''ouvre (page hébergée du prestataire)' ($page -match 'Doublure MoneyFusion')

# ------------------------------------------------------------------ 5. Le webhook ne fait pas foi
Section '5. Un webhook « paid » sur une transaction « pending » ne crédite rien'
$rep = Pilote $tok1 'pending' 'annonce=paid'
Check 'webhook menteur accepté par le backend (200, réponse immédiate)' ($rep.webhookCode -eq 200) ($rep | ConvertTo-Json -Compress)
Start-Sleep -Seconds 3
Check 'paiement TOUJOURS en_attente (paiementNotif fait foi)' ((Sql "select statut from paiements where id='$P1'") -eq 'en_attente')
Check 'solde toujours inchangé' ((Solde $T) -eq $soldeDepart) "solde=$(Solde $T)"
$n = Sql "select count(*) from paiements_evenements where prestataire='fusionmoney'"
Check 'le webhook est archivé même quand il ne conclut rien' ([int]$n -ge 1) "événements=$n"

# ------------------------------------------------------------------ 6. Paiement réussi
Section '6. « paid » — crédit brut (Montant NET + frais)'
$rep = Pilote $tok1 'paid'
Check 'doublure : état paid, webhook remis (HTTP 200)' ($rep.statut -eq 'paid' -and $rep.webhookCode -eq 200) ($rep | ConvertTo-Json -Compress)
Check 'doublure : Montant NET 4950 + frais 50 (le total payé vaut 5000)' ($rep.montantNet -eq 4950 -and $rep.frais -eq 50)
$statut = AttendreStatut $P1 'reussi'
Check 'paiement passé à reussi' ($statut -eq 'reussi') "statut=$statut"
Check 'paiement marqué traité (verrou d''idempotence)' ((Sql "select traite::text from paiements where id='$P1'") -eq 'true')
$soldeApres = Solde $T
Check 'solde crédité du BRUT 5000, pas du net 4950' (($soldeApres - $soldeDepart) -eq 5000) "avant=$soldeDepart après=$soldeApres"
Check 'opérateur constaté enregistré' ((Sql "select operateur from paiements where id='$P1'") -eq 'MTN CI')
$n = Sql "select count(*) from transactions_portefeuilles t join portefeuilles pf on pf.id=t.portefeuille_id where pf.utilisateur_id='$UID' and t.type='depot'"
Check 'une seule transaction de dépôt' ($n -eq '1') "transactions=$n"
$n = Sql "select count(*) from notifications where utilisateur_id='$UID' and type='paiement_confirme'"
Check 'notification paiement_confirme émise' ([int]$n -ge 1) "notifications=$n"

# ------------------------------------------------------------------ 7. Idempotence
Section '7. Rejeu du webhook — aucun double crédit'
$null = Pilote $tok1 'paid'
$null = Pilote $tok1 'paid'
Start-Sleep -Seconds 3
Check 'solde inchangé après deux rejeux' ((Solde $T) -eq $soldeApres) "solde=$(Solde $T)"
$n = Sql "select count(*) from transactions_portefeuilles t join portefeuilles pf on pf.id=t.portefeuille_id where pf.utilisateur_id='$UID' and t.type='depot'"
Check 'toujours une seule transaction de dépôt' ($n -eq '1') "transactions=$n"
$n = Sql "select count(*) from paiements where reference_prestataire='$tok1'"
Check 'toujours un seul paiement pour ce token' ($n -eq '1')

# ------------------------------------------------------------------ 8. Montants en francs entiers
Section '8. Montant décimal refusé — pas d''arrondi silencieux'
# Un montant fractionnaire ferait payer 101 au joueur (MoneyFusion n'accepte qu'un
# totalPrice entier) pour n'en créditer que 100,6 : le backend refuse à la porte.
$r = Api POST '/paiements/depot' @{ montant = 100.6; prestataire = 'fusionmoney'; numero = '+2250700009001' } -Token $T
Check 'dépôt de 100,6 -> 400 avec details.montant' ($r.Status -eq 400 -and $r.Body.details.montant) $r.Raw
Check 'aucun paiement créé pour un montant fractionnaire' ((Sql "select count(*) from paiements where utilisateur_id='$UID' and montant='100.6'") -eq '0')
$r = Api POST '/paiements/retrait' @{ montant = 500.5; prestataire = 'fusionmoney'; numero = '+2250700009001' } -Token $T
Check 'retrait de 500,5 -> 400 avec details.montant' ($r.Status -eq 400 -and $r.Body.details.montant) $r.Raw
$r = Api POST '/paiements/depot' @{ montant = 201; prestataire = 'fusionmoney'; numero = '+2250700009001' } -Token $T
Check 'dépôt de 201 accepté' ($r.Status -in 200, 201) $r.Raw
$P2 = $r.Body.paiement.id
$tok2 = Sql "select reference_prestataire from paiements where id='$P2'"
$vue2 = (Invoke-RestMethod "$Stub/_recette/transactions") | Where-Object token -eq $tok2
Check 'la doublure a reçu exactement 201' ($vue2.total -eq 201) "totalPrice=$($vue2.total)"
$avant = Solde $T
$null = Pilote $tok2 'paid'
$statut = AttendreStatut $P2 'reussi'
Check 'second dépôt réussi' ($statut -eq 'reussi') "statut=$statut"
Check 'solde crédité de 201 (Montant NET 199 + frais 2)' (((Solde $T) - $avant) -eq 201) "delta=$((Solde $T) - $avant)"

# ------------------------------------------------------------------ 9. Échec
Section '9. « failure » — dépôt clos en échec, aucun mouvement'
$r = Api POST '/paiements/depot' @{ montant = 2500; prestataire = 'fusionmoney'; numero = '+2250700009001' } -Token $T
$P3 = $r.Body.paiement.id
$tok3 = Sql "select reference_prestataire from paiements where id='$P3'"
$avant = Solde $T
$null = Pilote $tok3 'failure'
$statut = AttendreStatut $P3 'echoue'
Check 'paiement passé à echoue' ($statut -eq 'echoue') "statut=$statut"
Check 'solde inchangé (rien n''a été débité chez le joueur)' ((Solde $T) -eq $avant) "solde=$(Solde $T)"
$n = Sql "select count(*) from transactions_portefeuilles t join portefeuilles pf on pf.id=t.portefeuille_id where pf.utilisateur_id='$UID'"
Check 'aucune transaction de portefeuille supplémentaire' ($n -eq '2') "transactions=$n"
$n = Sql "select count(*) from notifications where utilisateur_id='$UID' and type='paiement_echoue'"
Check 'notification paiement_echoue émise' ([int]$n -ge 1) "notifications=$n"
$null = Pilote $tok3 'failure'
Start-Sleep -Seconds 2
Check 'rejeu d''un échec : toujours echoue, solde intact' ((Sql "select statut from paiements where id='$P3'") -eq 'echoue' -and (Solde $T) -eq $avant)

# ------------------------------------------------------------------ 10. « no paid » ne clôt rien
Section '10. « no paid » / « pending » ne clôturent jamais un paiement'
$r = Api POST '/paiements/depot' @{ montant = 1500; prestataire = 'fusionmoney'; numero = '+2250700009001' } -Token $T
$P4 = $r.Body.paiement.id
$tok4 = Sql "select reference_prestataire from paiements where id='$P4'"
$null = Pilote $tok4 'no paid'
Start-Sleep -Seconds 3
Check 'paiement « no paid » reste en_attente (un paiement tardif reste valide)' ((Sql "select statut from paiements where id='$P4'") -eq 'en_attente')
Check 'non marqué traité' ((Sql "select traite::text from paiements where id='$P4'") -eq 'false')

# ------------------------------------------------------------------ 11. Polling de secours
Section '11. Polling de secours — conclure sans webhook'
if ($SansPolling) {
  Write-Host '  (ignoré : -SansPolling)' -ForegroundColor DarkGray
}
else {
  $avant = Solde $T
  # Aucun webhook : seule la re-vérification programmée à la création (2 min) peut conclure.
  $null = Pilote $tok4 'paid' 'webhook=non'
  Check 'doublure passée à paid sans notifier le backend' ((Sql "select statut from paiements where id='$P4'") -eq 'en_attente')
  Write-Host '  attente de la re-vérification programmée (jusqu''à 3 min)…' -ForegroundColor DarkGray
  $statut = AttendreStatut $P4 'reussi' 200
  Check 'le worker a conclu seul : paiement reussi' ($statut -eq 'reussi') "statut=$statut"
  Check 'solde crédité de 1500 par le polling de secours' (((Solde $T) - $avant) -eq 1500) "delta=$((Solde $T) - $avant)"
}

# ------------------------------------------------------------------ 12. Robustesse
Section '12. Robustesse'
$r = Api POST '/paiements/callback-fusion' @{ tokenPay = 'stub-inexistant'; statut = 'paid' }
Check 'webhook sur un token inconnu -> 200 sans effet' ($r.Status -eq 200) $r.Raw
$r = Api POST '/paiements/callback-fusion' 'ceci-nest-pas-du-json'
Check 'webhook au corps illisible -> 200 (jamais de 500 vers le prestataire)' ($r.Status -eq 200) $r.Raw
$avant = Solde $T
Start-Sleep -Seconds 2
Check 'aucun crédit provoqué par ces webhooks' ((Solde $T) -eq $avant)
$r = Api GET '/paiements' -Token $T
Check 'la liste des paiements reste réservée à l''administration -> 403' ($r.Status -eq 403) $r.Raw

# ------------------------------------------------------------------ Bilan
$ok = @($script:Results | Where-Object OK).Count
$ko = @($script:Results | Where-Object { -not $_.OK }).Count
Write-Host "`n===================== BILAN =====================" -ForegroundColor Cyan
Write-Host ("Réussis : {0}   Échecs : {1}   Total : {2}" -f $ok, $ko, $script:Results.Count)
if ($ko -gt 0) {
  Write-Host "`nÉchecs :" -ForegroundColor Red
  $script:Results | Where-Object { -not $_.OK } | ForEach-Object { Write-Host ("  - {0} :: {1}" -f $_.Test, $_.Detail) -ForegroundColor Red }
  exit 1
}
Write-Host 'Parcours de paiement MoneyFusion : tout est vert.' -ForegroundColor Green
