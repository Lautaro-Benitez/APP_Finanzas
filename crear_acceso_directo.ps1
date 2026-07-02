$TargetFile = "$PSScriptRoot\dist\finanzapp-win32-x64\finanzapp.exe"
$ShortcutFile = "$Home\Desktop\FinanzApp.lnk"
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutFile)
$Shortcut.TargetPath = $TargetFile
$Shortcut.Save()
Write-Host "Acceso directo creado en el escritorio exitosamente."
