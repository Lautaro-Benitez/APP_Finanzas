const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false, // Don't show until ready
        autoHideMenuBar: true, // Hides the top menu bar
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'icon.ico')
    });

    win.maximize(); // Maximize the window
    win.show(); // Show now that it is maximized

    win.loadFile('index.html');
}

app.whenReady().then(() => {
    createDesktopShortcut();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function createDesktopShortcut() {
    if (process.platform !== 'win32') return;

    const path = require('path');
    const { exec } = require('child_process');

    const desktopPath = app.getPath('desktop');
    const shortcutPath = path.join(desktopPath, 'FinanzApp.lnk');
    const exePath = process.execPath;

    // Use a simple powershell command to create shortcut
    // We use the exe itself as the icon source
    const psCommand = `
    $s=(New-Object -COM WScript.Shell).CreateShortcut('${shortcutPath}');
    $s.TargetPath='${exePath}';
    $s.IconLocation='${exePath}';
    $s.ShowCmd=3; 
    $s.Save()
  `;

    // ShowCmd=3 means Maximize, though the app logic handles it too.

    exec(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`, (err, stdout, stderr) => {
        if (err) {
            console.error('Shortcut creation failed:', err);
            console.error('Stderr:', stderr);
        }
    });
}
