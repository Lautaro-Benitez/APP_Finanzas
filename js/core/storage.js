// js/core/storage.js 

// Importar constantes
const STORAGE_KEYS = {
  USERS: 'finanzapp_users',
  TRANSACTIONS: 'finanzapp_transactions',
  BUDGETS: 'finanzapp_budgets',
  SAVINGS: 'finanzapp_savings',
  WALLETS: 'finanzapp_wallets',
  CATEGORIES: 'finanzapp_categories',
  CARDS: 'finanzapp_cards',
  EXCHANGE_RATES: 'finanzapp_exchange_rates',
  SETTINGS: 'finanzapp_settings',
  CURRENT_USER: 'finanzapp_current_user'
};

const DEFAULT_ADMIN = {
  id: 'admin',
  username: 'admin',
  password: 'admin123', // TEMPORAL: password en texto plano
  role: 'admin',
  name: 'Administrador',
  securityQuestion: '¿Cuál es el nombre de tu primera mascota?',
  securityAnswer: 'admin', // TEMPORAL: sin hash
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export class StorageManager {
  constructor() {
    this.prefix = 'finanzapp_';
    this.db = null;
    this.isIndexedDBAvailable = this.checkIndexedDBSupport();
    this.migrationCompleted = false;

    this.initDatabase();
  }

  // ========================================
  // INICIALIZACIÓN Y MIGRACIÓN
  // ========================================

  checkIndexedDBSupport() {
    try {
      // Verificar que los objetos globales existan
      if (typeof window === 'undefined' || !window.indexedDB || !window.Dexie) {
        return false;
      }
      // Intento básico de acceso
      return true;
    } catch (e) {
      console.warn('IndexedDB no disponible, usando localStorage', e);
      return false;
    }
  }

  async initDatabase() {
    if (!this.isIndexedDBAvailable) {
      console.warn('⚠️ Usando localStorage como fallback');
      return;
    }

    try {
      // Crear base de datos con Dexie
      this.db = new Dexie('FinanzAppDB');

      // Definir schema con índices optimizados
      this.db.version(2).stores({
        // Tabla principal con índices para queries rápidas
        transactions: 'id, userId, date, category, type, paymentMethod, walletId, currency',
        budgets: 'id, category, period, subcategory',
        savings: 'id, userId, walletId, currency',
        wallets: 'id, userId, type, currency',
        users: 'id, username, role',
        cards: 'id, userId, type',
        loans: 'id, userId, status, currency',

        // Configuraciones (sin índices, son documentos únicos)
        categories: 'id',
        exchangeRates: 'id',
        settings: 'id',
        auditLogs: 'id, timestamp, userId, action, entityType'
      });

      await this.db.open();
      console.log('✅ IndexedDB inicializada correctamente');

      // Migración automática desde localStorage (solo primera vez)
      if (!this.migrationCompleted) {
        await this.migrateFromLocalStorage();
      }

    } catch (error) {
      console.error('❌ Error inicializando IndexedDB:', error);
      this.isIndexedDBAvailable = false;
      console.warn('⚠️ Fallback a localStorage activado');
    }
  }

  async migrateFromLocalStorage() {
    try {
      // Verificar si ya se migró
      const migrationFlag = localStorage.getItem('finanzapp_migrated_to_indexeddb');
      if (migrationFlag === 'true') {
        this.migrationCompleted = true;
        return;
      }

      console.log('🔄 Iniciando migración desde localStorage...');

      const keysToMigrate = [
        'users', 'transactions', 'budgets', 'savings',
        'wallets', 'cards', 'categories', 'exchange_rates',
        'settings', 'audit_logs'
      ];

      let migratedCount = 0;

      for (const key of keysToMigrate) {
        const data = localStorage.getItem(this.prefix + key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            await this.saveToIndexedDB(key, parsed);
            migratedCount++;
            console.log(`  ✓ Migrado: ${key}`);
          } catch (e) {
            console.warn(`  ⚠️ No se pudo migrar: ${key}`, e);
          }
        }
      }

      // Marcar migración como completada
      localStorage.setItem('finanzapp_migrated_to_indexeddb', 'true');
      this.migrationCompleted = true;

      console.log(`✅ Migración completada: ${migratedCount} colecciones migradas`);

    } catch (error) {
      console.error('❌ Error en migración:', error);
    }
  }

  // ========================================
  // MÉTODOS GENÉRICOS (GET/SET)
  // ========================================

  async get(key, defaultValue = null) {
    try {
      if (this.isIndexedDBAvailable && this.db) {
        return await this.getFromIndexedDB(key, defaultValue);
      } else {
        return await this.getFromLocalStorage(key, defaultValue);
      }
    } catch (error) {
      console.error(`Error getting ${key}:`, error);
      return defaultValue;
    }
  }

  async set(key, value) {
    try {
      if (this.isIndexedDBAvailable && this.db) {
        return await this.saveToIndexedDB(key, value);
      } else {
        return await this.saveToLocalStorage(key, value);
      }
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      return false;
    }
  }

  // ========================================
  // INDEXEDDB OPERATIONS
  // ========================================

  async getFromIndexedDB(key, defaultValue) {
    const tableName = this.getTableName(key);

    // Para tablas con múltiples registros
    if (['transactions', 'budgets', 'savings', 'wallets', 'users', 'cards', 'auditLogs'].includes(tableName)) {
      const records = await this.db[tableName].toArray();
      return records.length > 0 ? records : defaultValue;
    }

    // Para configuraciones (documento único)
    const record = await this.db[tableName].get(key);
    if (record) {
      return record.data;
    }

    // Si no existe, guardar y retornar default
    if (defaultValue !== null) {
      await this.db[tableName].put({ id: key, data: defaultValue });
    }

    return defaultValue;
  }

  async saveToIndexedDB(key, value) {
    const tableName = this.getTableName(key);

    // Para tablas con múltiples registros
    if (['transactions', 'budgets', 'savings', 'wallets', 'users', 'cards', 'auditLogs'].includes(tableName)) {
      if (!Array.isArray(value)) {
        console.error(`Expected array for ${tableName}, got:`, typeof value);
        return false;
      }

      // Usar bulkPut para mejor rendimiento
      await this.db[tableName].clear();
      await this.db[tableName].bulkPut(value);
      return true;
    }

    // Para configuraciones (documento único)
    await this.db[tableName].put({ id: key, data: value });
    return true;
  }

  getTableName(key) {
    const mapping = {
      'users': 'users',
      'transactions': 'transactions',
      'budgets': 'budgets',
      'savings': 'savings',
      'wallets': 'wallets',
      'cards': 'cards',
      'loans': 'loans',
      'categories': 'categories',
      'exchange_rates': 'exchangeRates',
      'settings': 'settings',
      'audit_logs': 'auditLogs'
    };

    return mapping[key] || 'settings';
  }

  // ========================================
  // LOCALSTORAGE FALLBACK
  // ========================================

  async getFromLocalStorage(key, defaultValue) {
    try {
      const stored = localStorage.getItem(this.prefix + key);
      if (!stored) return defaultValue;
      return JSON.parse(stored);
    } catch (error) {
      console.error(`Error reading from localStorage: ${key}`, error);
      return defaultValue;
    }
  }

  async saveToLocalStorage(key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error writing to localStorage: ${key}`, error);
      return false;
    }
  }

  // ========================================
  // MÉTODOS ESPECÍFICOS (API PÚBLICA)
  // ========================================

  async getUsers() {
    try {
      const users = await this.get('users', []);

      // Si no hay usuarios, devolver array vacío para desencadenar el flujo de Primer Inicio
      if (users.length === 0) {
        return [];
      }

      // Migrar usuarios antiguos con password en texto plano
      let needsMigration = false;
      const migratedUsers = await Promise.all(users.map(async (user) => {
        // Verificar disponibilidad de bcrypt antes de intentar migrar
        const isBcryptReady = typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt;

        // Si tiene 'password' en lugar de 'passwordHash', migrar SOLO si bcrypt está listo
        if (user.password && !user.passwordHash && isBcryptReady) {
          try {
            needsMigration = true;
            const passwordHash = await dcodeIO.bcrypt.hash(user.password, 10);
            const { password, ...userWithoutPassword } = user;
            return {
              ...userWithoutPassword,
              passwordHash
            };
          } catch (hashError) {
            console.warn('⚠️ Error al hashear password durante migración, omitiendo:', hashError);
            return user; // Retornar usuario sin cambios si falla el hash
          }
        } else if (user.password && !user.passwordHash && !isBcryptReady) {
          // Logear solo una vez o de manera discreta para no spammear
          if (users.indexOf(user) === 0) console.warn('⚠️ Bcrypt no disponible, posponiendo migración de seguridad.');
        }
        return user;
      }));

      // Guardar usuarios migrados
      if (needsMigration) {
        await this.saveUsers(migratedUsers);
        return migratedUsers;
      }

      return users;

    } catch (error) {
      console.error('Error al obtener usuarios:', error);
      return [DEFAULT_ADMIN];
    }
  }

  async saveUsers(users) {
    return await this.set('users', users);
  }

  async getTransactions() {
    return await this.get('transactions', []);
  }

  async saveTransactions(transactions) {
    return await this.set('transactions', transactions);
  }

  async getBudgets() {
    return await this.get('budgets', []);
  }

  async saveBudgets(budgets) {
    return await this.set('budgets', budgets);
  }

  async getSavings() {
    return await this.get('savings', []);
  }

  async saveSavings(savings) {
    return await this.set('savings', savings);
  }

  async getCards() {
    return await this.get('cards', []);
  }

  async saveCards(cards) {
    return await this.set('cards', cards);
  }

  async getLoans() {
    return await this.get('loans', []);
  }

  async saveLoans(loans) {
    return await this.set('loans', loans);
  }

  async getCategories() {
    return await this.get('categories', {
      income: [
        { name: 'Salarios', subs: ['Trabajo 1', 'Trabajo 2', 'Trabajo 3'] },
        { name: 'Freelance', subs: [] },
        { name: 'Inversiones', subs: [] },
        { name: 'Préstamos', subs: ['Préstamo recibido', 'Cobro de préstamo'] }
      ],
      expense: [
        { name: 'Alimentación', subs: ['Supermercado', 'Restaurantes'] },
        { name: 'Transporte', subs: ['Combustible', 'Transporte público'] },
        { name: 'Servicios', subs: ['Luz', 'Gas', 'Agua', 'Internet'] },
        { name: 'Entretenimiento', subs: [] },
        { name: 'Salud', subs: [] },
        { name: 'Ahorro', subs: [] },
        { name: 'Préstamos', subs: ['Pago de deuda'] }
      ]
    });
  }

  async saveCategories(categories) {
    return await this.set('categories', categories);
  }

  async getWallets() {
    return await this.get('wallets', []);
  }

  async saveWallets(wallets) {
    return await this.set('wallets', wallets);
  }

  async getExchangeRates() {
    return await this.get('exchange_rates', {
      ARS: 1,
      USD: 1000,
      EUR: 1100,
      lastUpdated: new Date().toISOString(),
      source: 'default'
    });
  }

  async saveExchangeRates(rates) {
    return await this.set('exchange_rates', rates);
  }

  async getSettings() {
    return await this.get('settings', {
      currency: 'ARS',
      language: 'es',
      dateFormat: 'dd/MM/yyyy',
      defaultWallet: null
    });
  }

  async saveSettings(settings) {
    return await this.set('settings', settings);
  }

  // ========================================
  // QUERIES OPTIMIZADAS (NUEVO)
  // ========================================

  /**
   * Query optimizada: Transacciones por fecha
   * Usa índice de fecha para búsqueda rápida
   */
  async getTransactionsByDateRange(startDate, endDate) {
    if (!this.isIndexedDBAvailable || !this.db) {
      const all = await this.getTransactions();
      return all.filter(t => t.date >= startDate && t.date <= endDate);
    }

    return await this.db.transactions
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
  }

  /**
   * Query optimizada: Transacciones por categoría
   */
  async getTransactionsByCategory(category, startDate = null, endDate = null) {
    if (!this.isIndexedDBAvailable || !this.db) {
      const all = await this.getTransactions();
      let filtered = all.filter(t => t.category === category);
      if (startDate && endDate) {
        filtered = filtered.filter(t => t.date >= startDate && t.date <= endDate);
      }
      return filtered;
    }

    let query = this.db.transactions.where('category').equals(category);

    if (startDate && endDate) {
      const results = await query.toArray();
      return results.filter(t => t.date >= startDate && t.date <= endDate);
    }

    return await query.toArray();
  }

  /**
   * Query optimizada: Transacciones por usuario
   */
  async getTransactionsByUser(userId) {
    if (!this.isIndexedDBAvailable || !this.db) {
      const all = await this.getTransactions();
      return all.filter(t => t.userId === userId);
    }

    return await this.db.transactions
      .where('userId')
      .equals(userId)
      .toArray();
  }

  /**
   * Query optimizada: Wallets por moneda
   */
  async getWalletsByCurrency(currency) {
    if (!this.isIndexedDBAvailable || !this.db) {
      const all = await this.getWallets();
      return all.filter(w => w.currency === currency);
    }

    return await this.db.wallets
      .where('currency')
      .equals(currency)
      .toArray();
  }

  // ========================================
  // IMPORTACIÓN DE DATOS
  // ========================================

  async importData(data) {
    try {
      const operations = [];

      if (data.transactions) operations.push(this.saveTransactions(data.transactions));
      if (data.budgets) operations.push(this.saveBudgets(data.budgets));
      if (data.savings) operations.push(this.saveSavings(data.savings));
      if (data.wallets) operations.push(this.saveWallets(data.wallets));
      if (data.categories) operations.push(this.saveCategories(data.categories));

      // Soportar ambos formatos de keys para tasas de cambio
      const rates = data.exchangeRates || data.exchange_rates;
      if (rates) operations.push(this.saveExchangeRates(rates));

      if (data.cards) operations.push(this.saveCards(data.cards));
      if (data.loans) operations.push(this.saveLoans(data.loans));
      if (data.settings) operations.push(this.saveSettings(data.settings));
      if (data.users) operations.push(this.saveUsers(data.users));

      await Promise.all(operations);

      console.log('✅ Datos importados correctamente');
      return true;
    } catch (error) {
      console.error('❌ Error importing data:', error);
      return false;
    }
  }

  // ========================================
  // UTILIDADES Y DIAGNÓSTICO
  // ========================================

  async getDatabaseStats() {
    try {
      const stats = {
        storage: this.isIndexedDBAvailable ? 'IndexedDB' : 'localStorage',
        collections: {}
      };

      if (this.isIndexedDBAvailable && this.db) {
        const tables = ['transactions', 'budgets', 'savings', 'wallets', 'users', 'cards'];
        for (const table of tables) {
          stats.collections[table] = await this.db[table].count();
        }
      } else {
        stats.collections = {
          transactions: (await this.getTransactions()).length,
          budgets: (await this.getBudgets()).length,
          savings: (await this.getSavings()).length,
          wallets: (await this.getWallets()).length,
          users: (await this.getUsers()).length,
          cards: (await this.getCards()).length,
          loans: (await this.getLoans()).length
        };
      }

      return stats;
    } catch (error) {
      console.error('Error getting stats:', error);
      return null;
    }
  }

  async clearAllData() {
    try {
      if (this.isIndexedDBAvailable && this.db) {
        // ✅ MEJORA: Eliminar la base de datos completa es más seguro y limpio que vaciar tablas una a una
        await this.db.delete();
      }

      // ✅ MEJORA: Limpiar TODO el storage para un reset real de fábrica
      localStorage.clear();
      sessionStorage.clear();

      return true;
    } catch (error) {
      console.error('❌ Error al realizar limpieza profunda de datos:', error);
      return false;
    }
  }

  // ========================================
  // VERIFICACIÓN DE LÍMITES DE STORAGE
  // ========================================

  /**
   * Formatea bytes a una unidad legible (MB o GB)
   * @param {number} bytes 
   * @returns {string} Texto formateado
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 MB';
    const k = 1024;
    const mb = k * k;
    const gb = mb * k;

    if (bytes >= gb) {
      return (bytes / gb).toFixed(2) + ' GB';
    }
    return (bytes / mb).toFixed(2) + ' MB';
  }

  /**
   * Calcula el tamaño usado del sistema (IndexedDB + LocalStorage)
   * @returns {Promise<Object>} Información de uso de storage
   */
  async getStorageSize() {
    try {
      // Intenta usar la API moderna de Storage Manager
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();

        // Si hay cuota disponible
        if (estimate.quota) {
          const used = estimate.usage || 0;
          const limit = estimate.quota;
          const percentage = (used / limit) * 100;

          return {
            used,
            limit,
            percentage: percentage.toFixed(2),
            usedFormatted: this.formatBytes(used),
            limitFormatted: this.formatBytes(limit),
            usedMB: (used / 1024 / 1024).toFixed(2),
            limitMB: (limit / 1024 / 1024).toFixed(0),
            type: 'IndexedDB + System'
          };
        }
      }
    } catch (e) {
      console.warn('Storage API no disponible, usando fallback localStorage', e);
    }

    // Fallback original: solo localStorage (si falla lo anterior o no está disponible)
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length + key.length;
      }
    }

    const limit = 5 * 1024 * 1024; // 5MB
    const used = total * 2;
    const percentage = (used / limit) * 100;

    return {
      used,
      limit,
      percentage: percentage.toFixed(1),
      usedFormatted: this.formatBytes(used),
      limitFormatted: this.formatBytes(limit),
      usedMB: (used / 1024 / 1024).toFixed(2),
      limitMB: (limit / 1024 / 1024).toFixed(2),
      type: 'localStorage (Fallback)'
    };
  }

  /**
   * Verifica si el storage está cerca del límite
   * @returns {String} 'ok', 'warning', o 'critical'
   */
  async checkStorageLimit() {
    const size = await this.getStorageSize();

    if (size.percentage > 90) {
      console.error('🔴 CRÍTICO: Storage al', size.percentage + '%');
      return 'critical';
    } else if (size.percentage > 80) {
      console.warn('⚠️ ADVERTENCIA: Storage al', size.percentage + '%');
      return 'warning';
    }

    return 'ok';
  }

  /**
   * Genera mensaje de alerta según el nivel de uso
   * @returns {Promise<Object>} Información de alerta
   */
  async getStorageAlert() {
    const size = await this.getStorageSize();
    const status = await this.checkStorageLimit();

    if (status === 'critical') {
      return {
        show: true,
        level: 'critical',
        message: `🔴 CRÍTICO: Almacenamiento casi lleno (${size.percentage}%)\n\n` +
          `Usado: ${size.usedFormatted} de ${size.limitFormatted}\n\n` +
          `Acciones recomendadas:\n` +
          `1. Exportar backup completo\n` +
          `2. Eliminar transacciones antiguas\n` +
          `3. Limpiar logs de auditoría`
      };
    } else if (status === 'warning') {
      return {
        show: true,
        level: 'warning',
        message: `⚠️ ADVERTENCIA: Almacenamiento al ${size.percentage}%\n\n` +
          `Usado: ${size.usedFormatted} de ${size.limitFormatted}\n\n` +
          `Considera hacer un backup y limpiar datos antiguos.`
      };
    }

    return { show: false };
  }

}