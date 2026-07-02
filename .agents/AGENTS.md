# Reglas Generales del Proyecto FinanzApp

## Gestión de Versiones
**CRÍTICO:** Cuando se te pida (como IA) que cambies o actualices la versión de la aplicación, **NUNCA** debes modificar manualmente los archivos `package.json`, `version.json`, `index.html`, `js/app.js` o `README.md`. 

Para actualizar la versión, existe un script centralizado. Siempre debes usar la terminal y ejecutar:
```bash
npm run bump <nueva-version>
```
*(Ejemplo: `npm run bump 3.5.0`)*

El script se encargará de buscar y reemplazar todas las referencias globales de la versión en el proyecto de forma segura.
