# Deploying QA Monitor to your Windows Server VM (IIS)

## 1. Get the project files onto the VM

Pick whichever is easiest for you:

- **RDP clipboard/drive**: Open Remote Desktop to the VM, then either paste the
  `QA_Monitor` folder directly (RDP supports copy-paste of files), or map your
  local drive in the RDP session (Local Resources > More > Drives) so the VM
  can see your machine's files and you can copy from there.
- **Zip + upload**: Zip the `QA_Monitor` folder, upload it via RDP clipboard,
  a shared network drive, or `Copy-Item` over PowerShell Remoting if WinRM is
  already enabled between your machine and the VM, then unzip on the VM.
- **Cloud storage**: Drop the zip in OneDrive/SharePoint/a file share both
  machines can reach, then download it on the VM.

Put it anywhere on the VM, e.g. `C:\Deploy\QA_Monitor`.

## 2. Run the setup script

On the VM, open PowerShell **as Administrator**, then:

1. Open `setup-iis.ps1` (in this `deploy` folder) and edit the `$SourcePath`
   line near the top to point at wherever you put the project (e.g.
   `C:\Deploy\QA_Monitor`).
2. Run it:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\setup-iis.ps1
   ```
3. It will prompt you to set a password for the `qamonitor` login — that's
   the username/password your team will enter when the browser asks.

## 3. Open it

From any machine on the network:

- `https://<vm-ip>:8443` (self-signed cert — browser will warn "not secure",
  click "Advanced" > "Proceed" once; the connection is still encrypted)
- `http://<vm-ip>:8080` also works but sends the login unencrypted — avoid
  for real use, it's only there as a fallback if HTTPS gives you trouble.

Enter the `qamonitor` username and the password you set.

## Updating the site later

Whenever you change `index.html` / `style.css` / `app.js` on your dev
machine, just re-copy those files into `C:\inetpub\qa-monitor` on the VM
(overwrite) — no need to re-run the whole script. IIS picks up static file
changes immediately.

## Changing the password later

On the VM, in an elevated PowerShell:
```powershell
Set-LocalUser -Name qamonitor -Password (Read-Host -AsSecureString)
```

## Notes

- The app itself never sends data anywhere — everything (employees,
  projects, uploaded Excel sheets) is stored in each user's own browser.
  Basic Auth here only controls who can *open* the app, not shared data.
- If you later add a domain name pointed at this VM, you can swap the
  self-signed cert for a free trusted one via Let's Encrypt (e.g. using
  `win-acme`), which removes the browser warning.
