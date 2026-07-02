// js/utils/logger.js
// Sistema de logging condicional para desarrollo/producción

const DEBUG_MODE = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '';

export const logger = {
    log: DEBUG_MODE ? console.log.bind(console) : () => { },
    warn: DEBUG_MODE ? console.warn.bind(console) : () => { },
    error: console.error.bind(console), // Errores siempre se muestran
    info: DEBUG_MODE ? console.info.bind(console) : () => { },
    debug: DEBUG_MODE ? console.debug.bind(console) : () => { }
};

export default logger;