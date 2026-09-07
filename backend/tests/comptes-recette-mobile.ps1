#Requires -Version 7
# Prépare deux comptes joueur pour la recette de l'application mobile.
#
# Les comptes passent par le PARCOURS RÉEL : inscription par l'API, confirmation de
# l'adresse avec le code à 6 chiffres lu dans Redis (il n'est jamais renvoyé par
# l'API), puis dépôt Mobile Money validé par l'administrateur. Aucun état n'est
# fabriqué directement en base : ce que la recette teste doit être ce que vit un
# vrai joueur.
#
# Usage : pwsh -File tests/comptes-recette-mobile.ps1

$ErrorActionPreference = 'Continue'
$Base = 'http://127.0.0.1:8080/api'   # IPv4 direct : « localhost » tente ::1 d'abord sous Windows

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

function CodeEmail([string]$UtilisateurId) {
  $rep = Redis "HGET verif:email:$UtilisateurId code"
  if ($rep -match '(\d{6})') { return $Matches[1] }
  return ''
}

# Un suffixe horaire évite les collisions de pseudo/e-mail entre deux passages.
$Suffixe = (Get-Date -Format 'HHmmss')
$MotDePasse = 'Recette1234!'

Write-Host "=== Connexion administrateur ===" -ForegroundColor Cyan
$admin = Api POST '/auth/admin/connexion' @{ email = 'admin@quiperd.local'; motDePasse = 'Admin1234!' }
if ($admin.Status -ne 200) { Write-Host "ÉCHEC connexion admin : $($admin.Raw)" -ForegroundColor Red; exit 1 }
$jetonAdmin = $admin.Body.jeton
Write-Host "admin connecté"

$comptes = @()
foreach ($profil in @(
    @{ pseudo = "kader$Suffixe"; pays = "Côte d'Ivoire"; tel = '+225 07 00 00 00 01' },
    @{ pseudo = "moussa$Suffixe"; pays = 'Sénégal'; tel = '+221 77 000 00 02' })) {

  $email = "$($profil.pseudo)@test.local"
  Write-Host "`n=== $($profil.pseudo) ===" -ForegroundColor Cyan

  $r = Api POST '/auth/inscription' @{
    nomUtilisateur = $profil.pseudo; email = $email; motDePasse = $MotDePasse
    telephone      = $profil.tel; pays = $profil.pays
  }
  if ($r.Status -ne 201) { Write-Host "ÉCHEC inscription : $($r.Raw)" -ForegroundColor Red; continue }
  $id = $r.Body.utilisateur.id
  $jeton = $r.Body.jeton
  Write-Host "inscrit ($id)"

  # Confirmation : le code vit uniquement dans Redis et dans le message envoyé.
  $code = CodeEmail $id
  if (-not $code) { Write-Host "ÉCHEC : code de confirmation introuvable en Redis" -ForegroundColor Red; continue }
  $r = Api POST '/auth/verification-email' @{ code = $code } -Token $jeton
  if ($r.Status -ne 200) { Write-Host "ÉCHEC confirmation : $($r.Raw)" -ForegroundColor Red; continue }
  Write-Host "adresse confirmée (code $code)"

  # Dépôt réel, puis validation manuelle par l'administrateur — le même chemin
  # qu'un retour de webhook réussi.
  # La passerelle vient de la route publique : le backend refuse celle qui n'est pas configurée.
  $presta = @((Api GET '/paiements/prestataires').Body)[0]
  $r = Api POST '/paiements/depot' @{ montant = 20000; prestataire = $presta.code; numero = $profil.tel } -Token $jeton
  if ($r.Status -ne 201) { Write-Host "ÉCHEC dépôt : $($r.Raw)" -ForegroundColor Red; continue }
  $paiementId = $r.Body.paiement.id
  $r = Api PATCH "/paiements/$paiementId/statut" @{ statut = 'reussi' } -Token $jetonAdmin
  if ($r.Status -ne 200) { Write-Host "ÉCHEC validation dépôt : $($r.Raw)" -ForegroundColor Red; continue }

  $r = Api GET '/portefeuille' $null $jeton
  Write-Host "solde disponible : $($r.Body.soldeDisponible) $($r.Body.devise)"

  $comptes += [pscustomobject]@{ Pseudo = $profil.pseudo; Email = $email; MotDePasse = $MotDePasse; Id = $id }
}

Write-Host "`n=== Comptes prêts pour la recette mobile ===" -ForegroundColor Green
$comptes | Format-Table -AutoSize
Write-Host "Mot de passe commun : $MotDePasse"
