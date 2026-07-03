// js/core/export.js
import { logger } from '../utils/logger.js';

export class ExportManager {

  getStorageType() {
    return this.storage.isIndexedDBAvailable ? 'IndexedDB' : 'localStorage';
  }

  constructor(storage, transactions) {
    this.storage = storage;
    this.transactions = transactions;
  }

  // NUEVO: Genera el JSON del backup completo sin descargarlo (usado por la sincronización automática)
  async generateBackupData() {
      const safeGet = async (method, defaultVal) => {
        if (this.storage && typeof this.storage[method] === 'function') {
          try {
            return await this.storage[method]();
          } catch (e) {
            return defaultVal;
          }
        }
        return defaultVal;
      };

      const [
        transactions, budgets, savings, wallets, categories, cards, loans, exchangeRates, settings, users
      ] = await Promise.all([
        safeGet('getTransactions', []),
        safeGet('getBudgets', []),
        safeGet('getSavings', []),
        safeGet('getWallets', []),
        safeGet('getCategories', { income: [], expense: [] }),
        safeGet('getCards', []),
        safeGet('getLoans', []),
        safeGet('getExchangeRates', {}),
        safeGet('getSettings', {}),
        safeGet('getUsers', [])
      ]);

      return {
        metadata: {
          version: '2.1.0',
          exportDate: new Date().toISOString(),
          source: 'FinanzApp Backup',
          type: 'complete',
          storage: this.getStorageType(),
          itemsCount: {
            transactions: transactions.length,
            budgets: budgets.length,
            savings: savings.length,
            wallets: wallets.length,
            categories: (categories.income?.length || 0) + (categories.expense?.length || 0),
            cards: cards.length,
            loans: loans.length,
            users: users.length
          }
        },
        data: {
          transactions, budgets, savings, wallets, categories, cards, loans, exchangeRates, settings, users
        }
      };
  }

  /**
 * ✅ MÉTODO PRINCIPAL: Exportar backup completo del sistema
 * Incluye TODOS los datos: transacciones, presupuestos, ahorros, wallets, etc.
 * Modificado para ser robusto ante métodos faltantes en el storage.
 */
  async exportCompleteBackup() {
    try {
      // Función auxiliar para invocar métodos del storage de forma segura
      // Si el método no existe (ej: getLoans), devuelve el valor por defecto sin romper el backup
      const safeGet = async (method, defaultVal) => {
        if (this.storage && typeof this.storage[method] === 'function') {
          try {
            return await this.storage[method]();
          } catch (e) {
            console.warn(`Error recuperando datos de ${method}:`, e);
            return defaultVal;
          }
        }
        console.warn(`Método ${method} no encontrado en StorageManager, usando valor por defecto.`);
        return defaultVal;
      };

      // ✅ CAMBIO: Ejecución paralela protegida
      // Si falta 'getLoans' o cualquier otro, el backup se genera igual con los demás datos
      const [
        transactions,
        budgets,
        savings,
        wallets,
        categories,
        cards,
        loans,
        exchangeRates,
        settings,
        users
      ] = await Promise.all([
        safeGet('getTransactions', []),
        safeGet('getBudgets', []),
        safeGet('getSavings', []),
        safeGet('getWallets', []),
        safeGet('getCategories', { income: [], expense: [] }),
        safeGet('getCards', []),
        safeGet('getLoans', []), // Este es el que causaba el conflicto
        safeGet('getExchangeRates', {}),
        safeGet('getSettings', {}),
        safeGet('getUsers', [])
      ]);

      const backupData = {
        metadata: {
          version: '2.1.0',
          exportDate: new Date().toISOString(),
          source: 'FinanzApp Backup',
          type: 'complete',
          storage: this.getStorageType(),
          itemsCount: {
            transactions: transactions.length,
            budgets: budgets.length,
            savings: savings.length,
            wallets: wallets.length,
            categories: (categories.income?.length || 0) + (categories.expense?.length || 0),
            cards: cards.length,
            loans: loans.length,
            users: users.length
          }
        },
        data: {
          transactions,
          budgets,
          savings,
          wallets,
          categories,
          cards,
          loans,
          exchangeRates,
          settings,
          users
        }
      };

      const json = JSON.stringify(backupData, null, 2);
      const fileName = `finanzapp-backup-${this.getDateString()}.json`;
      this.downloadFile(json, fileName, 'application/json');

      return {
        success: true,
        itemsCount: backupData.metadata.itemsCount,
        fileName
      };

    } catch (error) {
      console.error('Backup Error:', error);
      throw new Error('No se pudo crear el backup completo: ' + error.message);
    }
  }

  /**
   * ✅ Exportar solo transacciones en JSON (con filtro de fechas)
   */
  async exportTransactionsJSON(startDate = null, endDate = null) {
    try {
      const filters = this.buildFilters(startDate, endDate);

      // ✅ OPTIMIZACIÓN: Usa query directa si hay fechas
      let transactions;
      if (startDate && endDate && this.storage.isIndexedDBAvailable) {
        transactions = await this.storage.getTransactionsByDateRange(startDate, endDate);
      } else {
        transactions = await this.transactions.getAll(filters);
      }

      const exportData = {
        metadata: {
          version: '2.1.0',
          exportDate: new Date().toISOString(),
          source: 'FinanzApp',
          type: 'transactions',
          storage: this.getStorageType(),
          period: {
            start: startDate || 'Inicio',
            end: endDate || 'Actualidad'
          },
          count: transactions.length
        },
        transactions
      };

      const json = JSON.stringify(exportData, null, 2);
      const fileName = `finanzapp-transacciones-${this.getDateString()}.json`;
      this.downloadFile(json, fileName, 'application/json');

      return { success: true, count: transactions.length, fileName };

    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ Exportar a Excel con filtro de fechas
   */
  async exportToExcel(startDate = null, endDate = null) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Biblioteca Excel no disponible. Verifica que XLSX esté cargado.');
    }

    try {
      const filters = this.buildFilters(startDate, endDate);

      // ✅ OPTIMIZACIÓN: Queries paralelas
      const [transactions, budgets, savings, wallets] = await Promise.all([
        startDate && endDate && this.storage.isIndexedDBAvailable
          ? this.storage.getTransactionsByDateRange(startDate, endDate)
          : this.transactions.getAll(filters),
        this.storage.getBudgets(),
        this.storage.getSavings(),
        this.storage.getWallets()
      ]);

      const wb = XLSX.utils.book_new();

      // ========================================
      // HOJA 1: TRANSACCIONES
      // ========================================
      const txData = transactions.map(t => ({
        'Fecha': this.formatDate(t.date),
        'Tipo': t.type === 'income' ? 'Ingreso' : 'Gasto',
        'Categoría': t.category,
        'Subcategoría': t.subcategory || '-',
        'Descripción': t.description || '-',
        'Monto': t.amount,
        'Moneda': t.currency || 'ARS',
        'Método de Pago': t.paymentMethod,
        'Tarjeta': t.card || '-',
        'Cuotas': t.installmentInfo ? `${t.installmentInfo.current}/${t.installmentInfo.total}` : '-',
        'Wallet': t.walletId ? 'Sí' : 'No',
        'Usuario': t.userName,
        'Fecha Creación': this.formatDate(t.createdAt)
      }));

      const ws = XLSX.utils.json_to_sheet(txData);
      XLSX.utils.book_append_sheet(wb, ws, 'Transacciones');

      // ========================================
      // HOJA 2: RESUMEN FINANCIERO (Convertido a ARS)
      // ========================================
      let income = 0;
      let expenses = 0;

      for (const t of transactions) {
        // Ignorar transferencias del resumen global si es necesario, o incluirlas si el usuario lo prefiere.
        // Aquí seguimos la lógica de analytics: filtrar transferencias
        if (t.category === 'Transferencia' || t.category === 'Ahorro') continue;

        const amount = await this._convertToARS(t);
        if (t.type === 'income') income += amount;
        else expenses += amount;
      }

      const balance = income - expenses;
      const savingsRate = income > 0 ? ((balance / income) * 100).toFixed(1) : '0.0';

      const summaryData = [
        ['RESUMEN FINANCIERO'],
        [],
        ['Período', `${startDate ? this.formatDate(startDate) : 'Todo'} - ${endDate ? this.formatDate(endDate) : 'Actualidad'}`],
        ['Fecha Exportación', this.formatDate(new Date().toISOString())],
        ['Sistema de Storage', this.storage.isIndexedDBAvailable ? 'IndexedDB' : 'localStorage'], // ✅ NUEVO
        [],
        ['INGRESOS Y GASTOS'],
        ['Total Ingresos', income],
        ['Total Gastos', expenses],
        ['Balance Neto', balance],
        ['Tasa de Ahorro', `${savingsRate}%`],
        [],
        ['ESTADÍSTICAS'],
        ['Cantidad de Transacciones', transactions.length],
        ['Promedio por Transacción', transactions.length > 0 ? ((income + expenses) / transactions.length).toFixed(2) : 0],
        ['Mayor Ingreso', Math.max(...transactions.filter(t => t.type === 'income').map(t => t.amount), 0)],
        ['Mayor Gasto', Math.max(...transactions.filter(t => t.type === 'expense').map(t => t.amount), 0)]
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

      // ========================================
      // HOJA 3: POR CATEGORÍA (Convertido a ARS)
      // ========================================
      const byCategory = {};
      for (const t of transactions) {
        if (!byCategory[t.category]) {
          byCategory[t.category] = { income: 0, expense: 0, count: 0 };
        }
        const amount = await this._convertToARS(t);
        if (t.type === 'income') byCategory[t.category].income += amount;
        else byCategory[t.category].expense += amount;
        byCategory[t.category].count += 1;
      }

      const categoryData = Object.entries(byCategory)
        .map(([category, data]) => ({
          'Categoría': category,
          'Ingresos': data.income,
          'Gastos': data.expense,
          'Balance': data.income - data.expense,
          'Transacciones': data.count
        }))
        .sort((a, b) => (b.Ingresos + b.Gastos) - (a.Ingresos + a.Gastos));

      const wsCategories = XLSX.utils.json_to_sheet(categoryData);
      XLSX.utils.book_append_sheet(wb, wsCategories, 'Por Categoría');

      // ========================================
      // HOJA 4: PRESUPUESTOS
      // ========================================
      const budgetData = budgets.map(b => ({
        'Categoría': b.category,
        'Subcategoría': b.subcategory || 'Todas',
        'Límite': b.limit,
        'Período': this.getPeriodLabel(b.period),
        'Creado': this.formatDate(b.createdAt)
      }));

      const wsBudgets = XLSX.utils.json_to_sheet(budgetData);
      XLSX.utils.book_append_sheet(wb, wsBudgets, 'Presupuestos');

      // ========================================
      // HOJA 5: AHORROS
      // ========================================
      const savingsData = savings.map(s => ({
        'Nombre': s.name,
        'Meta': s.goalAmount,
        'Ahorrado': s.currentAmount,
        'Restante': s.goalAmount - s.currentAmount,
        'Progreso': `${((s.currentAmount / s.goalAmount) * 100).toFixed(1)}%`,
        'Moneda': s.currency || 'ARS',
        'Fecha Límite': s.deadline ? this.formatDate(s.deadline) : '-',
        'Usuario': s.userName
      }));

      const wsSavings = XLSX.utils.json_to_sheet(savingsData);
      XLSX.utils.book_append_sheet(wb, wsSavings, 'Ahorros');

      // ========================================
      // HOJA 6: WALLETS
      // ========================================
      const walletData = wallets.map(w => ({
        'Nombre': w.name,
        'Tipo': w.type,
        'Saldo Actual': w.currentBalance,
        'Moneda': w.currency || 'ARS',
        'Descripción': w.description || '-',
        'Usuario': w.userName
      }));

      const wsWallets = XLSX.utils.json_to_sheet(walletData);
      XLSX.utils.book_append_sheet(wb, wsWallets, 'Cajas-Billeteras');

      // Guardar archivo
      const fileName = `finanzapp-completo-${this.getDateString()}.xlsx`;
      XLSX.writeFile(wb, fileName);

      return { success: true, fileName };

    } catch (error) {
      throw new Error('No se pudo exportar a Excel: ' + error.message);
    }
  }

  /**
 * ✅ Importar backup completo con validación robusta
 */
  async importCompleteBackup(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          // ========================================
          // PASO 1: VALIDAR FORMATO JSON
          // ========================================
          let backupData;
          try {
            backupData = JSON.parse(e.target.result);
          } catch (parseError) {
            throw new Error('El archivo no es un JSON válido. Verifica que no esté corrupto.');
          }

          // ========================================
          // PASO 2: VALIDAR ESTRUCTURA BÁSICA
          // ========================================
          if (!backupData.metadata) {
            throw new Error('Archivo inválido: falta metadata. Asegúrate de usar un backup de FinanzApp.');
          }

          if (backupData.metadata.source !== 'FinanzApp Backup') {
            throw new Error(`Archivo no compatible. Origen: "${backupData.metadata.source}". Se esperaba "FinanzApp Backup".`);
          }

          if (!backupData.metadata.version) {
            throw new Error('Versión de backup no especificada. El archivo puede estar incompleto.');
          }

          if (!backupData.data) {
            throw new Error('El backup no contiene datos. El archivo puede estar vacío o corrupto.');
          }

          const data = backupData.data;

          // ========================================
          // PASO 3: VALIDAR INTEGRIDAD DE DATOS
          // ========================================
          const validationErrors = [];

          // Validar transacciones
          if (data.transactions && Array.isArray(data.transactions)) {
            data.transactions.forEach((tx, index) => {
              if (!tx.id) validationErrors.push(`Transacción #${index + 1}: falta ID`);
              if (!tx.type || !['income', 'expense'].includes(tx.type)) {
                validationErrors.push(`Transacción #${index + 1}: tipo inválido (${tx.type})`);
              }
              if (typeof tx.amount !== 'number' || tx.amount < 0) {
                validationErrors.push(`Transacción #${index + 1}: monto inválido (${tx.amount})`);
              }
              if (!tx.date) validationErrors.push(`Transacción #${index + 1}: falta fecha`);
            });
          }

          // Validar wallets
          if (data.wallets && Array.isArray(data.wallets)) {
            const walletIds = new Set();
            data.wallets.forEach((wallet, index) => {
              if (!wallet.id) validationErrors.push(`Wallet #${index + 1}: falta ID`);
              if (walletIds.has(wallet.id)) {
                validationErrors.push(`Wallet #${index + 1}: ID duplicado (${wallet.id})`);
              }
              walletIds.add(wallet.id);
              if (typeof wallet.currentBalance !== 'number') {
                validationErrors.push(`Wallet #${index + 1}: balance inválido`);
              }
            });

            // Validar referencias de wallets en transacciones
            if (data.transactions && Array.isArray(data.transactions)) {
              data.transactions.forEach((tx, index) => {
                if (tx.walletId && !walletIds.has(tx.walletId)) {
                  validationErrors.push(`Transacción #${index + 1}: referencia a wallet inexistente (${tx.walletId})`);
                }
              });
            }
          }

          // Validar presupuestos
          if (data.budgets && Array.isArray(data.budgets)) {
            data.budgets.forEach((budget, index) => {
              if (!budget.id) validationErrors.push(`Presupuesto #${index + 1}: falta ID`);
              if (typeof budget.limit !== 'number' || budget.limit <= 0) {
                validationErrors.push(`Presupuesto #${index + 1}: límite inválido (${budget.limit})`);
              }
            });
          }

          // Validar ahorros
          if (data.savings && Array.isArray(data.savings)) {
            data.savings.forEach((saving, index) => {
              if (!saving.id) validationErrors.push(`Ahorro #${index + 1}: falta ID`);
              if (typeof saving.goalAmount !== 'number' || saving.goalAmount <= 0) {
                validationErrors.push(`Ahorro #${index + 1}: meta inválida`);
              }
              if (typeof saving.currentAmount !== 'number' || saving.currentAmount < 0) {
                validationErrors.push(`Ahorro #${index + 1}: monto actual inválido`);
              }
            });
          }

          // Validar usuarios
          if (data.users && Array.isArray(data.users)) {
            data.users.forEach((user, index) => {
              if (!user.id) validationErrors.push(`Usuario #${index + 1}: falta ID`);
              if (!user.username) validationErrors.push(`Usuario #${index + 1}: falta username`);
              // ✅ CORREGIDO: Validar que tenga password O passwordHash
              if (!user.password && !user.passwordHash) {
                validationErrors.push(`Usuario #${index + 1} (${user.username}): falta contraseña o hash. Este backup no incluye credenciales.`);
              }
            });
          }

          // Si hay errores críticos, rechazar
          if (validationErrors.length > 0) {
            const errorMessage = `Se encontraron ${validationErrors.length} errores de validación:\n\n` +
              validationErrors.slice(0, 10).map(err => `• ${err}`).join('\n') +
              (validationErrors.length > 10 ? `\n\n...y ${validationErrors.length - 10} errores más.` : '');

            throw new Error(errorMessage);
          }

          // ========================================
          // PASO 4: IMPORTAR DATOS
          // ========================================
          const success = await this.storage.importData(data);

          if (!success) {
            throw new Error('Falló la importación en el almacenamiento. Verifica el espacio disponible.');
          }

          // ========================================
          // PASO 5: CALCULAR RESULTADOS
          // ========================================
          const results = {
            transactions: data.transactions?.length || 0,
            budgets: data.budgets?.length || 0,
            savings: data.savings?.length || 0,
            wallets: data.wallets?.length || 0,
            categories: {
              income: data.categories?.income?.length || 0,
              expense: data.categories?.expense?.length || 0
            },
            cards: data.cards?.length || 0,
            users: data.users?.length || 0
          };

          resolve({
            success: true,
            imported: results,
            metadata: backupData.metadata,
            validationPassed: true
          });

        } catch (error) {
          reject(error); // Ya tiene mensaje descriptivo
        }
      };

      reader.onerror = () => reject(new Error('Error leyendo el archivo. Verifica que no esté corrupto o en uso.'));
      reader.readAsText(file);
    });
  }

  /**
   * ✅ Importar solo transacciones desde JSON
   */
  async importTransactionsJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);

          // Validar estructura
          if (!data.transactions || !Array.isArray(data.transactions)) {
            throw new Error('Formato de archivo no válido. Debe contener un array de transacciones.');
          }

          // Obtener transacciones existentes
          const existingTransactions = await this.storage.getTransactions();

          // Filtrar transacciones duplicadas por ID
          const existingIds = new Set(existingTransactions.map(t => t.id));
          const newTransactions = data.transactions.filter(t => !existingIds.has(t.id));

          if (newTransactions.length === 0) {
            throw new Error('No se encontraron transacciones nuevas para importar.');
          }

          // Agregar nuevas transacciones
          const allTransactions = [...existingTransactions, ...newTransactions];
          await this.storage.saveTransactions(allTransactions);

          resolve({
            success: true,
            imported: newTransactions.length,
            skipped: data.transactions.length - newTransactions.length
          });

        } catch (error) {
          reject(new Error('Error importando transacciones: ' + error.message));
        }
      };

      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsText(file);
    });
  }

  // ========================================
  // MÉTODOS AUXILIARES
  // ========================================

  buildFilters(startDate, endDate) {
    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    return filters;
  }

  getDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDate(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  getPeriodLabel(period) {
    const labels = {
      'weekly': 'Semanal',
      'monthly': 'Mensual',
      'quarterly': 'Trimestral',
      'semiannual': 'Semestral',
      'yearly': 'Anual'
    };
    return labels[period] || period;
  }

  async _convertToARS(transaction) {
    if (!transaction.currency || transaction.currency === 'ARS') {
      return transaction.amount;
    }
    const converted = await this.transactions.currencyManager.convertAmount(
      transaction.amount,
      transaction.currency,
      'ARS'
    );
    return typeof converted === 'object' ? converted.amount : converted;
  }

  downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}