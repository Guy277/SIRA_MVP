# Retire les regles de pare-feu « SIRA dev » creees par autoriser-telephone.ps1
# (ports 8081 et 4000). A lancer en administrateur :
#   powershell -ExecutionPolicy Bypass -File scripts\windows\retirer-regles-telephone.ps1
# Le profil du reseau (Prive/Public) n'est pas modifie ; pour le remettre en Public :
#   Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Public

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Ce script doit etre lance en administrateur." -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows\retirer-regles-telephone.ps1"
    exit 1
}

$rules = @(Get-NetFirewallRule -DisplayName 'SIRA dev*' -ErrorAction SilentlyContinue)
if ($rules.Count -eq 0) {
    Write-Host "Aucune regle « SIRA dev » a retirer."
    exit 0
}
foreach ($rule in $rules) {
    Write-Host "Regle retiree : $($rule.DisplayName)"
}
$rules | Remove-NetFirewallRule
Write-Host "Termine : le telephone ne peut plus joindre ce PC sur 8081 et 4000." -ForegroundColor Green
