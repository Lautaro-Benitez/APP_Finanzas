// Preguntas de seguridad para recuperación de contraseña
const SECURITY_QUESTIONS = [
  "¿Cuál es el nombre de tu primera mascota?",
  "¿En qué ciudad naciste?",
  "¿Cuál es el nombre de soltera de tu madre?",
  "¿Cuál fue el nombre de tu primera escuela?"
];

// Exportar si se usa como módulo
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FINANZAPP_CONSTANTS, SECURITY_QUESTIONS };
}

// Constantes de la aplicación
const FINANZAPP_CONSTANTS = {
    
    // Claves de almacenamiento
    STORAGE_KEYS: {
        USERS: 'finanzapp_users',
        TRANSACTIONS: 'finanzapp_transactions',
        BUDGETS: 'finanzapp_budgets',
        SAVINGS: 'finanzapp_savings',
        CARDS: 'finanzapp_cards',
        CATEGORIES: 'finanzapp_categories',
        EXCHANGE_RATES: 'finanzapp_exchange_rates',
        SETTINGS: 'finanzapp_settings',
        CURRENT_USER: 'finanzapp_current_user'
    },
    
    // Tipos de transacción
    TRANSACTION_TYPES: {
        INCOME: 'income',
        EXPENSE: 'expense'
    },
    
    // Métodos de pago
    PAYMENT_METHODS: [
        'Efectivo',
        'Débito', 
        'Crédito',
        'Transferencia',
        'Ahorro'
    ],
    
    // Períodos de presupuesto
    BUDGET_PERIODS: [
        'semanal',
        'mensual', 
        'trimestral',
        'anual'
    ],
    
    // Niveles de alerta de presupuesto
    BUDGET_ALERT_LEVELS: {
        OK: 0.75,      // <75%
        WARNING: 0.90, // 75-89%  
        DANGER: 0.99,  // 90-99%
        EXCEEDED: 1.0  // >=100%
    },
    
    // Monedas soportadas
    CURRENCIES: {
        ARS: { code: 'ARS', symbol: '$', name: 'Peso Argentino' },
        USD: { code: 'USD', symbol: 'US$', name: 'Dólar Estadounidense' },
        EUR: { code: 'EUR', symbol: '€', name: 'Euro' }
    },
    
    // Roles de usuario
    USER_ROLES: {
        ADMIN: 'admin',
        USER: 'user'
    }

    
}

