const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];

if (!newVersion) {
    console.error("❌ Error: Debes proporcionar una nueva versión.");
    console.log("Uso: npm run bump 3.5.0");
    process.exit(1);
}

console.log(`🚀 Actualizando todo el proyecto a la versión ${newVersion}...`);

try {
    // 1. Actualizar package.json
    const packagePath = path.join(__dirname, 'package.json');
    let pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    pkg.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
    console.log("✅ package.json actualizado");

    // 2. Actualizar version.json
    const versionPath = path.join(__dirname, 'version.json');
    fs.writeFileSync(versionPath, JSON.stringify({ version: newVersion }, null, 2) + '\n');
    console.log("✅ version.json actualizado");

    // 3. Actualizar js/app.js
    const appJsPath = path.join(__dirname, 'js', 'app.js');
    let appJs = fs.readFileSync(appJsPath, 'utf8');
    appJs = appJs.replace(/this\.version\s*=\s*'[^']+';/, `this.version = '${newVersion}';`);
    fs.writeFileSync(appJsPath, appJs);
    console.log("✅ js/app.js actualizado");

    // 4. Actualizar index.html (constante CURRENT_VERSION)
    const indexPath = path.join(__dirname, 'index.html');
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    indexHtml = indexHtml.replace(/const CURRENT_VERSION\s*=\s*"[^"]+";/, `const CURRENT_VERSION = "${newVersion}";`);
    fs.writeFileSync(indexPath, indexHtml);
    console.log("✅ index.html actualizado");

    // 5. Actualizar sw.js (CACHE_NAME)
    const swPath = path.join(__dirname, 'sw.js');
    let swJs = fs.readFileSync(swPath, 'utf8');
    swJs = swJs.replace(/const CACHE_NAME = 'finanzapp-cache-[0-9\.]+';/, `const CACHE_NAME = 'finanzapp-cache-${newVersion}';`);
    fs.writeFileSync(swPath, swJs);
    console.log("✅ sw.js actualizado");

    // 6. Actualizar README.md
    const readmePath = path.join(__dirname, 'README.md');
    let readme = fs.readFileSync(readmePath, 'utf8');
    readme = readme.replace(/# 💰 FinanzApp - Gestión de Finanzas Personales \(V[0-9\.]+\)/, `# 💰 FinanzApp - Gestión de Finanzas Personales (V${newVersion})`);
    readme = readme.replace(/badge\/version-[0-9\.]+-blue/, `badge/version-${newVersion}-blue`);
    fs.writeFileSync(readmePath, readme);
    console.log("✅ README.md actualizado");

    console.log(`\n🎉 ¡Actualización exitosa! Todos los archivos ahora reflejan la versión ${newVersion}.`);
    console.log(`No olvides documentar los cambios en CHANGELOG.md antes de subir a GitHub.`);

} catch (error) {
    console.error("❌ Ocurrió un error al actualizar la versión:", error);
}
