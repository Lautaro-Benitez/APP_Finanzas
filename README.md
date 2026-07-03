# 💰 FinanzApp - Gestión de Finanzas Personales (V3.8.1)

[![Live](https://img.shields.io/badge/live-online-success)](https://lautaro-benitez.github.io/APP_Finanzas/)
[![Version](https://img.shields.io/badge/version-3.8.1-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Windows](https://img.shields.io/badge/Windows-supported-blue?style=flat&logo=windows&logoColor=white)
![macOS](https://img.shields.io/badge/macOS-supported-blue?style=flat&logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-supported-blue?style=flat&logo=linux&logoColor=white)

<!-- BADGES_START -->
[![Electron](https://img.shields.io/badge/Electron-33.4.11-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-Vanilla-E34F26?style=flat&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-Vanilla-1572B6?style=flat&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![Node.js](https://img.shields.io/badge/Node.js-Backend-43853D?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

**FinanzApp** es una potente aplicación de escritorio diseñada para el control total de tus finanzas personales de manera local, privada y segura. 

![Captura de pantalla de FinanzApp](Captura_de_pantalla_1.png)

---

## 🚀 Características Principales

- **Gestión Multi-Caja:** Control de múltiples billeteras y cajas (ARS/USD).
- **Control de Transacciones:** Registro detallado de ingresos y egresos.
- **Módulo de Préstamos:** Seguimiento exhaustivo de préstamos otorgados y recibidos, con sistemas de amortización integrados.
- **Cuotas Pendientes:** Gestión inteligente de compras en cuotas con vencimientos automáticos.
- **Reportes Avanzados:** Gráficos interactivos y análisis de tendencias.
- **Privacidad Total:** Tus datos nunca salen de tu computadora (IndexedDB local).
- **Exportación/Importación:** Copias de seguridad en formato JSON para portabilidad de datos.

---

## 🛠️ Requisitos e Instalación

### Requisitos
- **Sistema Operativo:** Windows 10/11 (macOS/Linux compatible via build).
- **Espacio en disco:** ~200 MB.

### Instalación (Usuario Final)
Esta aplicación es **portable**, no requiere una instalación tradicional:
1. Descarga el paquete `FinanzApp-win32-x64.zip`.
2. Extrae el contenido en una carpeta segura (ej: `Documentos/FinanzApp`).
3. Ejecuta `finanzapp.exe` para comenzar.

> [!TIP]
> Puedes crear un acceso directo en el escritorio haciendo clic derecho sobre el ejecutable y seleccionando "Enviar a > Escritorio".

### Desarrollo
Para ejecutar el entorno de desarrollo:
```bash
# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm start

# Generar ejecutable (Windows)
npm run pack:win
```

---

## 🔐 Seguridad y Primer Uso

**⚠️ Importante:** Durante el primer uso de la aplicación, es necesario **crear un usuario y una contraseña**. 

Toda la información y los datos que ingreses **se guardan localmente en tu propio dispositivo** (en el almacenamiento del navegador) y **NO en la nube**. Por lo tanto, para evitar la pérdida de información en caso de que ocurra algún problema con tu computadora, es **estrictamente necesario que realices backups (copias de seguridad) cada ciertos días** utilizando la opción de "Exportar" dentro de la configuración de la app.

---

## 📄 Licencia y Créditos

- **Desarrollado por:** [Lautaro Benitez](https://github.com/Lautaro-Benitez)
- **Tecnologías:** Electron, D3.js, Chart.js, Vanilla CSS & JS.

---
© 2026 Lautaro Benitez - Software de Gestión Personal.
