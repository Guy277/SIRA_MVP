# Autorise un telephone du MEME Wi-Fi a joindre SIRA en developpement :
# appli Expo (port 8081) et API (port 4000). A lancer une fois, en administrateur :
#   clic droit sur PowerShell > « Executer en tant qu'administrateur », puis
#   powershell -ExecutionPolicy Bypass -File scripts\windows\autoriser-telephone.ps1
#
# Securite : les regles ne valent que pour le profil reseau « Prive » et pour les
# appareils du reseau local (LocalSubnet). Jamais pour le profil « Public ».
# Pour tout retirer : scripts\windows\retirer-regles-telephone.ps1

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Ce script doit etre lance en administrateur." -ForegroundColor Yellow
    Write-Host "Clic droit sur PowerShell > « Executer en tant qu'administrateur », puis :"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows\autoriser-telephone.ps1"
    exit 1
}

$group = 'SIRA dev'
$rules = @(
    @{ Name = 'SIRA dev - appli Expo (8081)'; Port = 8081 },
    @{ Name = 'SIRA dev - API (4000)'; Port = 4000 }
)

foreach ($rule in $rules) {
    $existing = @(Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue)
    # Sans doublons : une seule regle par port.
    if ($existing.Count -gt 1) {
        $existing | Select-Object -Skip 1 | Remove-NetFirewallRule
        $existing = @($existing[0])
    }
    if ($existing.Count -eq 1) {
        $existing[0] | Set-NetFirewallRule -Direction Inbound -Action Allow -Profile Private -Enabled True
        $existing[0] | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $rule.Port
        $existing[0] | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -RemoteAddress LocalSubnet
        Write-Host "Regle mise a jour : $($rule.Name) (TCP $($rule.Port), profil Prive, reseau local)"
    } else {
        New-NetFirewallRule -DisplayName $rule.Name -Group $group -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $rule.Port -Profile Private -RemoteAddress LocalSubnet | Out-Null
        Write-Host "Regle creee : $($rule.Name) (TCP $($rule.Port), profil Prive, reseau local)"
    }
}

# Les regles ne s'appliquent qu'en « Prive » : un reseau en « Public » bloque toujours le telephone.
$public = @(Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' })
foreach ($network in $public) {
    Write-Host ""
    Write-Host "Le reseau « $($network.Name) » ($($network.InterfaceAlias)) est en Public : le telephone y reste bloque." -ForegroundColor Yellow
    Write-Host "Ne le passe en Prive que si c'est un reseau de confiance (maison, bureau) :"
    Write-Host "en Prive, Windows est plus visible des autres appareils du reseau."
    $answer = Read-Host "Passer « $($network.Name) » en Prive ? (o/N)"
    if ($answer -match '^(o|oui|y|yes)$') {
        Set-NetConnectionProfile -InterfaceIndex $network.InterfaceIndex -NetworkCategory Private
        Write-Host "« $($network.Name) » est maintenant en Prive." -ForegroundColor Green
    } else {
        Write-Host "Reseau laisse en Public. Autre solution : le partage de connexion du telephone."
    }
}

Write-Host ""
Write-Host "Termine. Relance « npm run dev:stack » : il affiche l'adresse a ouvrir sur le telephone." -ForegroundColor Green
