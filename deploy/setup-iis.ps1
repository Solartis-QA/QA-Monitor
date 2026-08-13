# Run this in an ELEVATED PowerShell prompt, directly on the VM (via RDP).
# It installs IIS, deploys the QA Monitor site, turns on Basic Auth with a
# dedicated local account, opens the firewall, and adds a self-signed HTTPS
# binding so credentials aren't sent in the clear.
#
# BEFORE RUNNING: copy the QA_Monitor folder onto the VM first (see README.md
# in this deploy folder for transfer options), and edit $SourcePath below to
# point at wherever you copied it.

$SiteName    = "QA-Monitor"
$SitePath    = "C:\inetpub\qa-monitor"
$SourcePath  = "C:\Path\To\QA_Monitor"   # <-- EDIT THIS to wherever you copied the project on the VM
$HttpPort    = 8080                       # avoid 80 in case Default Web Site already owns it
$HttpsPort   = 8443
$AuthUser    = "qamonitor"

# ---- 1. Install IIS + Basic Authentication feature ----
Install-WindowsFeature -Name Web-Server, Web-Basic-Auth, Web-Static-Content, `
  Web-Default-Doc, Web-Http-Errors, Web-Mgmt-Console -IncludeManagementTools

Import-Module WebAdministration

# ---- 2. Deploy the site files ----
New-Item -ItemType Directory -Force -Path $SitePath | Out-Null
Copy-Item -Path (Join-Path $SourcePath '*') -Destination $SitePath -Recurse -Force

# ---- 3. Create the site (skip if it already exists) ----
if (-not (Get-Website -Name $SiteName -ErrorAction SilentlyContinue)) {
  New-Website -Name $SiteName -PhysicalPath $SitePath -Port $HttpPort
} else {
  Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $SitePath
}

# ---- 4. Turn on Basic Auth, turn off Anonymous Auth ----
Set-WebConfigurationProperty -Filter /system.webServer/security/authentication/anonymousAuthentication `
  -Name enabled -Value $false -PSPath "IIS:\Sites\$SiteName"
Set-WebConfigurationProperty -Filter /system.webServer/security/authentication/basicAuthentication `
  -Name enabled -Value $true -PSPath "IIS:\Sites\$SiteName"

# ---- 5. Create the login account used by Basic Auth ----
$existing = Get-LocalUser -Name $AuthUser -ErrorAction SilentlyContinue
if (-not $existing) {
  $pw = Read-Host "Set a password for the '$AuthUser' login" -AsSecureString
  New-LocalUser -Name $AuthUser -Password $pw -PasswordNeverExpires -UserMayNotChangePassword
} else {
  Write-Host "User '$AuthUser' already exists — skipping creation. Reset its password with:"
  Write-Host "  Set-LocalUser -Name $AuthUser -Password (Read-Host -AsSecureString)"
}
# IIS impersonates this account to read files, so it needs NTFS read access:
icacls $SitePath /grant "${AuthUser}:(OI)(CI)RX" | Out-Null

# ---- 6. Self-signed HTTPS so Basic Auth isn't sent in cleartext ----
$cert = New-SelfSignedCertificate -DnsName "qa-monitor.local" -CertStoreLocation "cert:\LocalMachine\My"
New-WebBinding -Name $SiteName -Protocol https -Port $HttpsPort
(Get-Item "IIS:\SslBindings\0.0.0.0!$HttpsPort" -ErrorAction SilentlyContinue) | Out-Null
New-Item -Path "IIS:\SslBindings\0.0.0.0!$HttpsPort" -Value $cert -Force | Out-Null

# ---- 7. Open the firewall ----
New-NetFirewallRule -DisplayName "QA Monitor HTTP"  -Direction Inbound -Protocol TCP -LocalPort $HttpPort  -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "QA Monitor HTTPS" -Direction Inbound -Protocol TCP -LocalPort $HttpsPort -Action Allow -ErrorAction SilentlyContinue

Restart-WebItem "IIS:\Sites\$SiteName"

Write-Host ""
Write-Host "Done. From another machine, open:"
Write-Host "  http://<this-vm-ip>:$HttpPort   (no encryption — avoid for real use)"
Write-Host "  https://<this-vm-ip>:$HttpsPort (self-signed — browser will warn, click through)"
Write-Host "Login with username '$AuthUser' and the password you just set."
