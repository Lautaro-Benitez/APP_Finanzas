# 💰 FinanzApp - Gestión de Finanzas Personales (V3.3.1)

![FinanzApp Logo](icon.png)

**FinanzApp** es una potente aplicación de escritorio diseñada para el control total de tus finanzas personales de manera local, privada y segura. 

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

Al iniciar por primera vez, la aplicación te guiará para configurar un **Usuario Admin**. Esta cuenta es local y se utiliza para proteger el acceso a tus datos. 

**Recomendación:** Utiliza la función de "Exportar Datos" en las configuraciones regularmente para mantener un respaldo externo de tu información financiera.

---

## 📄 Licencia y Créditos

- **Desarrollado por:** [IN3DITO®](https://in3dito.com.ar)
- **Tecnologías:** Electron, D3.js, Chart.js, Vanilla CSS & JS.

---
© 2026 IN3DITO - Software de Gestión Personal.
