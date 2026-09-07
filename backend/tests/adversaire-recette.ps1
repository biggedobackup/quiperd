#Requires -Version 7
# Pilote l'ADVERSAIRE pendant la recette mobile.
#
# L'application tourne sous un compte, ce script joue l'autre par l'API : c'est
# ainsi qu'on vérifie que l'écran du joueur bouge tout seul, poussé par le
# socket, sans qu'on y touche. Un test où le même appareil joue les deux rôles
# ne prouverait rien du temps réel.
#
# Usage :
#   pwsh -File tests/adversaire-recette.ps1 -Pseudo moussa013419 -Action defis-ouverts
#   pwsh -File tests/adversaire-recette.ps1 -Pseudo moussa013419 -Action rejoindre -DefiId <uuid>
#   pwsh -File tests/adversaire-recette.ps1 -Pseudo moussa013419 -Action declarer -MatchId <uuid> -Pour 1 -Contre 3
#   pwsh -File tests/adversaire-recette.ps1 -Pseudo moussa013419 -Action confirmer -MatchId <uuid>
#   pwsh -File tests/adversaire-recette.ps1 -Pseudo moussa013419 -Action choix-nul -MatchId <uuid> -Choix rejouer
#   pwsh -File tests/adversaire-recette.ps1 -Pseudo moussa013419 -Action mes-matchs
#   pwsh -File tests/adversaire-recette.ps1 -Action arbitrer -LitigeId <uuid> -Decision remboursement

param(
  [string]$Pseudo = '',
  [Parameter(Mandatory = $true)][string]$Action,
  [string]$MotDePasse = 'Recette1234!',
  [string]$DefiId = '',
  [string]$MatchId = '',
  [string]$LitigeId = '',
  [string]$Choix = 'rejouer',
  [string]$Decision = 'remboursement',
  [string]$GagnantId = '',
  [int]$Pour = 0,
  [int]$Contre = 0
)

$ErrorActionPreference = 'Continue'
$Base = 'http://127.0.0.1:8080/api'

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

$jeton = ''
if ($Pseudo) {
  $r = Api POST '/auth/connexion' @{ email = $Pseudo; motDePasse = $MotDePasse }
  if ($r.Status -ne 200) { Write-Host "ÉCHEC connexion $Pseudo : $($r.Raw)" -ForegroundColor Red; exit 1 }
  $jeton = $r.Body.jeton
}

switch ($Action) {
  'defis-ouverts' {
    $r = Api GET '/defis/ouverts' $null $jeton
    $r.Body | Select-Object id, jeuNom, plateformeNom, montantMise, createurNom, statut | Format-Table -AutoSize
  }
  'rejoindre' {
    $r = Api POST "/defis/$DefiId/rejoindre" $null $jeton
    Write-Host "statut=$($r.Status)"; Write-Host $r.Raw
  }
  'mes-matchs' {
    $r = Api GET '/matchs' $null $jeton
    $r.Body | Select-Object id, joueur1Nom, joueur2Nom, statut, manche, montantMise, echeanceType | Format-Table -AutoSize
  }
  'declarer' {
    $r = Api POST "/matchs/$MatchId/declaration" @{ scorePour = $Pour; scoreContre = $Contre; commentaire = 'recette mobile' } $jeton
    Write-Host "statut=$($r.Status) -> $($r.Body.statut)"
  }
  'confirmer' {
    $r = Api POST "/matchs/$MatchId/confirmation" $null $jeton
    Write-Host "statut=$($r.Status) -> $($r.Body.statut) gagnant=$($r.Body.gagnantId)"
  }
  'choix-nul' {
    $r = Api POST "/matchs/$MatchId/choix-nul" @{ choix = $Choix } $jeton
    Write-Host "statut=$($r.Status) -> $($r.Body.statut) manche=$($r.Body.manche)"
  }
  'mes-litiges' {
    $r = Api GET '/litiges' $null $jeton
    $r.Body | Select-Object id, matchId, statut, motif | Format-Table -AutoSize
  }
  'arbitrer' {
    # Décision arbitrale : réservée à l'administration (le mobile ne l'expose pas).
    $a = Api POST '/auth/admin/connexion' @{ email = 'admin@quiperd.local'; motDePasse = 'Admin1234!' }
    if ($a.Status -ne 200) { Write-Host "ÉCHEC connexion admin" -ForegroundColor Red; exit 1 }
    $corps = @{ decision = $Decision }
    if ($GagnantId) { $corps['gagnantId'] = $GagnantId }
    $r = Api PATCH "/litiges/$LitigeId" $corps $a.Body.jeton
    Write-Host "statut=$($r.Status)"; Write-Host $r.Raw
  }
  'portefeuille' {
    $r = Api GET '/portefeuille' $null $jeton
    Write-Host "disponible=$($r.Body.soldeDisponible) bloqué=$($r.Body.soldeBloque)"
  }
  default { Write-Host "Action inconnue : $Action" -ForegroundColor Red }
}
