# Registro de Cambios (Changelog)

> **🤖 NOTA PARA IA / DESARROLLADORES:** 
> Para actualizar la versión de este proyecto, **NO** modifiques los archivos manualmente. 
> Debes ejecutar obligatoriamente el comando: `npm run bump <nueva-version>` (ej: `npm run bump 3.5.0`). Esto actualizará automáticamente `package.json`, `version.json`, `index.html`, `app.js` y `README.md`.

Todas las modificaciones y mejoras notables de este proyecto se documentarán en este archivo.

## [3.7.0] - 2026-07-03
### Añadido
- **Sincronización Automática Local:** Nuevo sistema de persistencia de directorio (`Directory Handle Persistence`). Permite al usuario seleccionar una carpeta local obligatoria al iniciar la app, donde el sistema guardará automáticamente una copia de seguridad (`finanzapp_backup_auto.json`) cada 5 minutos.
- **Teclas Rápidas:** Soporte para la tecla `ESC` que permite cerrar rápidamente cualquier modal activo (con excepción de modales críticos como la instalación PWA y configuración de sincronización).

### Arreglado
- **UI/UX Mejorado:** Eliminadas barras de desplazamiento visuales (scrollbars) innecesarias en todos los modales para una estética más limpia.
- **Módulo de Reportes:** Rediseño del cuadro de advertencia de restauración con fondo transparente y tipografía amarilla, y estilización del panel de sincronización con indicador de ruta "Local".

## [3.6.0] - 2026-07-02
### Arreglado
- **Flujo PWA Estable:** Refactorización manual y definitiva del ciclo de vida del Service Worker y `index.html`. Se eliminó la dependencia del viejo `version.json` para evitar bucles infinitos por culpa de las cachés CDN. Ahora el sistema detecta de forma robusta las actualizaciones escuchando el evento nativo `updatefound` del navegador.

## [3.5.0] - 2026-07-02
### Arreglado
- **Actualizador PWA (Service Worker):** Se reescribió la estrategia del Service Worker a *Cache-First* para asegurar que el actualizador OTA (Over The Air) detecte cambios correctamente usando el archivo `version.json` sin redescargas invisibles.
- **Forzado de Actualización:** El botón "Recargar ahora" del modal de actualización ahora envía una orden estricta (`CLEAR_CACHE`) al Service Worker para eliminar la caché antigua antes de refrescar.

### Añadido
- **Automatización de Versiones:** Nuevo script `bump.js` ejecutable mediante `npm run bump <version>` para sincronizar de forma centralizada la versión en todos los archivos del proyecto (package.json, HTML, JS, README, version.json).

## [3.4.0] - 2026-07-02
### Añadido
- **Soporte PWA (Progressive Web App):** Ahora la aplicación puede instalarse nativamente en sistemas de escritorio (Windows, macOS, Linux) directamente desde el navegador a través de un nuevo modal de instalación.
- **Service Worker (`sw.js`):** Implementación de la base PWA con estrategia Network First.
- **Manifest de Aplicación (`manifest.json`):** Configuración para generar acceso directo, icono en el sistema y funcionamiento standalone.
- **Sistema Automático de Actualizaciones (OTA):** Comprobador de versiones en segundo plano que detecta nuevas releases en `version.json` y alerta al usuario mediante un modal in-app.
- **Nuevas Etiquetas en README:** Actualización visual de las tecnologías implementadas (Vanilla JS, HTML5, CSS3, Electron).

### Modificado
- `package.json`: Eliminados rastros del repositorio antiguo para migración limpia.
- `index.html`: Inyección de modales (instalación y actualización) y linkado al manifest PWA.
- Se actualizaron enlaces para que apunten al repositorio actual (`APP_Finanzas`).
