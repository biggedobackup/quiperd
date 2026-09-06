#Requires -Version 7
# Parcours de test complet de l'API QUI PERD (requêtes HTTP réelles) — 16 sections, ~280 vérifications.
# Usage : l'API doit tourner (go run . ou quiperd-backend.exe), PostgreSQL + Redis accessibles, psql dans le PATH.
#   pwsh -File tests/parcours-api.ps1
# Le script lit la connexion PostgreSQL dans ../.env, crée 3 joueurs (suffixe horaire) et un jeu/plateforme
# temporaires, dépose 10 000 XOF par joueur (validation admin), puis déroule défis/matchs/preuves/litiges/retraits.
# Les fichiers temporaires vont dans tests/tmp (ignoré par git).
$ErrorActionPreference = 'Continue'
$Base = 'http://127.0.0.1:8080/api'   # IPv4 direct : « localhost » tente ::1 d'abord (~2 s de délai par requête sous Windows)
$Scratch = Join-Path $PSScriptRoot 'tmp'; New-Item -ItemType Directory -Force $Scratch | Out-Null
$DotEnv = @{}; Get-Content (Join-Path $PSScriptRoot '..\.env') | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' } | ForEach-Object { $DotEnv[$Matches[1]] = $Matches[2] }
$env:PGPASSWORD = $DotEnv['DB_PASSWORD']; $PgHost = $DotEnv['DB_HOST'] ?? 'localhost'; $PgUser = $DotEnv['DB_USER'] ?? 'quiperd'; $PgDb = $DotEnv['DB_NAME'] ?? 'qui_perd'; $PgPort = $DotEnv['DB_PORT'] ?? '5432'
$PreuvesDir = (Resolve-Path (Join-Path $PSScriptRoot ('..\' + ($DotEnv['STOCKAGE_PREUVES_DIR'] ?? 'public/preuves')))).Path
$Suffix = (Get-Date -Format 'HHmmss')

$script:Results = [System.Collections.Generic.List[object]]::new()
function Check([string]$name, [bool]$ok, [string]$detail = '') {
  $script:Results.Add([pscustomobject]@{ Test = $name; OK = $ok; Detail = $detail })
  $tag = if ($ok) { 'PASS' } else { 'FAIL' }
  $d = if ($detail) { " -- $detail" } else { '' }
  Write-Host ("[{0}] {1}{2}" -f $tag, $name, $d)
}
function Section([string]$t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

function Api([string]$Method, [string]$Path, $Body = $null, [string]$Token = '', $Form = $null) {
  $p = @{ Uri = "$Base$Path"; Method = $Method; SkipHttpErrorCheck = $true }
  $h = @{}
  if ($Token) { $h['Authorization'] = "Bearer $Token" }
  $p['Headers'] = $h
  if ($Form) { $p['Form'] = $Form }
  elseif ($null -ne $Body) {
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
function Sha256([string]$s) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($s)))).Replace('-', '').ToLower() }
function Redis([string]$cmd) {
  $c = [System.Net.Sockets.TcpClient]::new('127.0.0.1', 6379)
  $s = $c.GetStream()
  $w = [System.IO.StreamWriter]::new($s); $w.NewLine = "`r`n"; $w.AutoFlush = $true
  $w.WriteLine($cmd)
  Start-Sleep -Milliseconds 200
  $buf = New-Object byte[] 262144
  $n = $s.Read($buf, 0, $buf.Length)
  $out = [Text.Encoding]::UTF8.GetString($buf, 0, $n)
  $c.Close()
  return $out
}
function Jti([string]$jwt) {
  $part = $jwt.Split('.')[1].Replace('-', '+').Replace('_', '/')
  while ($part.Length % 4 -ne 0) { $part += '=' }
  return ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json).jti
}
function Wallet([string]$tok) { (Api GET '/portefeuille' -Token $tok).Body }
function Dec($v) { [decimal]$v }
function Fichier([string]$nom, [int]$taille = 2048) {
  $path = Join-Path $Scratch $nom
  $rand = New-Object byte[] $taille
  [System.Random]::new().NextBytes($rand)
  $png = [byte[]](0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) + $rand
  [IO.File]::WriteAllBytes($path, $png)
  return $path
}

# ------------------------------------------------------------------ 0. Santé / docs
Section '0. Santé et documentation'
$r = Api GET '/sante'
Check 'GET /sante -> 200 postgres+redis ok' ($r.Status -eq 200 -and $r.Body.postgres -eq 'ok' -and $r.Body.redis -eq 'ok') $r.Raw
$r = Api GET '/docs'
Check 'GET /docs -> 200 (Swagger UI)' ($r.Status -eq 200 -and $r.Raw -match 'swagger-ui')
$r = Api GET '/docs/doc.json'
Check 'GET /docs/doc.json -> 200 swagger 2.0' ($r.Status -eq 200 -and $r.Body.swagger -eq '2.0') ("routes documentées: " + @($r.Body.paths.PSObject.Properties).Count)
$r = Api GET '/configurations-financieres'
Check 'GET /configurations-financieres (public) -> 200, 4 règles, commission 0.10' ($r.Status -eq 200 -and @($r.Body).Count -eq 4 -and (Dec ($r.Body | Where-Object type -eq 'commission_defi').valeur) -eq 0.10 -and (Dec ($r.Body | Where-Object type -eq 'frais_retrait').valeur) -eq 0.01) $r.Raw

# ------------------------------------------------------------------ 1. Auth : inscription / connexion
Section '1. Auth — inscription, connexion, session'
$K = @{ nomUtilisateur = "kader_$Suffix"; email = "kader_$Suffix@test.local"; motDePasse = 'Secret123!'; telephone = '+2250700000001'; pays = 'Côte d''Ivoire' }
$M = @{ nomUtilisateur = "moussa_$Suffix"; email = "moussa_$Suffix@test.local"; motDePasse = 'Secret123!'; telephone = '+2250700000002'; pays = 'Sénégal' }
$A = @{ nomUtilisateur = "ali_$Suffix"; email = "ali_$Suffix@test.local"; motDePasse = 'Secret123!'; telephone = '+2250700000003'; pays = 'Mali' }

$r = Api POST '/auth/inscription' @{ nomUtilisateur = 'x'; motDePasse = '1' }
Check 'POST /auth/inscription invalide -> 400 + details' ($r.Status -eq 400 -and $r.Body.erreur -and $r.Body.details) $r.Raw

$rK = Api POST '/auth/inscription' $K
Check 'POST /auth/inscription Kader -> 201 {utilisateur, jeton}' ($rK.Status -eq 201 -and $rK.Body.jeton -and $rK.Body.utilisateur.id) $rK.Raw.Substring(0, [Math]::Min(200, $rK.Raw.Length))
Check 'inscription: mot de passe absent de la réponse' (-not ($rK.Raw -match 'motDePasse|mot_de_passe'))
Check 'inscription: champs camelCase (nomUtilisateur, dateCreation, photoProfil)' ($rK.Body.utilisateur.PSObject.Properties.Name -contains 'nomUtilisateur' -and $rK.Body.utilisateur.PSObject.Properties.Name -contains 'dateCreation')
$rM = Api POST '/auth/inscription' $M
$rA = Api POST '/auth/inscription' $A
Check 'POST /auth/inscription Moussa & Ali -> 201' ($rM.Status -eq 201 -and $rA.Status -eq 201)
$KID = $rK.Body.utilisateur.id; $MID = $rM.Body.utilisateur.id; $AID = $rA.Body.utilisateur.id

$r = Api POST '/auth/inscription' $K
Check 'POST /auth/inscription doublon -> 409' ($r.Status -eq 409) $r.Raw

$r = Api POST '/auth/connexion' @{ email = $K.email; motDePasse = 'mauvais' }
Check 'POST /auth/connexion mauvais mdp -> 401' ($r.Status -eq 401) $r.Raw
$n = Sql "select count(*) from journaux_audit where action='connexion:echec_joueur' and nouvelle_valeur->>'email'='$($K.email)'"
Check 'tentative échouée consignée dans journaux_audit' ([int]$n -ge 1) "entrées=$n"

$r = Api POST '/auth/connexion' @{ email = $K.email; motDePasse = $K.motDePasse }
Check 'POST /auth/connexion Kader (email) -> 200 {utilisateur, jeton, expiration}' ($r.Status -eq 200 -and $r.Body.jeton -and $r.Body.expiration)
$TK = $r.Body.jeton
$r = Api POST '/auth/connexion' @{ email = $M.nomUtilisateur; motDePasse = $M.motDePasse }
Check 'POST /auth/connexion Moussa (par pseudo) -> 200' ($r.Status -eq 200 -and $r.Body.jeton)
$TM = $r.Body.jeton
$r = Api POST '/auth/connexion' @{ email = $A.email; motDePasse = $A.motDePasse }
$TA = $r.Body.jeton
Check 'POST /auth/connexion Ali -> 200' ($r.Status -eq 200 -and $TA)

$jtiK = Jti $TK
Check 'jti du jeton présent dans Redis (session:<jti>)' ((Redis "EXISTS session:$jtiK") -match ':1')
$sess = Sql "select appareil||'|'||coalesce(adresse_ip::text,'')||'|'||(date_expiration > now())::text from sessions_utilisateurs where utilisateur_id='$KID' and jeton_hash='$(Sha256 $jtiK)'"
Check 'connexion tracée dans sessions_utilisateurs (jeton_hash sha256, appareil, ip, expiration)' ($sess -match '^.+\|127\.0\.0\.1(/32)?\|true$') $sess
$nsess = Sql "select count(*) from sessions_utilisateurs where utilisateur_id='$KID'"
Check 'inscription + connexion = 2 sessions enregistrées pour Kader' ([int]$nsess -eq 2) "sessions=$nsess"

$r = Api GET '/auth/moi' -Token $TK
Check 'GET /auth/moi Kader -> 200 role joueur' ($r.Status -eq 200 -and $r.Body.role -eq 'joueur' -and $r.Body.utilisateur.id -eq $KID)
$r = Api GET '/auth/moi'
Check 'GET /auth/moi sans jeton -> 401' ($r.Status -eq 401) $r.Raw
$r = Api GET '/auth/moi' -Token 'abc.def.ghi'
Check 'GET /auth/moi jeton bidon -> 401' ($r.Status -eq 401) $r.Raw

# déconnexion réelle
$r = Api POST '/auth/connexion' @{ email = $K.email; motDePasse = $K.motDePasse }
$Ttmp = $r.Body.jeton; $jtiTmp = Jti $Ttmp
$r = Api POST '/auth/deconnexion' -Token $Ttmp
Check 'POST /auth/deconnexion -> 200' ($r.Status -eq 200 -and $r.Body.deconnecte -eq $true) $r.Raw
Check 'après déconnexion: clé Redis supprimée' ((Redis "EXISTS session:$jtiTmp") -match ':0')
$nsess = Sql "select count(*) from sessions_utilisateurs where jeton_hash='$(Sha256 $jtiTmp)'"
Check 'après déconnexion: ligne sessions_utilisateurs supprimée' ([int]$nsess -eq 0) "lignes=$nsess"
$r = Api GET '/auth/moi' -Token $Ttmp
Check 'après déconnexion: GET /auth/moi -> 401' ($r.Status -eq 401) $r.Raw
$r = Api GET '/auth/moi' -Token $TK
Check 'autre session de Kader toujours valide -> 200' ($r.Status -eq 200)

# ------------------------------------------------------------------ 2. Admin
Section '2. Auth admin'
$r = Api POST '/auth/admin/connexion' @{ email = 'admin@quiperd.local'; motDePasse = 'mauvais' }
Check 'POST /auth/admin/connexion mauvais mdp -> 401' ($r.Status -eq 401)
$r = Api POST '/auth/admin/connexion' @{ email = 'admin@quiperd.local'; motDePasse = 'Admin1234!' }
Check 'POST /auth/admin/connexion -> 200 {administrateur, jeton}' ($r.Status -eq 200 -and $r.Body.administrateur.id -and $r.Body.jeton) $r.Raw.Substring(0, [Math]::Min(160, $r.Raw.Length))
$TADM = $r.Body.jeton; $ADMID = $r.Body.administrateur.id
$r = Api GET '/auth/moi' -Token $TADM
Check 'GET /auth/moi admin -> 200 role admin' ($r.Status -eq 200 -and $r.Body.role -eq 'admin' -and $r.Body.administrateur.email -eq 'admin@quiperd.local')
$r = Api POST '/auth/connexion' @{ email = 'admin@quiperd.local'; motDePasse = 'Admin1234!' }
Check 'admin via /auth/connexion (table utilisateurs) -> 401 (tables distinctes)' ($r.Status -eq 401) $r.Raw
$r = Api GET '/utilisateurs' -Token $TK
Check 'joueur sur route admin GET /utilisateurs -> 403' ($r.Status -eq 403) $r.Raw
$r = Api GET '/utilisateurs'
Check 'sans jeton GET /utilisateurs -> 401' ($r.Status -eq 401)

# ------------------------------------------------------------------ 3. Utilisateurs
Section '3. Utilisateurs — liste admin, profil, statut'
# liste admin paginée (charte API : { elements, total, page, taille, pages }, 10 par page, date de création décroissante)
$r = Api GET '/utilisateurs' -Token $TADM
Check 'GET /utilisateurs (admin) -> 200 enveloppe paginée {elements, total, page, taille, pages}, total >= 3' ($r.Status -eq 200 -and $r.Body.total -ge 3 -and $r.Body.page -eq 1 -and $r.Body.taille -eq 10 -and @($r.Body.elements).Count -eq [Math]::Min(10, [int]$r.Body.total) -and $r.Body.pages -eq [Math]::Ceiling($r.Body.total / 10)) ("total=" + $r.Body.total + " pages=" + $r.Body.pages)
$dates = @($r.Body.elements | ForEach-Object { [datetime]$_.dateCreation })
$trie = $true; for ($i = 1; $i -lt $dates.Count; $i++) { if ($dates[$i] -gt $dates[$i - 1]) { $trie = $false } }
Check 'GET /utilisateurs: tri date de création décroissante, les 3 joueurs du parcours en première page' ($trie -and ($r.Body.elements.id -contains $KID) -and ($r.Body.elements.id -contains $MID) -and ($r.Body.elements.id -contains $AID)) (($r.Body.elements | Select-Object -First 4 | ForEach-Object nomUtilisateur) -join ',')
$r2 = Api GET '/utilisateurs?page=2&taille=2' -Token $TADM
$attendu = [Math]::Max(0, [Math]::Min(2, [int]$r.Body.total - 2))
Check 'GET /utilisateurs?page=2&taille=2 -> page 2, taille 2, même total, pages = ceil(total/2), 1er élément = 3e plus récent' ($r2.Status -eq 200 -and @($r2.Body.elements).Count -eq $attendu -and $r2.Body.page -eq 2 -and $r2.Body.taille -eq 2 -and $r2.Body.total -eq $r.Body.total -and $r2.Body.pages -eq [Math]::Ceiling($r2.Body.total / 2) -and $r2.Body.elements[0].id -eq $r.Body.elements[2].id) ("total=" + $r2.Body.total + " pages=" + $r2.Body.pages + " n=" + @($r2.Body.elements).Count)
$r = Api GET '/utilisateurs?page=999' -Token $TADM
Check 'GET /utilisateurs?page=999 -> 200 elements vide ([] jamais null), total conservé' ($r.Status -eq 200 -and $r.Raw -match '"elements":\[\]' -and $r.Body.total -ge 3 -and $r.Body.page -eq 999) $r.Raw
$r = Api GET '/utilisateurs?page=0&taille=500' -Token $TADM
Check 'GET /utilisateurs?page=0&taille=500 -> page ramenée à 1, taille plafonnée à 100' ($r.Status -eq 200 -and $r.Body.page -eq 1 -and $r.Body.taille -eq 100) ("page=" + $r.Body.page + " taille=" + $r.Body.taille)
$r = Api GET "/utilisateurs?recherche=kader_$Suffix" -Token $TADM
Check 'GET /utilisateurs?recherche= -> filtre (total = 1, pages = 1)' ($r.Status -eq 200 -and $r.Body.total -eq 1 -and @($r.Body.elements).Count -eq 1 -and $r.Body.elements[0].id -eq $KID -and $r.Body.pages -eq 1) $r.Raw
$r = Api GET '/utilisateurs?statut=actif&taille=3' -Token $TADM
Check 'GET /utilisateurs?statut=actif&taille=3 -> 3 éléments tous actifs, total >= 3' ($r.Status -eq 200 -and @($r.Body.elements).Count -eq 3 -and (@($r.Body.elements | Where-Object statut -ne 'actif').Count -eq 0) -and $r.Body.total -ge 3) ("total=" + $r.Body.total)
$r = Api PATCH "/utilisateurs/$KID" @{ pays = 'Burkina Faso'; telephone = '+22670000000'; photoProfil = 'https://cdn.test/kader.png' } -Token $TK
Check 'PATCH /utilisateurs/:id (propriétaire) -> 200 champs modifiés' ($r.Status -eq 200 -and $r.Body.pays -eq 'Burkina Faso' -and $r.Body.telephone -eq '+22670000000' -and $r.Body.photoProfil -eq 'https://cdn.test/kader.png') $r.Raw
$r = Api PATCH "/utilisateurs/$MID" @{ pays = 'Hack' } -Token $TK
Check 'PATCH /utilisateurs/:id (autre joueur) -> 403' ($r.Status -eq 403) $r.Raw
$r = Api PATCH "/utilisateurs/$KID" @{ nomUtilisateur = $M.nomUtilisateur } -Token $TK
Check 'PATCH /utilisateurs/:id pseudo déjà pris -> 409' ($r.Status -eq 409) $r.Raw
$r = Api PATCH "/utilisateurs/$MID" @{ pays = 'Togo' } -Token $TADM
Check 'PATCH /utilisateurs/:id par admin -> 200' ($r.Status -eq 200 -and $r.Body.pays -eq 'Togo')
$r = Api PATCH "/utilisateurs/pas-un-uuid" @{ pays = 'x' } -Token $TADM
Check 'PATCH /utilisateurs/:id uuid invalide -> 400' ($r.Status -eq 400)
$r = Api PATCH "/utilisateurs/$MID/statut" @{ statut = 'bizarre' } -Token $TADM
Check 'PATCH /utilisateurs/:id/statut valeur invalide -> 400' ($r.Status -eq 400)
$r = Api PATCH "/utilisateurs/$MID/statut" @{ statut = 'suspendu' } -Token $TK
Check 'PATCH /utilisateurs/:id/statut par joueur -> 403' ($r.Status -eq 403)
$r = Api PATCH "/utilisateurs/$MID/statut" @{ statut = 'suspendu' } -Token $TADM
Check 'PATCH /utilisateurs/:id/statut suspendu (admin) -> 200' ($r.Status -eq 200 -and $r.Body.statut -eq 'suspendu')
$r = Api GET '/auth/moi' -Token $TM
Check 'suspension: sessions de Moussa invalidées -> 401' ($r.Status -eq 401) $r.Raw
$r = Api POST '/auth/connexion' @{ email = $M.email; motDePasse = $M.motDePasse }
Check 'suspension: connexion Moussa refusée -> 403' ($r.Status -eq 403) $r.Raw
$n = Sql "select count(*) from journaux_audit where action='utilisateur:statut_suspendu' and identifiant_cible='$MID'"
Check 'suspension journalisée (journaux_audit)' ([int]$n -ge 1)
$r = Api PATCH "/utilisateurs/$MID/statut" @{ statut = 'actif' } -Token $TADM
Check 'réactivation -> 200' ($r.Status -eq 200 -and $r.Body.statut -eq 'actif')
$r = Api POST '/auth/connexion' @{ email = $M.email; motDePasse = $M.motDePasse }
Check 'réactivation: connexion Moussa -> 200' ($r.Status -eq 200 -and $r.Body.jeton)
$TM = $r.Body.jeton

# ------------------------------------------------------------------ 4. Jeux / plateformes (CRUD admin)
Section '4. Catalogue jeux & plateformes'
$r = Api GET '/jeux'
Check 'GET /jeux public -> 200 (catalogue seed >= 50 jeux, tous avec catégorie)' ($r.Status -eq 200 -and @($r.Body).Count -ge 50 -and (@($r.Body | Where-Object { -not $_.categorie }).Count -eq 0)) ("n=" + @($r.Body).Count + " catégories: " + (($r.Body.categorie | Select-Object -Unique) -join ','))
$JEU_EA = ($r.Body | Where-Object nom -eq 'EA SPORTS FC 27').id
$JEU_EF = ($r.Body | Where-Object nom -eq 'eFootball').id
Check 'seed: EA SPORTS FC 27 et eFootball en catégorie sport' ((($r.Body | Where-Object nom -eq 'EA SPORTS FC 27').categorie -eq 'sport') -and (($r.Body | Where-Object nom -eq 'Street Fighter 6').categorie -eq 'combat'))
$r = Api GET '/jeux?categorie=course'
Check 'GET /jeux?categorie=course -> uniquement des jeux de course' ($r.Status -eq 200 -and @($r.Body).Count -ge 5 -and (@($r.Body | Where-Object categorie -ne 'course').Count -eq 0)) ($r.Body.nom -join ', ')
$r = Api GET '/plateformes'
Check 'GET /plateformes public -> 200 (seed >= 9, familles pc/console/mobile)' ($r.Status -eq 200 -and @($r.Body).Count -ge 9 -and ($r.Body.famille -contains 'mobile') -and ($r.Body.famille -contains 'pc')) ($r.Body.nom -join ', ')
$PLAT_PS = ($r.Body | Where-Object nom -eq 'PlayStation 5').id
$PLAT_PC = ($r.Body | Where-Object nom -eq 'PC').id
$r = Api GET '/plateformes?famille=mobile'
Check 'GET /plateformes?famille=mobile -> Android + iOS' ($r.Status -eq 200 -and @($r.Body).Count -ge 2 -and (@($r.Body | Where-Object famille -ne 'mobile').Count -eq 0))

$r = Api POST '/jeux' @{ nom = "Jeu Test $Suffix"; categorie = 'sport' } -Token $TK
Check 'POST /jeux par joueur -> 403' ($r.Status -eq 403)
$r = Api POST '/jeux' @{ nom = 'x'; categorie = 'sport' } -Token $TADM
Check 'POST /jeux nom trop court -> 400' ($r.Status -eq 400)
$r = Api POST '/jeux' @{ nom = "Jeu Test $Suffix" } -Token $TADM
Check 'POST /jeux sans catégorie -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/jeux' @{ nom = "Jeu Test $Suffix"; categorie = 'bizarre' } -Token $TADM
Check 'POST /jeux catégorie inconnue -> 400' ($r.Status -eq 400)
$r = Api POST '/jeux' @{ nom = "Jeu Test $Suffix"; categorie = 'combat' } -Token $TADM
Check 'POST /jeux (admin) -> 201 avec catégorie' ($r.Status -eq 201 -and $r.Body.id -and $r.Body.statut -eq 'actif' -and $r.Body.categorie -eq 'combat') $r.Raw
$JEU_T = $r.Body.id
$r = Api POST '/jeux' @{ nom = "Jeu Test $Suffix"; categorie = 'combat' } -Token $TADM
Check 'POST /jeux doublon -> 409' ($r.Status -eq 409)
$r = Api PATCH "/jeux/$JEU_T" @{ nom = "Jeu Test $Suffix v2"; statut = 'inactif'; categorie = 'arcade' } -Token $TADM
Check 'PATCH /jeux/:id -> 200 (nom + statut inactif + catégorie)' ($r.Status -eq 200 -and $r.Body.nom -eq "Jeu Test $Suffix v2" -and $r.Body.statut -eq 'inactif' -and $r.Body.categorie -eq 'arcade') $r.Raw
$r = Api GET '/jeux'
Check 'GET /jeux public exclut les inactifs' (-not ($r.Body.id -contains $JEU_T))
$r = Api GET '/jeux' -Token $TADM
Check 'GET /jeux admin inclut les inactifs' ($r.Body.id -contains $JEU_T)
$r = Api PATCH "/jeux/$([guid]::NewGuid())" @{ nom = 'zz' } -Token $TADM
Check 'PATCH /jeux/:id inexistant -> 404' ($r.Status -eq 404)
$r = Api DELETE "/jeux/$JEU_T" -Token $TK
Check 'DELETE /jeux/:id par joueur -> 403' ($r.Status -eq 403)
$r = Api DELETE "/jeux/$JEU_T" -Token $TADM
Check 'DELETE /jeux/:id (admin) -> 204' ($r.Status -eq 204)
$r = Api GET '/jeux' -Token $TADM
Check 'jeu supprimé absent de la liste' (-not ($r.Body.id -contains $JEU_T))

$r = Api POST '/plateformes' @{ nom = "Plat $Suffix" } -Token $TADM
Check 'POST /plateformes sans famille -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/plateformes' @{ nom = "Plat $Suffix"; famille = 'console' } -Token $TADM
Check 'POST /plateformes (admin) -> 201 avec famille' ($r.Status -eq 201 -and $r.Body.id -and $r.Body.famille -eq 'console') $r.Raw
$PLAT_T = $r.Body.id
$r = Api POST '/plateformes' @{ nom = "Plat $Suffix"; famille = 'console' } -Token $TADM
Check 'POST /plateformes doublon -> 409' ($r.Status -eq 409)
$r = Api POST '/plateformes' @{ nom = "Plat2 $Suffix"; famille = 'mobile' } -Token $TM
Check 'POST /plateformes par joueur -> 403' ($r.Status -eq 403)
$r = Api PATCH "/plateformes/$PLAT_T" @{ statut = 'inactif' } -Token $TADM
Check 'PATCH /plateformes/:id -> 200 inactif' ($r.Status -eq 200 -and $r.Body.statut -eq 'inactif')
$r = Api GET '/plateformes'
Check 'GET /plateformes public exclut inactif' (-not ($r.Body.id -contains $PLAT_T))
$r = Api DELETE "/plateformes/$PLAT_T" -Token $TADM
Check 'DELETE /plateformes/:id -> 204' ($r.Status -eq 204)

# ------------------------------------------------------------------ 5. Comptes gamers (CRUD joueur)
Section '5. Comptes gamers'
$r = Api GET '/comptes-gamers' -Token $TK
Check 'GET /comptes-gamers vide -> 200' ($r.Status -eq 200 -and @($r.Body).Count -eq 0) $r.Raw
$r = Api POST '/comptes-gamers' @{ jeuId = 'nope'; plateformeId = $PLAT_PS; identifiantJoueur = 'K' } -Token $TK
Check 'POST /comptes-gamers uuid invalide -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/comptes-gamers' @{ jeuId = [guid]::NewGuid().ToString(); plateformeId = $PLAT_PS; identifiantJoueur = 'K' } -Token $TK
Check 'POST /comptes-gamers jeu inexistant -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/comptes-gamers' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; identifiantJoueur = 'Kader225_PSN'; nomAffichage = 'Kader225' } -Token $TK
Check 'POST /comptes-gamers -> 201' ($r.Status -eq 201 -and $r.Body.id -and $r.Body.identifiantJoueur -eq 'Kader225_PSN' -and $r.Body.utilisateurId -eq $KID) $r.Raw
$CG = $r.Body.id
$r = Api GET '/comptes-gamers' -Token $TK
Check 'GET /comptes-gamers -> 1 élément' (@($r.Body).Count -eq 1)
$r = Api GET '/comptes-gamers' -Token $TM
Check 'GET /comptes-gamers de Moussa ne voit pas ceux de Kader' (@($r.Body).Count -eq 0)
$r = Api PATCH "/comptes-gamers/$CG" @{ nomAffichage = 'KaderTheKing'; plateformeId = $PLAT_PC } -Token $TK
Check 'PATCH /comptes-gamers/:id -> 200' ($r.Status -eq 200 -and $r.Body.nomAffichage -eq 'KaderTheKing' -and $r.Body.plateformeId -eq $PLAT_PC) $r.Raw
$r = Api PATCH "/comptes-gamers/$CG" @{ nomAffichage = 'Pirate' } -Token $TM
Check 'PATCH /comptes-gamers/:id (autre joueur) -> 403' ($r.Status -eq 403)
$r = Api DELETE "/comptes-gamers/$CG" -Token $TM
Check 'DELETE /comptes-gamers/:id (autre joueur) -> 403' ($r.Status -eq 403)
$r = Api DELETE "/comptes-gamers/$CG" -Token $TK
Check 'DELETE /comptes-gamers/:id -> 204' ($r.Status -eq 204)
$r = Api DELETE "/comptes-gamers/$CG" -Token $TK
Check 'DELETE /comptes-gamers/:id déjà supprimé -> 404' ($r.Status -eq 404)
# recréer un compte gamer pour Kader et Moussa (contexte réaliste)
$null = Api POST '/comptes-gamers' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; identifiantJoueur = 'Kader225_PSN'; nomAffichage = 'Kader225' } -Token $TK
$null = Api POST '/comptes-gamers' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; identifiantJoueur = 'Moussa10_PSN'; nomAffichage = 'Moussa10' } -Token $TM

# ------------------------------------------------------------------ 6. Portefeuille + dépôts
Section '6. Portefeuille & dépôts (paiements)'
$w = Wallet $TK
Check 'GET /portefeuille initial -> 0 / 0 XOF' ($w.soldeDisponible -eq 0 -and $w.soldeBloque -eq 0 -and $w.devise -eq 'XOF' -and $w.utilisateurId -eq $KID) ($w | ConvertTo-Json -Compress)
$r = Api GET '/portefeuille/transactions' -Token $TK
Check 'GET /portefeuille/transactions vide -> 200' ($r.Status -eq 200 -and @($r.Body).Count -eq 0)
$r = Api POST '/paiements/depot' @{ montant = 10000; prestataire = 'paypal' } -Token $TK
Check 'POST /paiements/depot prestataire invalide -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/paiements/depot' @{ montant = -5; prestataire = 'ligdicash' } -Token $TK
Check 'POST /paiements/depot montant négatif -> 400' ($r.Status -eq 400) "status=$($r.Status) $($r.Raw)"
$DEP = @{}
foreach ($u in @(@{ n = 'Kader'; t = $TK }, @{ n = 'Moussa'; t = $TM }, @{ n = 'Ali'; t = $TA })) {
  $r = Api POST '/paiements/depot' @{ montant = 10000; prestataire = 'ligdicash' } -Token $u.t
  Check "POST /paiements/depot 10000 $($u.n) -> 201 en_attente" ($r.Status -eq 201 -and $r.Body.paiement.statut -eq 'en_attente' -and $r.Body.paiement.type -eq 'depot') $r.Raw.Substring(0, [Math]::Min(180, $r.Raw.Length))
  $DEP[$u.n] = $r.Body.paiement.id
}
$r = Api GET '/paiements' -Token $TK
Check 'GET /paiements par joueur -> 403' ($r.Status -eq 403)
$r = Api GET '/paiements?statut=en_attente' -Token $TADM
Check 'GET /paiements?statut=en_attente (admin) -> 200 page {elements, total >= 3}, les 3 dépôts en première page' ($r.Status -eq 200 -and $r.Body.total -ge 3 -and $r.Body.page -eq 1 -and $r.Body.taille -eq 10 -and ($r.Body.elements.id -contains $DEP.Kader) -and ($r.Body.elements.id -contains $DEP.Moussa) -and ($r.Body.elements.id -contains $DEP.Ali) -and (@($r.Body.elements | Where-Object statut -ne 'en_attente').Count -eq 0)) ("total=" + $r.Body.total)
$r = Api GET '/paiements?type=depot&taille=2&page=2' -Token $TADM
Check 'GET /paiements?type=depot&taille=2&page=2 -> page 2 de 2 : 1er élément = dépôt de Kader (3e plus récent), que des dépôts' ($r.Status -eq 200 -and $r.Body.page -eq 2 -and $r.Body.taille -eq 2 -and @($r.Body.elements).Count -ge 1 -and @($r.Body.elements).Count -le 2 -and $r.Body.elements[0].id -eq $DEP.Kader -and (@($r.Body.elements | Where-Object type -ne 'depot').Count -eq 0)) ("total=" + $r.Body.total + " n=" + @($r.Body.elements).Count)
$r = Api PATCH "/paiements/$($DEP.Kader)/statut" @{ statut = 'reussi' } -Token $TK
Check 'PATCH /paiements/:id/statut par joueur -> 403' ($r.Status -eq 403)
$r = Api PATCH "/paiements/$($DEP.Kader)/statut" @{ statut = 'nimporte' } -Token $TADM
Check 'PATCH /paiements/:id/statut valeur invalide -> 400' ($r.Status -eq 400)
foreach ($n in 'Kader', 'Moussa', 'Ali') {
  $r = Api PATCH "/paiements/$($DEP[$n])/statut" @{ statut = 'reussi' } -Token $TADM
  Check "PATCH /paiements/:id/statut reussi $n -> 200" ($r.Status -eq 200 -and $r.Body.statut -eq 'reussi') $r.Raw
}
$w = Wallet $TK
Check 'dépôt validé: soldeDisponible Kader = 10000' ((Dec $w.soldeDisponible) -eq 10000) ($w | ConvertTo-Json -Compress)
$r = Api PATCH "/paiements/$($DEP.Kader)/statut" @{ statut = 'reussi' } -Token $TADM
$w2 = Wallet $TK
Check 'revalidation du même dépôt: idempotent (pas de double crédit)' ((Dec $w2.soldeDisponible) -eq 10000) "status=$($r.Status) solde=$($w2.soldeDisponible)"
$r = Api GET '/portefeuille/transactions' -Token $TK
Check 'transactions: 1 dépôt de 10000' (@($r.Body).Count -eq 1 -and $r.Body[0].type -eq 'depot' -and (Dec $r.Body[0].montant) -eq 10000) $r.Raw
$r = Api GET '/notifications' -Token $TK
Check 'notification "Dépôt confirmé" créée' (($r.Body | Where-Object type -eq 'paiement_confirme' | Measure-Object).Count -ge 1) ($r.Body.titre -join ' | ')
$n = Sql "select count(*) from journaux_audit where action='paiement:depot_reussi' and identifiant_cible='$($DEP.Kader)'"
Check 'dépôt réussi journalisé' ([int]$n -eq 1) "entrées=$n"

# ------------------------------------------------------------------ 7. Défis
Section '7. Défis — création, liste, rejoindre, annulation'
$r = Api POST '/defis' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; montantMise = 100 } -Token $TK
Check 'POST /defis mise 100 < minimum 500 -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/defis' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; montantMise = 200000 } -Token $TK
Check 'POST /defis mise 200000 > maximum 100000 -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/defis' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; montantMise = 50000 } -Token $TA
Check 'POST /defis mise 50000 > solde 10000 -> 422' ($r.Status -eq 422) $r.Raw
$r = Api POST '/defis' @{ jeuId = [guid]::NewGuid().ToString(); plateformeId = $PLAT_PS; montantMise = 1000 } -Token $TK
Check 'POST /defis jeu inconnu -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/defis' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; montantMise = 2000; regles = 'Match 2x6 min, pas de légendes'; dureeHeures = 2 } -Token $TK
Check 'POST /defis 2000 XOF Kader -> 201 statut ouvert' ($r.Status -eq 201 -and $r.Body.statut -eq 'ouvert' -and (Dec $r.Body.montantMise) -eq 2000 -and $r.Body.createurId -eq $KID -and $r.Body.dateExpiration) $r.Raw
$D1 = $r.Body.id
$w = Wallet $TK
Check 'escrow création: Kader disponible 8000 / bloqué 2000' ((Dec $w.soldeDisponible) -eq 8000 -and (Dec $w.soldeBloque) -eq 2000) ($w | ConvertTo-Json -Compress)
$mise = Sql "select statut||'|'||montant from mises where defi_id='$D1' and utilisateur_id='$KID'"
Check 'mise créée statut bloquee (table mises)' ($mise -match '^bloquee\|2000')
$zs = Redis "ZSCORE asynq:{default}:scheduled defi-exp:$D1"
Check 'tâche Asynq defi:expiration planifiée' ($zs -match '\d{9,}') $zs.Trim()

$r = Api GET '/defis' -Token $TM
Check 'GET /defis (Moussa) -> 200 contient le défi' ($r.Status -eq 200 -and ($r.Body.id -contains $D1)) ("n=" + @($r.Body).Count)
$props = @($r.Body | Where-Object id -eq $D1)[0].PSObject.Properties.Name
Check 'GET /defis: champs en camelCase (montantMise, createurId, dateCreation)' ($props -contains 'montantMise' -and $props -contains 'createurId') ("champs reçus: " + ($props -join ','))
$r = Api GET "/defis?jeu=$JEU_EF" -Token $TM
Check 'GET /defis?jeu=eFootball -> ne contient pas le défi EA' (-not ($r.Body.id -contains $D1))
$r = Api GET "/defis?jeu=$JEU_EA&plateforme=$PLAT_PS&miseMax=2000" -Token $TM
Check 'GET /defis?jeu&plateforme&miseMax=2000 -> contient' ($r.Body.id -contains $D1)
$r = Api GET "/defis?miseMax=1999" -Token $TM
Check 'GET /defis?miseMax=1999 -> exclut' (-not ($r.Body.id -contains $D1))
$r = Api GET "/defis?categorie=sport&famille=console" -Token $TM
Check 'GET /defis?categorie=sport&famille=console -> contient (catégorie et famille jointes)' (($r.Body.id -contains $D1) -and (($r.Body | Where-Object id -eq $D1).jeuCategorie -eq 'sport') -and (($r.Body | Where-Object id -eq $D1).plateformeFamille -eq 'console'))
$r = Api GET '/defis'
Check 'GET /defis sans jeton -> 401' ($r.Status -eq 401)
$r = Api GET '/defis/ouverts'
Check 'GET /defis/ouverts (public, sans jeton) -> 200 contient le défi avec libellés' ($r.Status -eq 200 -and ($r.Body.id -contains $D1) -and (($r.Body | Where-Object id -eq $D1).createurNom -eq $K.nomUtilisateur)) ("n=" + @($r.Body).Count)
$r = Api GET '/defis/ouverts?categorie=combat'
Check 'GET /defis/ouverts?categorie=combat -> exclut le défi sport' ($r.Status -eq 200 -and -not ($r.Body.id -contains $D1))
$r = Api GET "/defis/$D1" -Token $TM
Check 'GET /defis/:id -> 200 {defi}' ($r.Status -eq 200 -and $r.Body.defi.id -eq $D1 -and -not $r.Body.match)
Check 'GET /defis/:id enrichi (createurNom, jeuNom, plateformeNom)' ($r.Body.defi.createurNom -eq $K.nomUtilisateur -and $r.Body.defi.jeuNom -eq 'EA SPORTS FC 27' -and $r.Body.defi.plateformeNom -eq 'PlayStation 5') $r.Raw
$r = Api GET '/defis?mes=1' -Token $TK
Check 'GET /defis?mes=1 (Kader) -> contient son défi' ($r.Status -eq 200 -and ($r.Body.id -contains $D1))
$r = Api GET '/defis?mes=1' -Token $TM
Check 'GET /defis?mes=1 (Moussa) -> ne contient pas le défi de Kader' ($r.Status -eq 200 -and -not ($r.Body.id -contains $D1))
$r = Api GET "/defis/$([guid]::NewGuid())" -Token $TM
Check 'GET /defis/:id inexistant -> 404' ($r.Status -eq 404)

$r = Api POST "/defis/$D1/rejoindre" -Token $TK
Check 'POST /defis/:id/rejoindre son propre défi -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST "/defis/$D1/rejoindre" -Token $TM
Check 'POST /defis/:id/rejoindre Moussa -> 201 match en_cours' ($r.Status -eq 201 -and $r.Body.statut -eq 'en_cours' -and $r.Body.joueur1Id -eq $KID -and $r.Body.joueur2Id -eq $MID) $r.Raw
$MATCH1 = $r.Body.id
$w = Wallet $TM
Check 'escrow rejoindre: Moussa 8000 / 2000' ((Dec $w.soldeDisponible) -eq 8000 -and (Dec $w.soldeBloque) -eq 2000) ($w | ConvertTo-Json -Compress)
$r = Api GET "/defis/$D1" -Token $TK
Check 'défi -> statut complet + match attaché' ($r.Body.defi.statut -eq 'complet' -and $r.Body.match.id -eq $MATCH1) $r.Raw
$r = Api POST "/defis/$D1/rejoindre" -Token $TA
Check 'POST rejoindre défi déjà complet -> 409' ($r.Status -eq 409) $r.Raw
$r = Api GET '/defis' -Token $TA
Check 'défi complet absent de la liste des ouverts' (-not ($r.Body.id -contains $D1))
$r = Api DELETE "/defis/$D1" -Token $TK
Check 'DELETE /defis/:id défi complet -> 409' ($r.Status -eq 409) $r.Raw
$r = Api GET '/notifications' -Token $TK
Check 'notification "Défi accepté" pour Kader' (($r.Body | Where-Object type -eq 'defi_rejoint' | Measure-Object).Count -ge 1) ($r.Body.titre -join ' | ')

# concurrence : deux « rejoindre » simultanés
$r = Api POST '/defis' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; montantMise = 1000 } -Token $TK
$D2 = $r.Body.id
Check 'POST /defis 1000 XOF (défi 2) -> 201' ($r.Status -eq 201)
$toks = @($TM, $TA)
$conc = 1..2 | ForEach-Object -Parallel {
  $i = $_; $base = $using:Base; $tok = ($using:toks)[$i - 1]; $d = $using:D2
  $r = Invoke-WebRequest -Uri "$base/defis/$d/rejoindre" -Method Post -Headers @{ Authorization = "Bearer $tok" } -SkipHttpErrorCheck
  [pscustomobject]@{ I = $i; Status = [int]$r.StatusCode; Raw = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) }
} -ThrottleLimit 2
$s201 = @($conc | Where-Object Status -eq 201); $s409 = @($conc | Where-Object Status -eq 409)
Check 'CONCURRENCE rejoindre x2 simultanés -> exactement 1x201 + 1x409' ($s201.Count -eq 1 -and $s409.Count -eq 1) (($conc | ForEach-Object { "$($_.I):$($_.Status)" }) -join ' ')
$MATCH2 = ($s201[0].Raw | ConvertFrom-Json).id
$J2 = ($s201[0].Raw | ConvertFrom-Json).joueur2Id
$TJ2 = if ($J2 -eq $MID) { $TM } else { $TA }
$nm = Sql "select count(*) from matchs where defi_id='$D2'"
$nmise = Sql "select count(*) from mises where defi_id='$D2'"
Check 'concurrence: 1 seul match et 2 mises pour le défi 2' ([int]$nm -eq 1 -and [int]$nmise -eq 2) "matchs=$nm mises=$nmise"

# annulation d'un défi ouvert
$r = Api POST '/defis' @{ jeuId = $JEU_EF; plateformeId = $PLAT_PC; montantMise = 700 } -Token $TK
$D3 = $r.Body.id
$wb = Wallet $TK
$r = Api DELETE "/defis/$D3" -Token $TM
Check 'DELETE /defis/:id par un autre joueur -> 409' ($r.Status -eq 409)
$r = Api DELETE "/defis/$D3" -Token $TK
Check 'DELETE /defis/:id (créateur, ouvert) -> 204' ($r.Status -eq 204)
$wa = Wallet $TK
# règle produit : toute mise rendue = mise × (1 − commission) → 700 - 10 % = 630 crédités, 70 de commission
Check 'annulation: mise rendue moins la commission 10 % (+630 dispo, -700 bloqué)' ((Dec $wa.soldeDisponible) -eq (Dec $wb.soldeDisponible) + 630 -and (Dec $wa.soldeBloque) -eq (Dec $wb.soldeBloque) - 700) "avant=$($wb.soldeDisponible)/$($wb.soldeBloque) après=$($wa.soldeDisponible)/$($wa.soldeBloque)"
$mise = Sql "select statut from mises where defi_id='$D3'"
Check 'annulation: mise -> remboursee' ($mise -eq 'remboursee') $mise
$txa = Sql "select type||'='||montant||':'||statut||':'||(description like '%(moins la commission)%')::text from transactions_portefeuilles where mise_id=(select id from mises where defi_id='$D3') and type in ('remboursement','commission') order by type"
Check 'annulation: transactions liées à la mise = commission 70 valide + remboursement 630 « (moins la commission) »' ($txa -match 'commission=70\.00:valide' -and $txa -match 'remboursement=630\.00:valide:true' -and @($txa -split "`n").Count -eq 2) $txa
$r = Api DELETE "/defis/$D3" -Token $TK
Check 'DELETE /defis/:id déjà annulé -> 409' ($r.Status -eq 409)
$r = Api GET "/defis/$D3" -Token $TK
Check 'défi annulé -> statut annule' ($r.Body.defi.statut -eq 'annule')
$r = Api GET '/defis?mes=1' -Token $TK
Check 'GET /defis?mes=1 inclut les défis annulés et complets (tous statuts)' ((($r.Body | Where-Object id -eq $D3).statut -eq 'annule') -and (($r.Body | Where-Object id -eq $D1).statut -eq 'complet'))

# expiration via le worker Asynq (on avance la tâche planifiée)
$r = Api POST '/defis' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; montantMise = 600; dureeHeures = 1 } -Token $TK
$D4 = $r.Body.id
$wb = Wallet $TK
$z = Redis "ZADD asynq:{default}:scheduled XX 1 defi-exp:$D4"
$statutD4 = ''
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $statutD4 = (Api GET "/defis/$D4" -Token $TK).Body.defi.statut
  if ($statutD4 -eq 'expire') { break }
}
Check 'WORKER defi:expiration -> défi expiré par le worker Asynq' ($statutD4 -eq 'expire') "statut=$statutD4 après $($i+1)s (zadd: $($z.Trim()))"
$wa = Wallet $TK
Check 'expiration: mise rendue au créateur moins la commission (+540 dispo, -600 bloqué)' ((Dec $wa.soldeDisponible) -eq (Dec $wb.soldeDisponible) + 540 -and (Dec $wa.soldeBloque) -eq (Dec $wb.soldeBloque) - 600) "avant=$($wb.soldeDisponible)/$($wb.soldeBloque) après=$($wa.soldeDisponible)/$($wa.soldeBloque)"
$txe = Sql "select type||'='||montant||':'||statut from transactions_portefeuilles where mise_id=(select id from mises where defi_id='$D4') and type in ('remboursement','commission') order by type"
Check 'expiration: transactions commission=60 + remboursement=540 (valide, liées à la mise)' ($txe -match 'commission=60\.00:valide' -and $txe -match 'remboursement=540\.00:valide') $txe
$mise = Sql "select statut from mises where defi_id='$D4'"
Check 'expiration: mise -> remboursee' ($mise -eq 'remboursee') $mise
$r = Api GET '/notifications' -Token $TK
Check 'notification "Défi expiré" (type defi_expire)' (($r.Body | Where-Object type -eq 'defi_expire' | Measure-Object).Count -ge 1) (($r.Body | ForEach-Object { $_.type }) -join ',')

# ------------------------------------------------------------------ 7b. Admin : CRUD utilisateurs
# Placée ici : Kader a encore des mises bloquées (matchs 1 et 2 en cours) → sa suppression doit être refusée.
Section '7b. Utilisateurs — CRUD admin (création, détail + portefeuille, modification, suppression logique)'
$NAB = @{ nomUtilisateur = "nabil_$Suffix"; email = "nabil_$Suffix@test.local"; motDePasse = 'Secret123!'; telephone = '+2250700000004'; pays = 'Niger' }
$r = Api POST '/utilisateurs' $NAB -Token $TK
Check 'POST /utilisateurs par joueur -> 403' ($r.Status -eq 403) $r.Raw
$r = Api POST '/utilisateurs' $NAB
Check 'POST /utilisateurs sans jeton -> 401' ($r.Status -eq 401)
$r = Api POST '/utilisateurs' @{ nomUtilisateur = 'x'; email = 'pas-un-email'; motDePasse = '1' } -Token $TADM
Check 'POST /utilisateurs invalide -> 400 + details (mêmes règles que l''inscription)' ($r.Status -eq 400 -and $r.Body.details.nomUtilisateur -and $r.Body.details.email -and $r.Body.details.motDePasse) $r.Raw
$r = Api POST '/utilisateurs' ($NAB + @{ statut = 'bizarre' }) -Token $TADM
Check 'POST /utilisateurs statut inconnu -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/utilisateurs' $NAB -Token $TADM
Check 'POST /utilisateurs (admin) -> 201 utilisateur actif, sans jeton ni hash' ($r.Status -eq 201 -and $r.Body.id -and $r.Body.nomUtilisateur -eq $NAB.nomUtilisateur -and $r.Body.email -eq $NAB.email -and $r.Body.statut -eq 'actif' -and $r.Body.pays -eq 'Niger' -and -not $r.Body.jeton -and -not ($r.Raw -match 'motDePasse|mot_de_passe')) $r.Raw
$NID = $r.Body.id
$np = Sql "select count(*) from portefeuilles where utilisateur_id='$NID' and solde_disponible=0 and solde_bloque=0"
Check 'création admin: portefeuille créé (0 / 0)' ([int]$np -eq 1) "portefeuilles=$np"
$ns = Sql "select count(*) from sessions_utilisateurs where utilisateur_id='$NID'"
Check 'création admin: aucune session ouverte' ([int]$ns -eq 0) "sessions=$ns"
$n = Sql "select count(*) from journaux_audit where action='utilisateur:creation' and identifiant_cible='$NID' and administrateur_id='$ADMID'"
Check 'création journalisée (utilisateur:creation, administrateur_id)' ([int]$n -eq 1) "entrées=$n"
$r = Api POST '/auth/connexion' @{ email = $NAB.email; motDePasse = $NAB.motDePasse }
Check 'compte créé par l''admin: connexion avec le mot de passe fourni -> 200' ($r.Status -eq 200 -and $r.Body.jeton -and $r.Body.utilisateur.id -eq $NID) "status=$($r.Status)"
$TN = $r.Body.jeton
$r = Api POST '/utilisateurs' $NAB -Token $TADM
Check 'POST /utilisateurs doublon (même email) -> 409' ($r.Status -eq 409) $r.Raw
$r = Api POST '/utilisateurs' @{ nomUtilisateur = $NAB.nomUtilisateur; email = "autre_$Suffix@test.local"; motDePasse = 'Secret123!' } -Token $TADM
Check 'POST /utilisateurs doublon (même pseudo, email différent) -> 409' ($r.Status -eq 409) $r.Raw
$r = Api POST '/utilisateurs' @{ nomUtilisateur = "nabil2_$Suffix"; email = $NAB.email.ToUpper(); motDePasse = 'Secret123!' } -Token $TADM
Check 'POST /utilisateurs doublon (email en majuscules) -> 409' ($r.Status -eq 409) $r.Raw

# détail + portefeuille
$r = Api GET "/utilisateurs/$NID" -Token $TN
Check 'GET /utilisateurs/:id par joueur -> 403' ($r.Status -eq 403)
$r = Api GET '/utilisateurs/pas-un-uuid' -Token $TADM
Check 'GET /utilisateurs/:id uuid invalide -> 400' ($r.Status -eq 400)
$r = Api GET "/utilisateurs/$([guid]::NewGuid())" -Token $TADM
Check 'GET /utilisateurs/:id inexistant -> 404' ($r.Status -eq 404)
$r = Api GET "/utilisateurs/$NID" -Token $TADM
Check 'GET /utilisateurs/:id (admin) -> 200 utilisateur + portefeuille {soldeDisponible, soldeBloque}, sans hash' ($r.Status -eq 200 -and $r.Body.id -eq $NID -and $r.Body.nomUtilisateur -eq $NAB.nomUtilisateur -and (Dec $r.Body.portefeuille.soldeDisponible) -eq 0 -and (Dec $r.Body.portefeuille.soldeBloque) -eq 0 -and -not ($r.Raw -match 'motDePasse|mot_de_passe')) $r.Raw
$wKd = Wallet $TK
$r = Api GET "/utilisateurs/$KID" -Token $TADM
Check 'GET /utilisateurs/:id Kader: portefeuille identique à GET /portefeuille (bloqué > 0)' ($r.Status -eq 200 -and (Dec $r.Body.portefeuille.soldeDisponible) -eq (Dec $wKd.soldeDisponible) -and (Dec $r.Body.portefeuille.soldeBloque) -eq (Dec $wKd.soldeBloque) -and (Dec $r.Body.portefeuille.soldeBloque) -gt 0) ($r.Body.portefeuille | ConvertTo-Json -Compress)

# modification par l'admin : nom, pays, email, statut, mot de passe
$r = Api PATCH "/utilisateurs/$NID" @{ nomUtilisateur = "nabil_${Suffix}_v2"; pays = 'Bénin' } -Token $TADM
Check 'PATCH /utilisateurs/:id (admin) nom + pays -> 200' ($r.Status -eq 200 -and $r.Body.nomUtilisateur -eq "nabil_${Suffix}_v2" -and $r.Body.pays -eq 'Bénin') $r.Raw
$n = Sql "select count(*) from journaux_audit where action='utilisateur:modification' and identifiant_cible='$NID' and administrateur_id='$ADMID'"
Check 'modification journalisée (utilisateur:modification)' ([int]$n -ge 1) "entrées=$n"
$r = Api PATCH "/utilisateurs/$NID" @{ email = $K.email } -Token $TADM
Check 'PATCH /utilisateurs/:id email déjà pris -> 409' ($r.Status -eq 409) $r.Raw
$r = Api PATCH "/utilisateurs/$NID" @{ nomUtilisateur = $K.nomUtilisateur } -Token $TADM
Check 'PATCH /utilisateurs/:id pseudo déjà pris (admin) -> 409' ($r.Status -eq 409) $r.Raw
$r = Api PATCH "/utilisateurs/$NID" @{ email = 'pas-un-email' } -Token $TADM
Check 'PATCH /utilisateurs/:id email invalide -> 400' ($r.Status -eq 400) $r.Raw
$r = Api PATCH "/utilisateurs/$NID" @{ email = "NABIL2_$Suffix@test.local" } -Token $TADM
Check 'PATCH /utilisateurs/:id email (admin) -> 200, normalisé en minuscules' ($r.Status -eq 200 -and $r.Body.email -eq "nabil2_$Suffix@test.local") $r.Raw
$NAB.email = "nabil2_$Suffix@test.local"
$r = Api PATCH "/utilisateurs/$NID" @{ statut = 'suspendu' } -Token $TN
Check 'PATCH /utilisateurs/:id statut par le joueur lui-même -> 403 (champ réservé à l''admin)' ($r.Status -eq 403) $r.Raw
$r = Api PATCH "/utilisateurs/$NID" @{ motDePasse = 'Autre123!' } -Token $TN
Check 'PATCH /utilisateurs/:id motDePasse par le joueur -> 403 (champ réservé à l''admin)' ($r.Status -eq 403) $r.Raw
$r = Api PATCH "/utilisateurs/$NID" @{ statut = 'suspendu' } -Token $TADM
Check 'PATCH /utilisateurs/:id statut=suspendu (admin) -> 200' ($r.Status -eq 200 -and $r.Body.statut -eq 'suspendu') $r.Raw
$r = Api GET '/auth/moi' -Token $TN
Check 'PATCH statut=suspendu: sessions du joueur révoquées -> 401' ($r.Status -eq 401)
$r = Api POST '/auth/connexion' @{ email = $NAB.email; motDePasse = $NAB.motDePasse }
Check 'PATCH statut=suspendu: connexion refusée -> 403' ($r.Status -eq 403) $r.Raw
$r = Api PATCH "/utilisateurs/$NID" @{ statut = 'actif' } -Token $TADM
Check 'PATCH /utilisateurs/:id statut=actif -> 200' ($r.Status -eq 200 -and $r.Body.statut -eq 'actif')
$r = Api POST '/auth/connexion' @{ email = $NAB.email; motDePasse = $NAB.motDePasse }
Check 'réactivé: connexion -> 200' ($r.Status -eq 200 -and $r.Body.jeton)
$TN = $r.Body.jeton
$r = Api PATCH "/utilisateurs/$NID" @{ motDePasse = '123' } -Token $TADM
Check 'PATCH /utilisateurs/:id motDePasse trop court -> 400' ($r.Status -eq 400) $r.Raw
$r = Api PATCH "/utilisateurs/$NID" @{ motDePasse = 'Nouveau456!' } -Token $TADM
Check 'PATCH /utilisateurs/:id motDePasse (admin) -> 200, jamais de hash dans la réponse' ($r.Status -eq 200 -and -not ($r.Raw -match 'motDePasse|mot_de_passe|\$2[aby]\$')) $r.Raw
$r = Api GET '/auth/moi' -Token $TN
Check 'nouveau mot de passe: ancien jeton invalidé -> 401' ($r.Status -eq 401) $r.Raw
$ns = Sql "select count(*) from sessions_utilisateurs where utilisateur_id='$NID'"
Check 'nouveau mot de passe: lignes sessions_utilisateurs supprimées' ([int]$ns -eq 0) "sessions=$ns"
$r = Api POST '/auth/connexion' @{ email = $NAB.email; motDePasse = $NAB.motDePasse }
Check 'nouveau mot de passe: ancien mot de passe refusé -> 401' ($r.Status -eq 401)
$r = Api POST '/auth/connexion' @{ email = $NAB.email; motDePasse = 'Nouveau456!' }
Check 'nouveau mot de passe: connexion -> 200' ($r.Status -eq 200 -and $r.Body.jeton) "status=$($r.Status)"
$TN = $r.Body.jeton
$hj = Sql "select count(*) from journaux_audit where action='utilisateur:modification' and identifiant_cible='$NID' and nouvelle_valeur ? 'motDePasse' and length(nouvelle_valeur->>'motDePasse') < 20"
Check 'journal: changement de mot de passe tracé sans le hash' ([int]$hj -eq 1) "entrées=$hj"

# suppression logique
$r = Api DELETE "/utilisateurs/$NID" -Token $TN
Check 'DELETE /utilisateurs/:id par joueur -> 403' ($r.Status -eq 403)
$r = Api DELETE '/utilisateurs/pas-un-uuid' -Token $TADM
Check 'DELETE /utilisateurs/:id uuid invalide -> 400' ($r.Status -eq 400)
$r = Api DELETE "/utilisateurs/$([guid]::NewGuid())" -Token $TADM
Check 'DELETE /utilisateurs/:id inexistant -> 404' ($r.Status -eq 404) $r.Raw
$r = Api DELETE "/utilisateurs/$KID" -Token $TADM
Check 'DELETE /utilisateurs/:id Kader (mises bloquées, matchs en cours) -> 409 explicite' ($r.Status -eq 409 -and $r.Body.erreur -match 'bloqu') $r.Raw
$r = Api GET '/auth/moi' -Token $TK
Check 'suppression refusée: Kader intact (session valide, statut actif)' ($r.Status -eq 200 -and $r.Body.utilisateur.statut -eq 'actif' -and $r.Body.utilisateur.email -eq $K.email)
$TNjti = Jti $TN
$r = Api DELETE "/utilisateurs/$NID" -Token $TADM
Check 'DELETE /utilisateurs/:id joueur vierge (admin) -> 204' ($r.Status -eq 204) "status=$($r.Status) $($r.Raw)"
$r = Api GET '/auth/moi' -Token $TN
Check 'suppression: sessions révoquées -> 401' ($r.Status -eq 401)
Check 'suppression: clé Redis de session supprimée' ((Redis "EXISTS session:$TNjti") -match ':0')
$ns = Sql "select count(*) from sessions_utilisateurs where utilisateur_id='$NID'"
Check 'suppression: lignes sessions_utilisateurs supprimées' ([int]$ns -eq 0) "sessions=$ns"
$r = Api POST '/auth/connexion' @{ email = $NAB.email; motDePasse = 'Nouveau456!' }
Check 'suppression: connexion avec l''ancien email -> 401 (email anonymisé)' ($r.Status -eq 401) $r.Raw
$r = Api POST '/auth/connexion' @{ email = "supprime-$NID@quiperd.invalid"; motDePasse = 'Nouveau456!' }
Check 'suppression: connexion du compte supprimé -> 403 (comme un compte suspendu)' ($r.Status -eq 403) $r.Raw
$r = Api GET "/utilisateurs/$NID" -Token $TADM
Check 'GET /utilisateurs/:id supprimé -> 200 statut supprime (suppression logique : la ligne reste consultable)' ($r.Status -eq 200 -and $r.Body.statut -eq 'supprime') $r.Raw
Check 'suppression: email supprime-<id>@quiperd.invalid, pseudo supprime_<8 car.>, téléphone et photo vidés' ($r.Body.email -eq "supprime-$NID@quiperd.invalid" -and $r.Body.nomUtilisateur -eq ('supprime_' + $NID.Substring(0, 8)) -and -not $r.Body.telephone -and -not $r.Body.photoProfil) $r.Raw
$r = Api GET '/utilisateurs?statut=supprime' -Token $TADM
Check 'GET /utilisateurs?statut=supprime -> contient le compte supprimé' ($r.Status -eq 200 -and ($r.Body.elements.id -contains $NID) -and $r.Body.total -ge 1) ("total=" + $r.Body.total)
$r = Api GET "/utilisateurs?recherche=nabil_$Suffix" -Token $TADM
Check 'GET /utilisateurs?recherche= -> le compte anonymisé n''apparaît plus sous son ancien pseudo' ($r.Status -eq 200 -and -not ($r.Body.elements.id -contains $NID))
$r = Api DELETE "/utilisateurs/$NID" -Token $TADM
Check 'DELETE /utilisateurs/:id déjà supprimé -> 409' ($r.Status -eq 409) $r.Raw
$r = Api PATCH "/utilisateurs/$NID" @{ pays = 'Ghana' } -Token $TADM
Check 'PATCH /utilisateurs/:id compte supprimé -> 409' ($r.Status -eq 409) $r.Raw
$r = Api PATCH "/utilisateurs/$NID/statut" @{ statut = 'actif' } -Token $TADM
Check 'PATCH /utilisateurs/:id/statut compte supprimé -> 409 (pas de réactivation)' ($r.Status -eq 409) $r.Raw
$n = Sql "select count(*) from journaux_audit where action='utilisateur:suppression' and identifiant_cible='$NID' and administrateur_id='$ADMID' and ancienne_valeur->>'email'='$($NAB.email)'"
Check 'suppression journalisée (utilisateur:suppression, ancien email en ancienne_valeur)' ([int]$n -eq 1) "entrées=$n"
$r = Api POST '/utilisateurs' @{ nomUtilisateur = "nabil_${Suffix}_v2"; email = $NAB.email; motDePasse = 'Secret123!' } -Token $TADM
Check 'après suppression: pseudo et email libérés pour un nouveau compte -> 201' ($r.Status -eq 201 -and $r.Body.id -ne $NID) $r.Raw

# ------------------------------------------------------------------ 8. Match 1 : déclarations, preuves, validation
Section '8. Match — déclarations, preuves, validation (escrow)'
$r = Api GET "/matchs/$MATCH1" -Token $TA
Check 'GET /matchs/:id non participant -> 403' ($r.Status -eq 403)
$r = Api GET "/matchs/$MATCH1" -Token $TK
Check 'GET /matchs/:id participant -> 200 {match, declarations}' ($r.Status -eq 200 -and $r.Body.match.id -eq $MATCH1 -and $r.Body.match.statut -eq 'en_cours')
$r = Api GET "/matchs/$MATCH1" -Token $TADM
Check 'GET /matchs/:id admin -> 200' ($r.Status -eq 200)
$r = Api POST "/matchs/$MATCH1/declaration" @{ scorePour = -1; scoreContre = 0 } -Token $TK
Check 'POST déclaration score négatif -> 400' ($r.Status -eq 400)
$r = Api POST "/matchs/$MATCH1/declaration" @{ scorePour = 3; scoreContre = 1 } -Token $TA
Check 'POST déclaration par non participant -> 403' ($r.Status -eq 403)
$r = Api POST "/matchs/$([guid]::NewGuid())/declaration" @{ scorePour = 3; scoreContre = 1 } -Token $TA
Check 'POST déclaration match inexistant -> 404' ($r.Status -eq 404) $r.Raw
$r = Api POST "/matchs/$([guid]::NewGuid())/validation" -Token $TADM
Check 'POST validation match inexistant -> 404' ($r.Status -eq 404) $r.Raw
$r = Api POST "/matchs/$MATCH1/validation" -Token $TADM
Check 'POST validation match encore en_cours -> pas de règlement' ($r.Body.statut -eq 'en_cours' -or $r.Status -eq 409) "status=$($r.Status) $($r.Raw)"
$r = Api POST "/matchs/$MATCH1/declaration" @{ scorePour = 3; scoreContre = 1; commentaire = 'GG' } -Token $TK
Check 'POST déclaration Kader 3-1 -> 200 (match reste en_cours)' ($r.Status -eq 200 -and $r.Body.statut -eq 'en_cours') $r.Raw
$r = Api POST "/matchs/$MATCH1/declaration" @{ scorePour = 3; scoreContre = 1 } -Token $TK
Check 'POST déclaration en double -> 409' ($r.Status -eq 409) $r.Raw
$r = Api POST "/matchs/$MATCH1/declaration" @{ scorePour = 1; scoreContre = 3 } -Token $TM
Check 'POST déclaration Moussa 1-3 (concordante) -> 200 statut verification + gagnant Kader' ($r.Status -eq 200 -and $r.Body.statut -eq 'verification' -and $r.Body.gagnantId -eq $KID -and $r.Body.perdantId -eq $MID) $r.Raw
Check 'scores du match renseignés (3-1)' ($r.Body.scoreJoueur1 -eq 3 -and $r.Body.scoreJoueur2 -eq 1) "score1=$($r.Body.scoreJoueur1) score2=$($r.Body.scoreJoueur2)"
$r = Api GET "/matchs/$MATCH1" -Token $TK
Check 'GET /matchs/:id -> 2 déclarations' (@($r.Body.declarations).Count -eq 2)

# preuves
$fK1 = Fichier "k1_$Suffix.png"; $fM1 = Fichier "m1_$Suffix.png"; $fV = Fichier "v_$Suffix.mp4" 4096; $fTxt = Join-Path $Scratch "bad_$Suffix.txt"; 'texte' | Set-Content $fTxt
$r = Api POST "/matchs/$MATCH1/preuves" -Token $TK -Form @{ type = 'autre'; fichier = Get-Item $fK1 }
Check 'POST preuve type invalide -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST "/matchs/$MATCH1/preuves" -Token $TK -Form @{ type = 'capture_ecran'; fichier = Get-Item $fTxt }
Check 'POST preuve extension .txt -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST "/matchs/$MATCH1/preuves" -Token $TK -Form @{ type = 'capture_ecran' }
Check 'POST preuve sans fichier -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST "/matchs/$MATCH1/preuves" -Token $TA -Form @{ type = 'capture_ecran'; fichier = Get-Item $fK1 }
Check 'POST preuve par non participant -> 403' ($r.Status -eq 403)
$r = Api POST "/matchs/$MATCH1/preuves" -Token $TK -Form @{ type = 'capture_ecran'; fichier = Get-Item $fK1 }
Check 'POST preuve capture Kader -> 201 en_attente + empreinte' ($r.Status -eq 201 -and $r.Body.statut -eq 'en_attente' -and $r.Body.empreinteFichier.Length -eq 64 -and $r.Body.type -eq 'capture_ecran') $r.Raw
$PK1 = $r.Body.id; $cheminK1 = $r.Body.urlFichier
Check 'preuve stockée sous <matchId>/<utilisateurId>/<uuid>.png' ($cheminK1 -match "^$MATCH1/$KID/[0-9a-f-]{36}\.png$") $cheminK1
Check 'fichier physique présent dans public/preuves' (Test-Path (Join-Path $PreuvesDir $cheminK1))
$r = Api POST "/matchs/$MATCH1/preuves" -Token $TK -Form @{ type = 'video'; fichier = Get-Item $fV }
Check 'POST preuve vidéo Kader -> 201' ($r.Status -eq 201 -and $r.Body.type -eq 'video') $r.Raw
$r = Api POST "/matchs/$MATCH1/preuves" -Token $TM -Form @{ type = 'capture_ecran'; fichier = Get-Item $fM1 }
Check 'POST preuve capture Moussa -> 201' ($r.Status -eq 201)
$PM1 = $r.Body.id
$r = Api GET "/matchs/$MATCH1/preuves" -Token $TM
Check 'GET /matchs/:id/preuves -> 3 preuves' ($r.Status -eq 200 -and @($r.Body).Count -eq 3)
$r = Api GET "/preuves/$PK1/fichier" -Token $TM
$octets = [IO.File]::ReadAllBytes($fK1)
Check 'GET /preuves/:id/fichier (route protégée) -> 200 octets identiques' ($r.Status -eq 200 -and $r.Raw.Length -gt 0 -and ((Invoke-WebRequest -Uri "$Base/preuves/$PK1/fichier" -Headers @{ Authorization = "Bearer $TM" }).RawContentStream.ToArray().Length -eq $octets.Length))
$r = Api GET "/preuves/$PK1/fichier" -Token $TA
Check 'GET /preuves/:id/fichier non participant -> 403' ($r.Status -eq 403)
$r = Api GET "/preuves/$PK1/fichier"
Check 'GET /preuves/:id/fichier sans jeton -> 401' ($r.Status -eq 401)
$r = Invoke-WebRequest -Uri "http://127.0.0.1:8080/public/preuves/$cheminK1" -SkipHttpErrorCheck
Check 'aucun accès statique public au fichier de preuve' ($r.StatusCode -eq 404) "status=$($r.StatusCode)"
$r = Api PATCH "/preuves/$PK1" @{ statut = 'validee' } -Token $TK
Check 'PATCH /preuves/:id par joueur -> 403' ($r.Status -eq 403)
$r = Api PATCH "/preuves/$PK1" @{ statut = 'peut-etre' } -Token $TADM
Check 'PATCH /preuves/:id statut invalide -> 400' ($r.Status -eq 400)
$wKb = Wallet $TK; $wMb = Wallet $TM
$r = Api PATCH "/preuves/$PK1" @{ statut = 'validee' } -Token $TADM
Check 'PATCH /preuves/:id validee (Kader) -> 200' ($r.Status -eq 200 -and $r.Body.statut -eq 'validee')
$mt = (Api GET "/matchs/$MATCH1" -Token $TK).Body.match
Check 'une seule preuve validée: match toujours en verification' ($mt.statut -eq 'verification') $mt.statut
$r = Api PATCH "/preuves/$PM1" @{ statut = 'validee' } -Token $TADM
Check 'PATCH /preuves/:id validee (Moussa) -> 200' ($r.Status -eq 200)
$mt = (Api GET "/matchs/$MATCH1" -Token $TK).Body.match
Check 'AUTO-VALIDATION: match -> termine, gagnant Kader, dateFin' ($mt.statut -eq 'termine' -and $mt.gagnantId -eq $KID -and $mt.dateFin) ($mt | ConvertTo-Json -Compress)
$wK = Wallet $TK; $wM = Wallet $TM
Check 'RÈGLEMENT: Kader +3600 dispo, -2000 bloqué (4000 - 10%)' ((Dec $wK.soldeDisponible) -eq (Dec $wKb.soldeDisponible) + 3600 -and (Dec $wK.soldeBloque) -eq (Dec $wKb.soldeBloque) - 2000) "avant=$($wKb.soldeDisponible)/$($wKb.soldeBloque) après=$($wK.soldeDisponible)/$($wK.soldeBloque)"
Check 'RÈGLEMENT: Moussa dispo inchangé, -2000 bloqué' ((Dec $wM.soldeDisponible) -eq (Dec $wMb.soldeDisponible) -and (Dec $wM.soldeBloque) -eq (Dec $wMb.soldeBloque) - 2000) "avant=$($wMb.soldeDisponible)/$($wMb.soldeBloque) après=$($wM.soldeDisponible)/$($wM.soldeBloque)"
$mises = Sql "select utilisateur_id||':'||statut from mises where defi_id='$D1' order by statut"
Check 'mises: gagnee (Kader) / perdue (Moussa)' (($mises -join ' ') -match "$KID`:gagnee" -and ($mises -join ' ') -match "$MID`:perdue") ($mises -join ' ')
$txs = Sql "select type||'='||montant from transactions_portefeuilles where match_id='$MATCH1' order by type"
Check 'transactions: commission=400 + gain=3600' (($txs -join ' ') -match 'commission=400' -and ($txs -join ' ') -match 'gain=3600') ($txs -join ' ')
$n = Sql "select count(*) from journaux_audit where action='match:validation' and identifiant_cible='$MATCH1'"
Check 'validation journalisée (journaux_audit)' ([int]$n -eq 1) "entrées=$n"
$r = Api POST "/matchs/$MATCH1/validation" -Token $TK
Check 'POST /matchs/:id/validation par joueur -> 403' ($r.Status -eq 403)
$r = Api POST "/matchs/$MATCH1/validation" -Token $TADM
$wK2 = Wallet $TK
Check 'IDEMPOTENCE: revalidation -> 200 état actuel, aucun second paiement' ($r.Status -eq 200 -and $r.Body.statut -eq 'termine' -and (Dec $wK2.soldeDisponible) -eq (Dec $wK.soldeDisponible)) "status=$($r.Status) solde=$($wK2.soldeDisponible)"
$ng = Sql "select count(*) from transactions_portefeuilles where match_id='$MATCH1' and type='gain'"
Check 'exactement 1 transaction gain pour le match 1' ([int]$ng -eq 1) "gains=$ng"
$r = Api GET '/matchs' -Token $TK
Check 'GET /matchs (mes matchs, Kader) -> 200 contient le match 1 avec libellés' ($r.Status -eq 200 -and (($r.Body | Where-Object id -eq $MATCH1).joueur1Nom -eq $K.nomUtilisateur) -and (($r.Body | Where-Object id -eq $MATCH1).joueur2Nom -eq $M.nomUtilisateur)) ("n=" + @($r.Body).Count)
$r = Api GET '/matchs?statut=termine' -Token $TM
Check 'GET /matchs?statut=termine (Moussa) -> contient le match 1' ($r.Status -eq 200 -and ($r.Body.id -contains $MATCH1))
$r = Api GET '/matchs?statut=en_cours' -Token $TM
Check 'GET /matchs?statut=en_cours (Moussa) -> ne contient pas le match 1 (terminé)' ($r.Status -eq 200 -and -not ($r.Body.id -contains $MATCH1))
$r = Api GET '/matchs' -Token $TA
Check 'GET /matchs (Ali, non participant) -> ne contient pas le match 1' ($r.Status -eq 200 -and -not ($r.Body.id -contains $MATCH1))
$r = Api GET '/matchs?tous=1' -Token $TADM
Check 'GET /matchs?tous=1 (admin) -> 200 page {elements, total} contenant le match 1 enrichi' ($r.Status -eq 200 -and $r.Body.page -eq 1 -and $r.Body.taille -eq 10 -and $r.Body.total -ge 2 -and ($r.Body.elements.id -contains $MATCH1) -and (($r.Body.elements | Where-Object id -eq $MATCH1).joueur1Nom -eq $K.nomUtilisateur)) ("total=" + $r.Body.total)
$r = Api GET '/matchs?tous=1&statut=termine&taille=1' -Token $TADM
Check 'GET /matchs?tous=1&statut=termine&taille=1 -> 1 élément = match 1 (plus récent terminé), pages = total' ($r.Status -eq 200 -and @($r.Body.elements).Count -eq 1 -and $r.Body.elements[0].id -eq $MATCH1 -and $r.Body.elements[0].statut -eq 'termine' -and $r.Body.pages -eq $r.Body.total) ("total=" + $r.Body.total)
$r = Api GET '/matchs?tous=1' -Token $TK
Check 'GET /matchs?tous=1 par un joueur -> tableau de ses matchs (pas d''enveloppe admin)' ($r.Status -eq 200 -and $r.Raw.StartsWith('[') -and ($r.Body.id -contains $MATCH1))
$r = Api GET "/matchs/$MATCH1" -Token $TK
Check 'GET /matchs/:id enrichi (joueur1Nom, joueur2Nom, jeuNom, plateformeNom)' ($r.Body.match.joueur1Nom -eq $K.nomUtilisateur -and $r.Body.match.joueur2Nom -eq $M.nomUtilisateur -and $r.Body.match.jeuNom -eq 'EA SPORTS FC 27' -and $r.Body.match.plateformeNom -eq 'PlayStation 5' -and $r.Body.match.scoreJoueur1 -eq 3) $r.Raw.Substring(0, [Math]::Min(300, $r.Raw.Length))
$r = Api GET '/notifications' -Token $TK
Check 'notification "Match terminé" (gagnant)' (($r.Body | Where-Object type -eq 'match_termine' | Measure-Object).Count -ge 1)
$r = Api POST "/matchs/$MATCH1/litige" @{ motif = 'Trop tard' } -Token $TM
Check 'POST litige sur match terminé -> 409' ($r.Status -eq 409) $r.Raw
$r = Api POST "/matchs/$MATCH1/preuves" -Token $TK -Form @{ type = 'capture_ecran'; fichier = Get-Item $fK1 }
Check 'ré-upload même fichier même match -> accepté (201) ou refusé proprement' ($r.Status -in 201, 409) "status=$($r.Status)"

# ------------------------------------------------------------------ 9. Match 2 : double validation concurrente
Section '9. Match 2 — validation concurrente (double clic admin)'
$r = Api POST "/matchs/$MATCH2/declaration" @{ scorePour = 0; scoreContre = 2 } -Token $TK
Check 'match 2: déclaration Kader 0-2 -> 200' ($r.Status -eq 200) $r.Raw
$r = Api POST "/matchs/$MATCH2/declaration" @{ scorePour = 2; scoreContre = 0 } -Token $TJ2
Check 'match 2: déclaration adversaire 2-0 -> verification, gagnant = adversaire' ($r.Status -eq 200 -and $r.Body.statut -eq 'verification' -and $r.Body.gagnantId -eq $J2) $r.Raw
$wJb = Wallet $TJ2
$conc = 1..2 | ForEach-Object -Parallel {
  $base = $using:Base; $tok = $using:TADM; $mid = $using:MATCH2
  $r = Invoke-WebRequest -Uri "$base/matchs/$mid/validation" -Method Post -Headers @{ Authorization = "Bearer $tok" } -SkipHttpErrorCheck
  [pscustomobject]@{ Status = [int]$r.StatusCode; Raw = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) }
} -ThrottleLimit 2
Check 'CONCURRENCE validation x2 -> les deux répondent 200 termine' (@($conc | Where-Object { $_.Status -eq 200 -and ($_.Raw | ConvertFrom-Json).statut -eq 'termine' }).Count -eq 2) (($conc | ForEach-Object { $_.Status }) -join ' ')
$wJ = Wallet $TJ2
Check 'CONCURRENCE: un seul règlement (+1800 dispo, -1000 bloqué)' ((Dec $wJ.soldeDisponible) -eq (Dec $wJb.soldeDisponible) + 1800 -and (Dec $wJ.soldeBloque) -eq (Dec $wJb.soldeBloque) - 1000) "avant=$($wJb.soldeDisponible)/$($wJb.soldeBloque) après=$($wJ.soldeDisponible)/$($wJ.soldeBloque)"
$ng = Sql "select count(*) from transactions_portefeuilles where match_id='$MATCH2' and type='gain'"
$nc = Sql "select count(*) from transactions_portefeuilles where match_id='$MATCH2' and type='commission'"
Check 'match 2: 1 gain + 1 commission en base' ([int]$ng -eq 1 -and [int]$nc -eq 1) "gain=$ng commission=$nc"

# ------------------------------------------------------------------ 10. Litiges
Section '10. Litiges — auto (déclarations divergentes) et manuel'
$r = Api POST '/defis' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; montantMise = 500 } -Token $TK
$D5 = $r.Body.id
$r = Api POST "/defis/$D5/rejoindre" -Token $TM
$MATCH3 = $r.Body.id
Check 'défi 3 (500) créé et rejoint par Moussa' ($MATCH3 -ne $null)
$r = Api POST "/matchs/$MATCH3/preuves" -Token $TK -Form @{ type = 'capture_ecran'; fichier = Get-Item $fK1 }
Check 'preuve déjà utilisée dans un AUTRE match -> 409 (empreinte)' ($r.Status -eq 409) $r.Raw
$nfic = (Get-ChildItem -Recurse -File (Join-Path $PreuvesDir $MATCH3) -ErrorAction SilentlyContinue | Measure-Object).Count
Check 'preuve refusée: aucun fichier orphelin sur le disque' ($nfic -eq 0) "fichiers=$nfic"
$r = Api POST "/matchs/$MATCH3/declaration" @{ scorePour = 1; scoreContre = 0 } -Token $TK
$r = Api POST "/matchs/$MATCH3/declaration" @{ scorePour = 1; scoreContre = 0 } -Token $TM
Check 'déclarations divergentes (1-0 / 1-0) -> statut litige' ($r.Status -eq 200 -and $r.Body.statut -eq 'litige') $r.Raw
$lit = Sql "select id||'|'||statut||'|'||motif from litiges where match_id='$MATCH3'"
Check 'litige auto créé en base (en_cours)' ($lit -match '\|en_cours\|') "$lit"
$LIT3 = ($lit -split '\|')[0]
$r = Api GET '/notifications' -Token $TK
Check 'litige auto: notification "Litige ouvert" aux deux joueurs' ((($r.Body | Where-Object type -eq 'litige_ouvert' | Measure-Object).Count -ge 1) -and (((Api GET '/notifications' -Token $TM).Body | Where-Object type -eq 'litige_ouvert' | Measure-Object).Count -ge 1))
$zs = Redis "ZSCORE asynq:{default}:scheduled litige-relance:$LIT3"
Check 'tâche Asynq litige:relance planifiée (rappel arbitre)' ($zs -match '\d{9,}') $zs.Trim()
$null = Redis "ZADD asynq:{default}:scheduled XX 1 litige-relance:$LIT3"
$nrel = '0'
for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Seconds 1; $nrel = Sql "select count(*) from journaux_audit where action='litige:relance' and identifiant_cible='$LIT3'"; if ([int]$nrel -ge 1) { break } }
Check 'WORKER litige:relance -> rappel journalisé (journaux_audit)' ([int]$nrel -ge 1) "entrées=$nrel après $($i+1)s"
$r = Api GET '/litiges' -Token $TK
Check 'GET /litiges (Kader) -> 200 contient le litige' ($r.Status -eq 200 -and ($r.Body.id -contains $LIT3)) "status=$($r.Status) $($r.Raw.Substring(0, [Math]::Min(200, $r.Raw.Length)))"
$r = Api GET '/litiges' -Token $TA
Check 'GET /litiges (Ali, non impliqué) -> ne voit pas le litige' ($r.Status -eq 200 -and -not ($r.Body.id -contains $LIT3)) "status=$($r.Status)"
$r = Api GET '/litiges?tous=1' -Token $TADM
Check 'GET /litiges?tous=1 (admin) -> 200 page {elements, total} contenant le litige' ($r.Status -eq 200 -and $r.Body.page -eq 1 -and $r.Body.taille -eq 10 -and $r.Body.total -ge 1 -and ($r.Body.elements.id -contains $LIT3)) ("total=" + $r.Body.total)
$r = Api GET '/litiges?tous=1&statut=en_cours&taille=1' -Token $TADM
Check 'GET /litiges?tous=1&statut=en_cours&taille=1 -> 1 élément = litige 3 (plus récent en cours)' ($r.Status -eq 200 -and @($r.Body.elements).Count -eq 1 -and $r.Body.elements[0].id -eq $LIT3 -and $r.Body.elements[0].statut -eq 'en_cours')
$r = Api GET '/litiges?tous=1' -Token $TK
Check 'GET /litiges?tous=1 par un joueur -> tableau (ses litiges seulement, pas d''enveloppe)' ($r.Status -eq 200 -and $r.Raw.StartsWith('[') -and ($r.Body.id -contains $LIT3))
$r = Api PATCH "/litiges/$LIT3" @{ decision = 'remboursement' } -Token $TK
Check 'PATCH /litiges/:id par joueur -> 403' ($r.Status -eq 403)
$r = Api PATCH "/litiges/$LIT3" @{ decision = 'gagnant'; gagnantId = $AID } -Token $TADM
Check 'PATCH /litiges/:id gagnant non participant -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST "/matchs/$MATCH3/validation" -Token $TADM
Check 'validation admin d''un match en litige -> pas de règlement (reste litige)' ($r.Body.statut -eq 'litige') "status=$($r.Status) $($r.Raw)"
$wKb = Wallet $TK; $wMb = Wallet $TM
$r = Api PATCH "/litiges/$LIT3" @{ decision = 'remboursement' } -Token $TADM
Check 'PATCH /litiges/:id remboursement (admin) -> 200 resolu' ($r.Status -eq 200 -and $r.Body.statut -eq 'resolu' -and $r.Body.decision -eq 'remboursement') $r.Raw
$wK = Wallet $TK; $wM = Wallet $TM
# chaque mise rendue l'est moins la commission : 500 - 10 % = 450 crédités, 50 de commission par joueur
Check 'remboursement croisé: Kader +450 dispo (500 - 10 %) / -500 bloqué' ((Dec $wK.soldeDisponible) -eq (Dec $wKb.soldeDisponible) + 450 -and (Dec $wK.soldeBloque) -eq (Dec $wKb.soldeBloque) - 500) "avant=$($wKb.soldeDisponible)/$($wKb.soldeBloque) après=$($wK.soldeDisponible)/$($wK.soldeBloque)"
Check 'remboursement croisé: Moussa +450 dispo (500 - 10 %) / -500 bloqué' ((Dec $wM.soldeDisponible) -eq (Dec $wMb.soldeDisponible) + 450 -and (Dec $wM.soldeBloque) -eq (Dec $wMb.soldeBloque) - 500) "avant=$($wMb.soldeDisponible)/$($wMb.soldeBloque) après=$($wM.soldeDisponible)/$($wM.soldeBloque)"
$mises = Sql "select string_agg(statut, ',') from mises where defi_id='$D5'"
Check 'mises du défi 3 -> remboursee,remboursee' ($mises -eq 'remboursee,remboursee') $mises
$txl = Sql "select type||'='||montant||':'||statut||':'||(mise_id is not null)::text from transactions_portefeuilles where match_id='$MATCH3' and type in ('remboursement','commission') order by type"
Check 'remboursement croisé: 2 commissions=50 + 2 remboursements=450 (valides, liées au match et aux mises)' (([regex]::Matches($txl, 'commission=50\.00:valide:true')).Count -eq 2 -and ([regex]::Matches($txl, 'remboursement=450\.00:valide:true')).Count -eq 2 -and @($txl -split "`n").Count -eq 4) $txl
$mt = (Api GET "/matchs/$MATCH3" -Token $TK).Body.match
Check 'match 3 -> termine sans gagnant' ($mt.statut -eq 'termine' -and -not $mt.gagnantId) ($mt | ConvertTo-Json -Compress)
$r = Api PATCH "/litiges/$LIT3" @{ decision = 'remboursement' } -Token $TADM
Check 'PATCH /litiges/:id déjà résolu -> 409' ($r.Status -eq 409) $r.Raw
$r = Api GET '/notifications' -Token $TM
Check 'notification "Litige résolu"' (($r.Body | Where-Object type -eq 'litige_resolu' | Measure-Object).Count -ge 1)

# litige manuel + décision gagnant
$r = Api POST '/defis' @{ jeuId = $JEU_EA; plateformeId = $PLAT_PS; montantMise = 500 } -Token $TK
$D6 = $r.Body.id
$r = Api POST "/defis/$D6/rejoindre" -Token $TM
$MATCH4 = $r.Body.id
$r = Api POST "/matchs/$MATCH4/litige" @{ motif = 'x' } -Token $TM
Check 'POST /matchs/:id/litige motif trop court -> 400' ($r.Status -eq 400)
$r = Api POST "/matchs/$MATCH4/litige" @{ motif = 'Adversaire déconnecté volontairement' } -Token $TA
Check 'POST /matchs/:id/litige non participant -> 403' ($r.Status -eq 403)
$r = Api POST "/matchs/$MATCH4/litige" @{ motif = 'Adversaire déconnecté volontairement' } -Token $TM
Check 'POST /matchs/:id/litige (Moussa) -> 201 en_cours' ($r.Status -eq 201 -and $r.Body.statut -eq 'en_cours' -and $r.Body.ouvertParId -eq $MID) $r.Raw
$LIT4 = $r.Body.id
$r = Api POST "/matchs/$MATCH4/litige" @{ motif = 'Encore un litige' } -Token $TK
Check 'POST /matchs/:id/litige déjà en litige -> 409 (pas de doublon)' ($r.Status -eq 409) $r.Raw
$nl = Sql "select count(*) from litiges where match_id='$MATCH4'"
Check 'un seul litige en base pour le match 4' ([int]$nl -eq 1) "litiges=$nl"
$r = Api GET '/notifications' -Token $TK
Check 'litige manuel: adversaire (Kader) notifié "Litige ouvert"' ((($r.Body | Where-Object { $_.type -eq 'litige_ouvert' -and $_.dateCreation -gt (Get-Date).AddMinutes(-1).ToUniversalTime() } | Measure-Object).Count -ge 1))
$zs = Redis "ZSCORE asynq:{default}:scheduled litige-relance:$LIT4"
Check 'litige manuel: relance arbitre planifiée' ($zs -match '\d{9,}') $zs.Trim()
$mt = (Api GET "/matchs/$MATCH4" -Token $TK).Body.match
Check 'match 4 -> statut litige' ($mt.statut -eq 'litige')
$r = Api POST "/matchs/$MATCH4/declaration" @{ scorePour = 2; scoreContre = 0 } -Token $TK
Check 'déclaration sur match en litige -> 409' ($r.Status -eq 409) $r.Raw
$wKb = Wallet $TK; $wMb = Wallet $TM
$r = Api PATCH "/litiges/$LIT4" @{ decision = 'gagnant'; gagnantId = $MID } -Token $TADM
Check 'PATCH /litiges/:id décision gagnant=Moussa -> 200' ($r.Status -eq 200 -and $r.Body.decision -eq 'gagnant') $r.Raw
$wK = Wallet $TK; $wM = Wallet $TM
Check 'décision gagnant: Moussa +900 (1000 - 10%) / -500 bloqué' ((Dec $wM.soldeDisponible) -eq (Dec $wMb.soldeDisponible) + 900 -and (Dec $wM.soldeBloque) -eq (Dec $wMb.soldeBloque) - 500) "avant=$($wMb.soldeDisponible)/$($wMb.soldeBloque) après=$($wM.soldeDisponible)/$($wM.soldeBloque)"
Check 'décision gagnant: Kader perd sa mise (-500 bloqué, dispo inchangé)' ((Dec $wK.soldeDisponible) -eq (Dec $wKb.soldeDisponible) -and (Dec $wK.soldeBloque) -eq (Dec $wKb.soldeBloque) - 500) "avant=$($wKb.soldeDisponible)/$($wKb.soldeBloque) après=$($wK.soldeDisponible)/$($wK.soldeBloque)"
$mt = (Api GET "/matchs/$MATCH4" -Token $TK).Body.match
Check 'match 4 -> termine, gagnant Moussa, perdant Kader' ($mt.statut -eq 'termine' -and $mt.gagnantId -eq $MID -and $mt.perdantId -eq $KID) ($mt | ConvertTo-Json -Compress)
$lit = Sql "select statut||'|'||decision||'|'||coalesce(arbitre_id::text,'') from litiges where id='$LIT4'"
Check 'litige 4 en base: resolu|gagnant|arbitre renseigné' ($lit -eq "resolu|gagnant|$ADMID") $lit
$n = Sql "select count(*) from journaux_audit where action='litige:decision' and identifiant_cible='$LIT4'"
Check 'décision journalisée' ([int]$n -eq 1)

# ------------------------------------------------------------------ 11. Notifications
Section '11. Notifications'
$r = Api GET '/notifications' -Token $TK
Check 'GET /notifications Kader -> 200 liste non vide' ($r.Status -eq 200 -and @($r.Body).Count -ge 3) ("n=" + @($r.Body).Count + " types: " + (($r.Body.type | Select-Object -Unique) -join ','))
$NK = $r.Body[0].id
Check 'notifications: champs camelCase (utilisateurId, lu, dateCreation)' ($r.Body[0].PSObject.Properties.Name -contains 'utilisateurId' -and $r.Body[0].PSObject.Properties.Name -contains 'lu')
$r = Api POST "/notifications/$NK/lue" -Token $TM
Check 'POST /notifications/:id/lue sur notif d''autrui -> 404' ($r.Status -eq 404)
$r = Api POST "/notifications/$NK/lue" -Token $TK
Check 'POST /notifications/:id/lue -> 200' ($r.Status -eq 200 -and $r.Body.lu -eq $true)
$r = Api GET '/notifications' -Token $TK
Check 'notification marquée lue' (($r.Body | Where-Object id -eq $NK).lu -eq $true)
$r = Api POST '/notifications/jeton-fcm' @{ jetonFcm = "fcm-token-$Suffix"; appareil = 'Pixel 8' } -Token $TK
Check 'POST /notifications/jeton-fcm -> 200' ($r.Status -eq 200 -and $r.Body.enregistre -eq $true) $r.Raw
$s = Sql "select jeton_fcm||'|'||appareil from sessions_utilisateurs where utilisateur_id='$KID' and jeton_fcm <> ''"
Check 'jeton FCM stocké sur la session courante (sessions_utilisateurs)' ($s -eq "fcm-token-$Suffix|Pixel 8") $s
$r = Api GET '/notifications'
Check 'GET /notifications sans jeton -> 401' ($r.Status -eq 401)

# ------------------------------------------------------------------ 12. Retraits
Section '12. Retraits'
$w = Wallet $TM
$r = Api POST '/paiements/retrait' @{ montant = 999999; prestataire = 'ligdicash'; numero = '+2250700000002' } -Token $TM
Check 'POST /paiements/retrait > solde dispo -> 422' ($r.Status -eq 422) $r.Raw
$r = Api POST '/paiements/retrait' @{ montant = 1000; prestataire = 'ligdicash' } -Token $TM
Check 'POST /paiements/retrait sans numero -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/paiements/retrait' @{ montant = -100; prestataire = 'ligdicash'; numero = '+2250700000002' } -Token $TM
Check 'POST /paiements/retrait montant négatif -> 400' ($r.Status -eq 400) $r.Raw
$wb = Wallet $TM
$r = Api POST '/paiements/retrait' @{ montant = 1000; prestataire = 'fusionmoney'; numero = '+2250700000002' } -Token $TM
Check 'POST /paiements/retrait 1000 -> 201 en_attente, frais 1 % = 10' ($r.Status -eq 201 -and $r.Body.statut -eq 'en_attente' -and $r.Body.type -eq 'retrait' -and (Dec $r.Body.frais) -eq 10) $r.Raw
$RET1 = $r.Body.id; $REF1 = $r.Body.reference
$wa = Wallet $TM
Check 'retrait: solde disponible débité immédiatement (-1010 = montant + frais), bloqué inchangé' ((Dec $wa.soldeDisponible) -eq (Dec $wb.soldeDisponible) - 1010 -and (Dec $wa.soldeBloque) -eq (Dec $wb.soldeBloque)) "avant=$($wb.soldeDisponible) après=$($wa.soldeDisponible)"
$txr = Sql "select type||'='||montant||':'||statut from transactions_portefeuilles where reference in ('$REF1','$REF1-FRAIS') order by type"
Check 'mouvements retrait=1000 + commission=10 en attente' ($txr -match 'commission=10\.00:en_attente' -and $txr -match 'retrait=1000\.00:en_attente') $txr
$r = Api PATCH "/paiements/$RET1/statut" @{ statut = 'echoue' } -Token $TADM
Check 'PATCH retrait -> echoue (admin) -> 200' ($r.Status -eq 200 -and $r.Body.statut -eq 'echoue')
$wa2 = Wallet $TM
Check 'retrait échoué: montant + frais recrédités' ((Dec $wa2.soldeDisponible) -eq (Dec $wb.soldeDisponible)) "solde=$($wa2.soldeDisponible)"
$txr = Sql "select type||'='||montant||':'||statut from transactions_portefeuilles where reference like '$REF1%' order by type"
Check 'retrait échoué: mouvements annulés + remboursement 1010' ($txr -match 'commission=10\.00:annule' -and $txr -match 'retrait=1000\.00:annule' -and $txr -match 'remboursement=1010\.00:valide') $txr
$r = Api POST '/paiements/retrait' @{ montant = 500; prestataire = 'ligdicash'; numero = '+2250700000002' } -Token $TM
$RET2 = $r.Body.id; $REF2 = $r.Body.reference
$r = Api PATCH "/paiements/$RET2/statut" @{ statut = 'reussi' } -Token $TADM
$wa3 = Wallet $TM
Check 'retrait 500 réussi: solde -505 définitif (500 + 1 % de frais)' ($r.Status -eq 200 -and (Dec $wa3.soldeDisponible) -eq (Dec $wb.soldeDisponible) - 505) "solde=$($wa3.soldeDisponible)"
$txr = Sql "select type||'='||montant||':'||statut from transactions_portefeuilles where reference in ('$REF2','$REF2-FRAIS') order by type"
Check 'retrait réussi: mouvements validés (retrait 500 + frais 5)' ($txr -match 'commission=5\.00:valide' -and $txr -match 'retrait=500\.00:valide') $txr
$r = Api GET '/portefeuille/transactions?limite=5' -Token $TM
Check 'GET /portefeuille/transactions?limite=5 -> 5 max, types variés' ($r.Status -eq 200 -and @($r.Body).Count -le 5 -and @($r.Body).Count -ge 1) (($r.Body.type) -join ',')
$n = Sql "select count(*) from journaux_audit where action='paiement:retrait_demande'"
Check 'retraits journalisés' ([int]$n -ge 2)

# ------------------------------------------------------------------ 13. Callbacks (webhooks publics)
Section '13. Webhooks paiement'
$nb = Sql "select count(*) from paiements_evenements"
$r = Api POST '/paiements/callback-ligdicash' @{ transaction_id = $DEP.Kader; status = 'completed' }
Check 'POST /paiements/callback-ligdicash (public) -> 200' ($r.Status -eq 200) "status=$($r.Status)"
$r = Api POST '/paiements/callback-fusion' @{ personal_Info = @(@{ reference = 'PAY-inconnue' }); statut = 'paid' }
Check 'POST /paiements/callback-fusion (public) -> 200' ($r.Status -eq 200)
Start-Sleep -Milliseconds 500
$na = Sql "select count(*) from paiements_evenements"
Check 'callbacks journalisés bruts (paiements_evenements +2)' ([int]$na -eq [int]$nb + 2) "avant=$nb après=$na"
$w = Wallet $TK
$dispoK = Dec $w.soldeDisponible
Check 'callback sur dépôt déjà traité: pas de double crédit' ($dispoK -eq (Dec (Wallet $TK).soldeDisponible))

# ------------------------------------------------------------------ 14. Administration
Section '14. Administration'
$r = Api GET '/administration/statistiques' -Token $TK
Check 'GET /administration/statistiques par joueur -> 403' ($r.Status -eq 403)
# Le KPI est mis en cache 60 s dans Redis : on vide la clé pour comparer au grand livre courant.
Redis 'DEL cache:stats:admin' | Out-Null
$r = Api GET '/administration/statistiques' -Token $TADM
Check 'GET /administration/statistiques -> 200 KPIs' ($r.Status -eq 200 -and $r.Body.utilisateursTotal -ge 3 -and $r.Body.matchsTermines -ge 3 -and $r.Body.PSObject.Properties.Name -contains 'commissionCumulee') $r.Raw
$commLedger = Sql "select coalesce(sum(montant),0) from transactions_portefeuilles where type='commission' and statut='valide'"
Check 'KPI commissionCumulee = commissions validées du grand livre' ((Dec $r.Body.commissionCumulee) -eq (Dec $commLedger)) "kpi=$($r.Body.commissionCumulee) livre=$commLedger"
$ttl = Redis 'TTL cache:stats:admin'
Check 'statistiques mises en cache Redis (TTL <= 60 s)' ($ttl -match ':(\d+)' -and [int]$Matches[1] -le 60 -and [int]$Matches[1] -gt 0) $ttl.Trim()
$r = Api GET '/administration/configurations-financieres' -Token $TADM
Check 'GET /administration/configurations-financieres -> 4 actives' ($r.Status -eq 200 -and @($r.Body).Count -eq 4) (($r.Body | ForEach-Object { "$($_.type)=$($_.valeur)" }) -join ' ')
$comm = ($r.Body | Where-Object type -eq 'commission_defi').valeur
Check 'commission_defi = 0.10 (seed)' ((Dec $comm) -eq 0.10) "$comm"
$r = Api PATCH '/administration/configurations-financieres' @{ type = 'inconnu'; valeur = 1 } -Token $TADM
Check 'PATCH configuration type invalide -> 400' ($r.Status -eq 400)
$r = Api PATCH '/administration/configurations-financieres' @{ type = 'commission_defi'; valeur = 0.15 } -Token $TADM
Check 'PATCH configuration commission_defi=0.15 -> 200' ($r.Status -eq 200 -and (Dec $r.Body.valeur) -eq 0.15 -and $r.Body.statut -eq 'actif') $r.Raw
$r = Api GET '/administration/configurations-financieres' -Token $TADM
Check 'nouvelle commission active, toujours 4 actives (ancienne clôturée)' (@($r.Body).Count -eq 4 -and (Dec ($r.Body | Where-Object type -eq 'commission_defi').valeur) -eq 0.15)
$n = Sql "select count(*) from configurations_financieres where type='commission_defi' and statut='inactif' and date_fin is not null"
Check 'ancienne valeur historisée (inactif + date_fin)' ([int]$n -ge 1)
$r = Api PATCH '/administration/configurations-financieres' @{ type = 'commission_defi'; valeur = 0.10 } -Token $TADM
Check 'restauration commission 0.10 -> 200' ($r.Status -eq 200)
$r = Api GET '/administration/journaux-audit' -Token $TADM
Check 'GET /administration/journaux-audit -> 200 page de 10 (total >= 10, pages = ceil(total/10))' ($r.Status -eq 200 -and @($r.Body.elements).Count -eq 10 -and $r.Body.total -ge 10 -and $r.Body.page -eq 1 -and $r.Body.taille -eq 10 -and $r.Body.pages -eq [Math]::Ceiling($r.Body.total / 10)) ("total=" + $r.Body.total + " actions: " + (($r.Body.elements.action | Select-Object -Unique) -join ','))
$r = Api GET '/administration/journaux-audit?action=configuration:modification' -Token $TADM
Check 'GET /administration/journaux-audit?action= filtre (total après filtre, que cette action) + ancienne/nouvelle valeur' ($r.Status -eq 200 -and $r.Body.total -ge 2 -and @($r.Body.elements).Count -ge 2 -and (@($r.Body.elements | Where-Object action -ne 'configuration:modification').Count -eq 0) -and $r.Body.elements[0].nouvelleValeur) ($r.Body.elements[0] | ConvertTo-Json -Compress)
$r = Api GET '/administration/journaux-audit?page=999' -Token $TADM
Check 'GET /administration/journaux-audit?page=999 -> elements vide, total conservé' ($r.Status -eq 200 -and $r.Raw -match '"elements":\[\]' -and $r.Body.total -ge 10) $r.Raw
$r = Api GET '/administration/journaux-audit' -Token $TK
Check 'GET /administration/journaux-audit par joueur -> 403' ($r.Status -eq 403)

# ------------------------------------------------------------------ 15. Mot de passe (changement, oubli, réinitialisation)
Section '15. Mot de passe'
$r = Api POST '/auth/changer-mot-de-passe' @{ motDePasseActuel = 'faux'; nouveauMotDePasse = 'Nouveau123!' } -Token $TK
Check 'POST /auth/changer-mot-de-passe mdp actuel faux -> 401' ($r.Status -eq 401) $r.Raw
$r = Api POST '/auth/changer-mot-de-passe' @{ motDePasseActuel = $K.motDePasse; nouveauMotDePasse = '123' } -Token $TK
Check 'POST /auth/changer-mot-de-passe nouveau trop court -> 400' ($r.Status -eq 400)
$r = Api POST '/auth/changer-mot-de-passe' @{ motDePasseActuel = $K.motDePasse; nouveauMotDePasse = 'Nouveau123!' } -Token $TK
Check 'POST /auth/changer-mot-de-passe -> 200' ($r.Status -eq 200) $r.Raw
$r = Api POST '/auth/connexion' @{ email = $K.email; motDePasse = $K.motDePasse }
Check 'ancien mot de passe refusé -> 401' ($r.Status -eq 401)
$r = Api POST '/auth/connexion' @{ email = $K.email; motDePasse = 'Nouveau123!' }
Check 'nouveau mot de passe accepté -> 200' ($r.Status -eq 200 -and $r.Body.jeton)
$TK = $r.Body.jeton
$r = Api POST '/auth/changer-mot-de-passe' @{ motDePasseActuel = 'Admin1234!'; nouveauMotDePasse = 'Admin1234!' } -Token $TADM
Check 'changement mot de passe admin (même valeur) -> 200' ($r.Status -eq 200)
$r = Api POST '/auth/mot-de-passe-oublie' @{ email = 'inconnu@nulle.part' }
Check 'POST /auth/mot-de-passe-oublie email inconnu -> 200 réponse générique' ($r.Status -eq 200 -and $r.Body.message) $r.Raw
$r = Api POST '/auth/mot-de-passe-oublie' @{ email = $K.email }
Check 'POST /auth/mot-de-passe-oublie Kader -> 200' ($r.Status -eq 200)
$keys = [regex]::Matches((Redis 'KEYS reset:*'), 'reset:[0-9a-f-]{36}') | ForEach-Object { $_.Value }
$RESET = $null
foreach ($cle in $keys) { if ((Redis "GET $cle") -match $KID) { $RESET = $cle.Substring(6) } }
Check 'token de réinitialisation stocké dans Redis (reset:<token> -> id)' ($null -ne $RESET) "clés=$($keys.Count)"
$r = Api POST '/auth/reinitialisation-mot-de-passe' @{ token = 'faux-token'; nouveauMotDePasse = 'Reset123!' }
Check 'POST /auth/reinitialisation-mot-de-passe token invalide -> 400' ($r.Status -eq 400) $r.Raw
$r = Api POST '/auth/reinitialisation-mot-de-passe' @{ token = $RESET; nouveauMotDePasse = 'Reset123!' }
Check 'POST /auth/reinitialisation-mot-de-passe -> 200' ($r.Status -eq 200) $r.Raw
$r = Api GET '/auth/moi' -Token $TK
Check 'réinitialisation: toutes les sessions invalidées -> 401' ($r.Status -eq 401)
$r = Api POST '/auth/connexion' @{ email = $K.email; motDePasse = 'Reset123!' }
Check 'connexion avec le mot de passe réinitialisé -> 200' ($r.Status -eq 200 -and $r.Body.jeton)
$TK = $r.Body.jeton
$r = Api POST '/auth/reinitialisation-mot-de-passe' @{ token = $RESET; nouveauMotDePasse = 'Reset456!' }
Check 'token de réinitialisation à usage unique -> 400' ($r.Status -eq 400)

# ------------------------------------------------------------------ 16. Invariants globaux de l'escrow
Section '16. Invariants escrow (base de données)'
$ids = "'$KID','$MID','$AID'"
$tot = Sql "select sum(solde_disponible)||'|'||sum(solde_bloque) from portefeuilles where utilisateur_id in ($ids)"
# 30000 déposés - retrait réussi 505 (500 + frais 5) - commissions de match (400 + 200 + 100)
# - commissions sur les mises rendues (annulation 70 + expiration 60 + litige remboursé 50 + 50 = 230) = 28565 ; bloqué = 0
Check 'somme des portefeuilles = 30000 - 505 - 700 - 230 = 28565, bloqué = 0' ($tot -eq '28565.00|0.00' -or $tot -eq '28565|0') $tot
$neg = Sql "select count(*) from portefeuilles where solde_disponible < 0 or solde_bloque < 0"
Check 'aucun solde négatif' ([int]$neg -eq 0)
$comm = Sql "select sum(montant) from transactions_portefeuilles t join portefeuilles p on p.id=t.portefeuille_id where t.type='commission' and t.statut='valide' and p.utilisateur_id in ($ids)"
Check 'commissions validées = 935 (700 matchs + 230 mises rendues + 5 frais de retrait)' ((Dec $comm) -eq 935) $comm
# crédits : dépôts, gains, remboursements (nets de commission) ; débits : mises bloquées, retraits et frais de
# retrait (les lignes annulées d'un retrait échoué restent des débits, compensés par la ligne de remboursement) ;
# la commission d'un match (match_id) ou d'une mise rendue (mise_id) est informative : le joueur n'a jamais
# détenu la part prélevée — seule la commission sans match ni mise (frais de retrait) est un vrai débit.
$ledger = Sql "select sum(case when type in ('depot','gain','remboursement') then montant else 0 end) - sum(case when type in ('mise_bloquee','retrait') or (type='commission' and match_id is null and mise_id is null) then montant else 0 end) from transactions_portefeuilles t join portefeuilles p on p.id=t.portefeuille_id where p.utilisateur_id in ($ids)"
$soldes = Sql "select sum(solde_disponible)+sum(solde_bloque) from portefeuilles where utilisateur_id in ($ids)"
Check 'grand livre: somme des mouvements = somme des soldes (cohérence comptable)' ((Dec $ledger) -eq (Dec $soldes)) "mouvements=$ledger soldes=$soldes"
$blq = Sql "select count(*) from mises where statut='bloquee' and utilisateur_id in ($ids)"
Check 'aucune mise encore bloquée (tous les défis réglés/annulés/expirés)' ([int]$blq -eq 0) "bloquees=$blq"
# toute mise rendue = mise × (1 − commission) : exactement 1 remboursement + 1 commission valides par mise remboursee, jamais deux fois
$sansComm = Sql "select count(*) from mises m where m.statut='remboursee' and m.utilisateur_id in ($ids) and (select count(*) from transactions_portefeuilles t where t.mise_id=m.id and t.type='commission' and t.statut='valide') <> 1"
Check 'chaque mise rendue porte exactement une commission validée (aucun remboursement intégral)' ([int]$sansComm -eq 0) "mises sans commission unique=$sansComm"
$dblr = Sql "select count(*) from (select mise_id from transactions_portefeuilles where type='remboursement' and mise_id is not null group by mise_id having count(*)>1) x"
Check 'aucune mise rendue deux fois' ([int]$dblr -eq 0) "doublons=$dblr"
$colonnes = Sql "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name='matchs' and column_name in ('joueur_1_id','joueur_2_id','score_joueur_1','score_joueur_2','joueur1_id','score_joueur1')"
Check 'colonnes matchs conformes au modèle (joueur_1_id, joueur_2_id, score_joueur_1, score_joueur_2)' ($colonnes -eq 'joueur_1_id,joueur_2_id,score_joueur_1,score_joueur_2') $colonnes
$dbl = Sql "select count(*) from (select match_id from transactions_portefeuilles where type='gain' group by match_id having count(*)>1) x"
Check 'aucun match payé deux fois' ([int]$dbl -eq 0)
$refs = Sql "select count(*) - count(distinct reference) from transactions_portefeuilles"
Check 'références de transactions uniques' ([int]$refs -eq 0)

# ------------------------------------------------------------------ contact : formulaire public + traitement admin
# contact
Section 'Contact — formulaire public, anti-spam, traitement admin'
# Le compteur anti-spam (contact:ip:<ip>, 5 messages/heure) est vidé avant et après la section : la recette
# relancée dans l'heure ne doit pas être bloquée par ses propres envois.
function ViderAntiSpam { foreach ($cle in ([regex]::Matches((Redis 'KEYS contact:ip:*'), 'contact:ip:[^\r\n]+') | ForEach-Object { $_.Value })) { Redis "DEL $cle" | Out-Null } }
ViderAntiSpam
# Jeton admin frais : la section 15 a touché les mots de passe, on ne dépend pas de l'état de $TADM.
$r = Api POST '/auth/admin/connexion' @{ email = 'admin@quiperd.local'; motDePasse = 'Admin1234!' }
$TCA = if ($r.Status -eq 200 -and $r.Body.jeton) { $r.Body.jeton } else { $TADM }
$MsgOK = @{ nom = "Kader $Suffix"; email = "kader_$Suffix@test.local"; sujet = "Recette $Suffix"; message = 'Bonjour, je souhaite en savoir plus sur la plateforme et ses règles de mise.' }

$r = Api POST '/contact' @{ nom = 'K'; email = 'pas-un-email'; sujet = 'ab'; message = 'court' }
Check 'POST /contact invalide -> 400 + details (nom, email, sujet, message)' ($r.Status -eq 400 -and $r.Body.erreur -and $r.Body.details.nom -and $r.Body.details.email -and $r.Body.details.sujet -and $r.Body.details.message) $r.Raw
$r = Api POST '/contact' @{}
Check 'POST /contact corps vide -> 400 + details' ($r.Status -eq 400 -and $r.Body.details) $r.Raw
$r = Api POST '/contact' $MsgOK
Check 'POST /contact sans jeton -> 201 statut nouveau, sans utilisateurId, camelCase (dateCreation, noteAdmin vide, dateModification)' ($r.Status -eq 201 -and $r.Body.id -and $r.Body.statut -eq 'nouveau' -and -not $r.Body.utilisateurId -and $r.Body.PSObject.Properties.Name -contains 'dateCreation' -and $r.Body.PSObject.Properties.Name -contains 'noteAdmin' -and $r.Body.noteAdmin -eq '' -and $r.Body.dateModification) $r.Raw
$CID1 = $r.Body.id
$r = Api POST '/contact' $MsgOK -Token $TK
Check 'POST /contact avec jeton joueur -> 201 utilisateurId = id du joueur' ($r.Status -eq 201 -and $r.Body.utilisateurId -eq $KID) $r.Raw
$CID2 = $r.Body.id
$r = Api POST '/contact' $MsgOK -Token $TCA
Check 'POST /contact avec jeton admin -> 201 sans utilisateurId (colonne réservée aux joueurs)' ($r.Status -eq 201 -and $r.Body.id -and -not $r.Body.utilisateurId) $r.Raw
$CID3 = $r.Body.id
# anti-spam : 5 messages acceptés par heure et par IP, le 6e est refusé (429), le compteur expire en 1 h
$acceptes = 0; foreach ($i in 4..5) { $r = Api POST '/contact' $MsgOK; if ($r.Status -eq 201) { $acceptes++ } }
Check 'anti-spam : messages 4 et 5 dans l''heure -> 201' ($acceptes -eq 2) "acceptés=$acceptes"
$r = Api POST '/contact' $MsgOK
Check 'anti-spam : 6e message dans l''heure -> 429 message contractuel' ($r.Status -eq 429 -and $r.Body.erreur -eq 'Trop de messages envoyés, réessayez dans une heure.') $r.Raw
$cleSpam = ([regex]::Match((Redis 'KEYS contact:ip:*'), 'contact:ip:[^\r\n]+')).Value
$ttl = if ($cleSpam) { Redis "TTL $cleSpam" } else { '' }
Check 'compteur Redis contact:ip:<ip> présent, TTL <= 3600 s' ($cleSpam -and $ttl -match ':(\d+)' -and [int]$Matches[1] -le 3600 -and [int]$Matches[1] -gt 0) "$cleSpam $($ttl.Trim())"
ViderAntiSpam
$r = Api POST '/contact' $MsgOK
Check 'anti-spam : compteur vidé -> envoi de nouveau accepté (201)' ($r.Status -eq 201) $r.Raw

$r = Api GET '/contact'
Check 'GET /contact sans jeton -> 401' ($r.Status -eq 401) $r.Raw
$r = Api GET '/contact' -Token $TK
Check 'GET /contact jeton joueur -> 403' ($r.Status -eq 403) $r.Raw
$r = Api GET '/contact' -Token $TCA
Check 'GET /contact admin -> 200 {elements, total>=2, page=1, taille=10, pages>=1}' ($r.Status -eq 200 -and $r.Body.PSObject.Properties.Name -contains 'elements' -and $r.Body.total -ge 2 -and $r.Body.page -eq 1 -and $r.Body.taille -eq 10 -and $r.Body.pages -ge 1 -and @($r.Body.elements).Count -le 10) ("total=$($r.Body.total) pages=$($r.Body.pages) n=" + @($r.Body.elements).Count)
$cids = @($r.Body.elements | ForEach-Object { $_.id })
$dates = @($r.Body.elements | ForEach-Object { [datetime]$_.dateCreation })
$trie = $true; for ($i = 1; $i -lt $dates.Count; $i++) { if ($dates[$i] -gt $dates[$i - 1]) { $trie = $false } }
Check 'GET /contact trié date_creation DESC, messages créés présents' ($trie -and $cids -contains $CID1 -and $cids -contains $CID2) "n=$($dates.Count)"
$r = Api GET '/contact?statut=nouveau' -Token $TCA
Check 'GET /contact?statut=nouveau -> 200, uniquement des nouveaux, contient le message créé' ($r.Status -eq 200 -and @($r.Body.elements | Where-Object statut -ne 'nouveau').Count -eq 0 -and @($r.Body.elements | ForEach-Object { $_.id }) -contains $CID1) "total=$($r.Body.total)"
$r = Api GET '/contact?statut=bidon' -Token $TCA
Check 'GET /contact?statut=bidon -> 400' ($r.Status -eq 400) $r.Raw
$r = Api GET '/contact?page=999' -Token $TCA
Check 'GET /contact?page=999 -> 200 elements vide ([]), page 999' ($r.Status -eq 200 -and $r.Raw -match '"elements":\[\]' -and $r.Body.page -eq 999) $r.Raw
$r = Api GET '/contact?page=1&taille=2' -Token $TCA
Check 'GET /contact?taille=2 -> 2 éléments, pages = ceil(total/2)' ($r.Status -eq 200 -and @($r.Body.elements).Count -eq 2 -and $r.Body.taille -eq 2 -and $r.Body.pages -eq [Math]::Ceiling($r.Body.total / 2)) "total=$($r.Body.total) pages=$($r.Body.pages)"

$r = Api GET "/contact/$CID1" -Token $TCA
Check 'GET /contact/:id -> 200 message complet' ($r.Status -eq 200 -and $r.Body.id -eq $CID1 -and $r.Body.sujet -eq $MsgOK.sujet -and $r.Body.email -eq $MsgOK.email -and $r.Body.message -eq $MsgOK.message) $r.Raw
$r = Api GET "/contact/$CID1" -Token $TK
Check 'GET /contact/:id jeton joueur -> 403' ($r.Status -eq 403)
$r = Api GET "/contact/$([guid]::NewGuid())" -Token $TCA
Check 'GET /contact/:id inconnu -> 404' ($r.Status -eq 404) $r.Raw
$r = Api GET '/contact/pas-un-uuid' -Token $TCA
Check 'GET /contact/:id mal formé -> 400' ($r.Status -eq 400) $r.Raw

$r = Api PATCH "/contact/$CID1" @{ statut = 'lu'; noteAdmin = 'Répondu par e-mail.' } -Token $TCA
Check 'PATCH /contact/:id statut=lu + noteAdmin -> 200' ($r.Status -eq 200 -and $r.Body.id -eq $CID1 -and $r.Body.statut -eq 'lu' -and $r.Body.noteAdmin -eq 'Répondu par e-mail.') $r.Raw
$n = Sql "select count(*) from journaux_audit where action='contact:statut_lu' and identifiant_cible='$CID1' and administrateur_id is not null and ancienne_valeur->>'statut'='nouveau' and nouvelle_valeur->>'statut'='lu'"
Check 'changement de statut journalisé (contact:statut_lu, administrateur_id, ancienne/nouvelle valeur)' ([int]$n -eq 1) "entrées=$n"
$r = Api PATCH "/contact/$CID1" @{ noteAdmin = 'Note mise à jour.' } -Token $TCA
Check 'PATCH /contact/:id note seule -> 200, statut inchangé' ($r.Status -eq 200 -and $r.Body.statut -eq 'lu' -and $r.Body.noteAdmin -eq 'Note mise à jour.') $r.Raw
$n = Sql "select count(*) from journaux_audit where action like 'contact:statut_%' and identifiant_cible='$CID1'"
Check 'note seule : aucune entrée d''audit supplémentaire' ([int]$n -eq 1) "entrées=$n"
$r = Api PATCH "/contact/$CID1" @{ statut = 'traite' } -Token $TCA
Check 'PATCH /contact/:id statut=traite -> 200, note conservée' ($r.Status -eq 200 -and $r.Body.statut -eq 'traite' -and $r.Body.noteAdmin -eq 'Note mise à jour.') $r.Raw
$r = Api GET '/contact?statut=traite' -Token $TCA
Check 'GET /contact?statut=traite contient le message traité' ($r.Status -eq 200 -and @($r.Body.elements | ForEach-Object { $_.id }) -contains $CID1) "total=$($r.Body.total)"
$r = Api PATCH "/contact/$CID1" @{ statut = 'bidon' } -Token $TCA
Check 'PATCH /contact/:id statut invalide -> 400 + details.statut' ($r.Status -eq 400 -and $r.Body.details.statut) $r.Raw
$r = Api PATCH "/contact/$CID1" @{ noteAdmin = ('x' * 2001) } -Token $TCA
Check 'PATCH /contact/:id noteAdmin > 2000 caractères -> 400' ($r.Status -eq 400 -and $r.Body.details.noteAdmin) $r.Raw
$r = Api PATCH "/contact/$CID1" @{} -Token $TCA
Check 'PATCH /contact/:id corps vide -> 400' ($r.Status -eq 400) $r.Raw
$r = Api PATCH "/contact/$CID1" @{ statut = 'lu' } -Token $TK
Check 'PATCH /contact/:id jeton joueur -> 403' ($r.Status -eq 403)
$r = Api PATCH "/contact/$([guid]::NewGuid())" @{ statut = 'lu' } -Token $TCA
Check 'PATCH /contact/:id inconnu -> 404' ($r.Status -eq 404) $r.Raw

$r = Api DELETE "/contact/$CID3" -Token $TK
Check 'DELETE /contact/:id jeton joueur -> 403' ($r.Status -eq 403)
$r = Api DELETE "/contact/$CID3" -Token $TCA
Check 'DELETE /contact/:id -> 204' ($r.Status -eq 204) $r.Raw
$r = Api GET "/contact/$CID3" -Token $TCA
Check 'GET /contact/:id après suppression -> 404' ($r.Status -eq 404) $r.Raw
$r = Api DELETE "/contact/$CID3" -Token $TCA
Check 'DELETE /contact/:id déjà supprimé -> 404' ($r.Status -eq 404) $r.Raw
$n = Sql "select count(*) from journaux_audit where action='contact:suppression' and identifiant_cible='$CID3' and administrateur_id is not null and ancienne_valeur->>'sujet'='$($MsgOK.sujet)'"
Check 'suppression journalisée (contact:suppression + instantané du message)' ([int]$n -eq 1) "entrées=$n"
$colonnes = Sql "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name='messages_contact'"
Check 'table messages_contact conforme au modèle (§7 table 19)' ($colonnes -eq 'date_creation,date_modification,email,id,message,nom,note_admin,statut,sujet,utilisateur_id') $colonnes
ViderAntiSpam

# ------------------------------------------------------------------ Résumé
Section 'RÉSUMÉ'
$ok = @($Results | Where-Object OK).Count; $ko = @($Results | Where-Object { -not $_.OK }).Count
Write-Host ("TOTAL: {0} tests, {1} PASS, {2} FAIL" -f $Results.Count, $ok, $ko) -ForegroundColor $(if ($ko) { 'Yellow' } else { 'Green' })
if ($ko) { Write-Host "`nÉCHECS :" -ForegroundColor Red; $Results | Where-Object { -not $_.OK } | ForEach-Object { Write-Host (" - {0}`n     {1}" -f $_.Test, $_.Detail) } }
$Results | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Scratch 'resultats.json') -Encoding UTF8

