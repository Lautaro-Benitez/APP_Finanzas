// js/app.js - VERSIÓN OPTIMIZADA (LOGS REDUCIDOS)
import { StorageManager } from './core/storage.js';
import { AuthManager } from './core/auth.js';
import { TransactionManager } from './core/transactions.js';
import { BudgetManager } from './core/budgets.js';
import { SavingsManager } from './core/savings.js';
import { UserManager } from './core/users.js';
import { WalletManager } from './core/wallets.js';
import { AnalyticsEngine } from './core/analytics.js';
import { ExportManager } from './core/export.js';
import { CurrencyManager } from './utils/currency.js';
import { UIManager } from './ui/ui-manager.js';
import { AuditLogManager } from './core/audit-log.js';
import { CryptoUtils } from './utils/crypto.js';
import { InstallmentsManager } from './core/installments-manager.js';
import { LoansManager } from './core/loans.js';

class FinancialApp {
  constructor() {
    this.version = '3.3.1'; // ✅ Versión global del sistema (Incrementada tras auditoría)
    this.storage = new StorageManager();
    this.auth = new AuthManager(this.storage);
    this.currencyManager = new CurrencyManager(this.storage);
    this.walletManager = new WalletManager(this.storage, this.auth);
    this.budgets = new BudgetManager(this.storage, null); // Inicializar sin transactions primero
    this.transactions = new TransactionManager(this.storage, this.auth, this.currencyManager, this.walletManager, this.budgets);
    this.budgets.transactions = this.transactions; // Asignar transactions después
    this.savings = new SavingsManager(this.storage, this.auth, this.walletManager);
    this.users = new UserManager(this.storage, this.auth);
    this.analytics = new AnalyticsEngine(this.transactions);
    this.exportManager = new ExportManager(this.storage, this.transactions);
    this.auditLog = new AuditLogManager(this.storage, this.auth);
    this.installmentsManager = new InstallmentsManager(this.storage, this.auth, this.walletManager, this.transactions);
    this.loansManager = new LoansManager(this.storage, this.transactions, this.auth, this.walletManager, this.currencyManager);
    this.ui = new UIManager(this);
    window.uiManager = this.ui;
  }

  logout() {
    this.auth.logout();
  }

  async initialize() {
    try {
      const [transactions, users, wallets, exchangeRates] = await Promise.all([
        this.storage.getTransactions(),
        this.storage.getUsers(),
        this.storage.getWallets(),
        this.storage.getExchangeRates()
      ]);

      console.log('📊 App iniciada:', {
        transacciones: transactions.length,
        usuarios: users.length,
        billeteras: wallets.length
      });


      await this.currencyManager.validateExchangeRates();
      await this.currencyManager.validateExchangeRates();

      // 🆕 MIGRACIÓN: Actualizar transacciones antiguas de tarjetas de crédito
      try {
        const migrated = await this.transactions.migrateCreditCardTransactions();
        if (migrated) {
          console.log('✅ Transacciones de crédito actualizadas correctamente');
        }
      } catch (migrationError) {
        console.warn('⚠️ Error en migración de transacciones de crédito:', migrationError);
      }

      await this.checkAutomaticCharges();

      // ✅ MIGRACIÓN DE SEGURIDAD DIFERIDA (Para asegurar carga de bcrypt)
      setTimeout(() => this.runSecurityMigration(), 2000); // Esperar 2 segundos para asegurar librerías

      // 🔄 MIGRACIÓN DE PRÉSTAMOS (Settings -> Loans Table)
      try {
        if (this.storage.db && this.storage.db.loans) {
          const loansCount = await this.storage.db.loans.count();
          if (loansCount === 0) {
            const settingsRecord = await this.storage.db.settings.get('loans');
            if (settingsRecord && settingsRecord.data && Array.isArray(settingsRecord.data) && settingsRecord.data.length > 0) {
              console.log('🔄 Migrando préstamos de settings a loans table...', settingsRecord.data.length);
              // Asegurar que tengan ID válido para key path si es necesario, aunque el schema es 'id'
              await this.storage.db.loans.bulkAdd(settingsRecord.data);
              console.log('✅ Migración de préstamos completada.');
            }
          }
        }
      } catch (migrationError) {
        console.warn('⚠️ Error en migración de préstamos:', migrationError);
      }

    } catch (error) {
      console.error('❌ Error inicializando app:', error);
      throw error;
    }

    // Procesar cuotas viejas pendientes
    try {
      const oldProcessed = await this.installmentsManager.processOldPendingInstallments();
      if (oldProcessed > 0) {
        console.log(`✅ ${oldProcessed} cuotas atrasadas procesadas automáticamente`);
      }
    } catch (error) {
      console.error('Error procesando cuotas atrasadas:', error);
    }

    // Procesar cuotas del día actual
    try {
      const result = await this.installmentsManager.processAutomaticCharges();
      if (result.processed > 0) {
        console.log(`✅ ${result.processed} cuotas procesadas automáticamente`);
      }
    } catch (error) {
      console.error('Error procesando cuotas automáticas:', error);
    }
  }

  async getQuickStats() {
    try {
      const dates = this.getPeriodDates('month');

      const [monthlyTransactions, allTransactions, budgets, savings, wallets] = await Promise.all([
        this.transactions.getAll({ startDate: dates.start, endDate: dates.end }),
        this.transactions.getAll(),
        this.budgets.getAll(),
        this.savings.getAll(),
        this.walletManager.getAll()
      ]);

      const income = this.calculateTotalByType(monthlyTransactions, 'income');
      const expenses = this.calculateTotalByType(monthlyTransactions, 'expense');
      const totalSavings = this.calculateTotal(savings, 'currentAmount');
      const totalWalletBalance = this.calculateTotal(wallets, 'currentBalance');

      return {
        monthly: {
          income,
          expenses,
          balance: income - expenses
        },
        totals: {
          savings: totalSavings,
          wallets: totalWalletBalance,
          budgets: budgets.length
        },
        counts: {
          transactions: allTransactions.length,
          budgets: budgets.length,
          savings: savings.length,
          wallets: wallets.length
        }
      };
    } catch (error) {
      console.error('❌ Error en stats:', error);
      return null;
    }
  }

  calculateTotalByType(items, type) {
    return items.filter(item => item.type === type).reduce((sum, item) => sum + item.amount, 0);
  }

  calculateTotal(items, property) {
    return items.reduce((sum, item) => sum + item[property], 0);
  }

  async create(userData) {
    try {
      // Validar permisos
      if (!this.auth.isAdmin()) {
        throw new Error('Solo administradores pueden crear usuarios');
      }

      // Validar datos
      const errors = Validators.validateUserData(userData);
      if (errors.length > 0) {
        throw new Error(errors.join(', '));
      }

      const users = await this.storage.getUsers();

      // Verificar username único
      if (users.some(u => u.username === userData.username)) {
        throw new Error('El nombre de usuario ya existe');
      }

      // Hashear password
      const passwordHash = await dcodeIO.bcrypt.hash(userData.password, 10);

      const newUser = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        username: userData.username,
        passwordHash: passwordHash, // ✅ Hasheado
        role: userData.role || 'user',
        name: userData.name,
        securityQuestion: userData.securityQuestion || '',
        securityAnswerHash: userData.securityAnswer
          ? await this.hashSecurityAnswer(userData.securityAnswer)
          : '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      users.push(newUser);
      await this.storage.saveUsers(users);

      // Registrar en audit log
      await this.auditLog.log('create', 'user', newUser.id, {
        username: newUser.username,
        role: newUser.role
      });

      return this.sanitizeUser(newUser);

    } catch (error) {
      console.error('Error al crear usuario:', error);
      throw error;
    }
  }

  async restoreFromBackup(backupData) {
    try {
      if (!backupData || typeof backupData !== 'object') {
        throw new Error('Datos de backup inválidos');
      }

      if (!backupData.metadata || backupData.metadata.source !== 'FinanzApp Backup') {
        throw new Error('Archivo de backup no válido');
      }

      if (backupData instanceof File) {
        const result = await this.exportManager.importCompleteBackup(backupData);

        await this.auditLog.log('restore', 'system', null, {
          source: 'backup_file',
          itemsRestored: result.imported
        });

        return result;
      }

      const data = backupData.data || backupData;

      const restoreOperations = [];

      if (data.transactions) restoreOperations.push(this.storage.saveTransactions(data.transactions));
      if (data.budgets) restoreOperations.push(this.storage.saveBudgets(data.budgets));
      if (data.savings) restoreOperations.push(this.storage.saveSavings(data.savings));
      if (data.wallets) restoreOperations.push(this.storage.saveWallets(data.wallets));
      if (data.categories) restoreOperations.push(this.storage.saveCategories(data.categories));
      if (data.cards) restoreOperations.push(this.storage.saveCards(data.cards));
      if (data.exchange_rates) restoreOperations.push(this.storage.saveExchangeRates(data.exchange_rates));
      if (data.settings) restoreOperations.push(this.storage.saveSettings(data.settings));

      await Promise.all(restoreOperations);

      await this.auditLog.log('restore', 'system', null, {
        source: 'backup_data',
        itemsRestored: {
          transactions: data.transactions?.length || 0,
          budgets: data.budgets?.length || 0,
          savings: data.savings?.length || 0,
          wallets: data.wallets?.length || 0
        }
      });

      return {
        success: true,
        restored: {
          transactions: data.transactions?.length || 0,
          budgets: data.budgets?.length || 0,
          savings: data.savings?.length || 0,
          wallets: data.wallets?.length || 0,
          categories: {
            income: data.categories?.income?.length || 0,
            expense: data.categories?.expense?.length || 0
          }
        }
      };

    } catch (error) {
      console.error('❌ Error restaurando backup:', error);
      throw new Error('Restauración falló: ' + error.message);
    }
  }

  // @ FinancialApp.createBackup
  // ✅ Nuevo método wrapper para backup completo
  async exportJSON(startDate = null, endDate = null) {
    try {
      const result = await this.exportManager.exportTransactionsJSON(startDate, endDate);

      await this.auditLog.log('export', 'transactions', null, {
        format: 'json',
        count: result.count,
        startDate,
        endDate
      });

      return result;

    } catch (error) {
      console.error('❌ Error exportando JSON:', error);
      throw error;
    }
  }

  async exportExcel(startDate = null, endDate = null) {
    try {
      const result = await this.exportManager.exportToExcel(startDate, endDate);

      await this.auditLog.log('export', 'transactions', null, {
        format: 'excel',
        startDate,
        endDate
      });

      return result;

    } catch (error) {
      console.error('❌ Error exportando Excel:', error);
      throw error;
    }
  }

  async clearAllData() {
    try {
      // 1. Limpiar todo el almacenamiento (DB y Local) delegando al storage manager
      return await this.storage.clearAllData();
    } catch (error) {
      console.error('❌ Error borrando datos en app:', error);
      throw new Error('Limpieza falló: ' + error.message);
    }
  }

  async exportAuditLog(startDate = null, endDate = null) {
    try {
      await this.auditLog.exportLogs(startDate, endDate);
      return { success: true };

    } catch (error) {
      console.error('❌ Error exportando historial:', error);
      throw error;
    }
  }

  async getFinancialSummary(period = 'month') {
    try {
      const dates = this.getPeriodDates(period);
      const [report, wallets, savings] = await Promise.all([
        this.analytics.generateReport(dates.start, dates.end),
        this.walletManager.getAll(),
        this.savings.getAll()
      ]);

      const walletBalance = this.calculateTotal(wallets, 'currentBalance');
      const totalSavings = this.calculateTotal(savings, 'currentAmount');
      const savingsGoals = this.calculateTotal(savings, 'goalAmount');

      return {
        period: {
          name: period,
          start: dates.start,
          end: dates.end
        },
        cashflow: report.summary,
        assets: {
          wallets: walletBalance,
          savings: totalSavings,
          total: walletBalance + totalSavings
        },
        goals: {
          current: totalSavings,
          target: savingsGoals,
          progress: savingsGoals > 0 ? (totalSavings / savingsGoals * 100).toFixed(1) : 0
        },
        wallets: wallets.map(w => ({
          name: w.name,
          type: w.type,
          balance: w.currentBalance,
          currency: w.currency || 'ARS'
        })),
        savings: savings.map(s => ({
          name: s.name,
          current: s.currentAmount,
          goal: s.goalAmount,
          progress: (s.currentAmount / s.goalAmount * 100).toFixed(1)
        }))
      };
    } catch (error) {
      console.error('Error en resumen financiero:', error);
      throw error;
    }
  }

  getPeriodDates(period) {
    const now = new Date();
    let start, end;

    // Si period es un objeto (filtro personalizado)
    if (typeof period === 'object') {
      if (period.type === 'specific-month') {
        start = new Date(period.year, period.month, 1);
        end = new Date(period.year, period.month + 1, 0);
      } else if (period.type === 'specific-year') {
        start = new Date(period.year, 0, 1);
        end = new Date(period.year, 11, 31);
      } else if (period.type === 'custom-range') {
        start = new Date(period.startDate);
        end = new Date(period.endDate);
      }
    } else {
      // Períodos predefinidos (string)
      switch (period) {
        case 'week':
          start = new Date(now);
          start.setDate(now.getDate() - now.getDay());
          end = new Date(start);
          end.setDate(start.getDate() + 6);
          break;
        case 'month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          break;
        case 'quarter':
          const quarter = Math.floor(now.getMonth() / 3);
          start = new Date(now.getFullYear(), quarter * 3, 1);
          end = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
          break;
        case 'year':
          start = new Date(now.getFullYear(), 0, 1);
          end = new Date(now.getFullYear(), 11, 31);
          break;
        default:
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }
    }

    return {
      start: start.toISOString().split('T')[0] + 'T00:00:00.000Z',
      end: end.toISOString().split('T')[0] + 'T23:59:59.999Z'
    };
  }

  async transferBetweenWallets(fromWalletId, toWalletId, amount, description = '') {
    try {
      if (fromWalletId === toWalletId) {
        throw new Error('No puedes transferir a la misma wallet');
      }

      if (amount <= 0) {
        throw new Error('El monto debe ser mayor a 0');
      }

      const [fromWallet, toWallet] = await Promise.all([
        this.walletManager.getById(fromWalletId),
        this.walletManager.getById(toWalletId)
      ]);

      if (fromWallet.currentBalance < amount) {
        throw new Error(`Saldo insuficiente en ${fromWallet.name}. Disponible: ${fromWallet.currentBalance}`);
      }

      let amountToAdd = amount;
      if (fromWallet.currency !== toWallet.currency) {
        amountToAdd = await this.currencyManager.convertAmount(
          amount,
          fromWallet.currency,
          toWallet.currency
        );
      }

      const wallets = await this.storage.getWallets();

      const fromIndex = wallets.findIndex(w => w.id === fromWalletId);
      const toIndex = wallets.findIndex(w => w.id === toWalletId);

      if (fromIndex === -1 || toIndex === -1) {
        throw new Error('Wallets no encontradas');
      }

      wallets[fromIndex].currentBalance -= amount;
      wallets[fromIndex].updatedAt = new Date().toISOString();

      wallets[toIndex].currentBalance += amountToAdd;
      wallets[toIndex].updatedAt = new Date().toISOString();

      await this.storage.saveWallets(wallets);

      const transactions = await this.storage.getTransactions();
      const user = this.auth.getCurrentUser();
      const now = new Date().toISOString();

      const outTransaction = {
        id: `tx_${Date.now()}_out`,
        userId: user.id,
        userName: user.name,
        type: 'expense',
        amount: amount,
        currency: fromWallet.currency,
        date: now,
        category: 'Transferencia',
        description: description || `Transferencia enviada a ${toWallet.name}`,
        paymentMethod: 'Transferencia',
        walletId: fromWalletId,
        skipWalletUpdate: true,
        transferInfo: {
          isTransfer: true,
          direction: 'out',
          fromWallet: fromWallet.name,
          toWallet: toWallet.name,
          fromWalletId: fromWalletId,
          toWalletId: toWalletId,
          fromCurrency: fromWallet.currency,
          toCurrency: toWallet.currency,
          convertedAmount: amountToAdd
        },
        createdAt: now,
        updatedAt: now
      };

      const inTransaction = {
        id: `tx_${Date.now()}_in`,
        userId: user.id,
        userName: user.name,
        type: 'income',
        amount: amountToAdd,
        currency: toWallet.currency,
        date: now,
        category: 'Transferencia',
        description: description || `Transferencia recibida de ${fromWallet.name}`,
        paymentMethod: 'Transferencia',
        walletId: toWalletId,
        skipWalletUpdate: true,
        transferInfo: {
          isTransfer: true,
          direction: 'in',
          fromWallet: fromWallet.name,
          toWallet: toWallet.name,
          fromWalletId: fromWalletId,
          toWalletId: toWalletId,
          fromCurrency: fromWallet.currency,
          toCurrency: toWallet.currency,
          originalAmount: amount
        },
        createdAt: now,
        updatedAt: now
      };

      transactions.push(outTransaction);
      transactions.push(inTransaction);

      await this.storage.saveTransactions(transactions);

      await this.auditLog.log('transfer', 'wallet', fromWalletId, {
        from: fromWallet.name,
        to: toWallet.name,
        amount: amount,
        currency: fromWallet.currency,
        convertedAmount: amountToAdd,
        toCurrency: toWallet.currency
      });

      const updatedWallets = await this.storage.getWallets();
      const updatedFromWallet = updatedWallets.find(w => w.id === fromWalletId);
      const updatedToWallet = updatedWallets.find(w => w.id === toWalletId);

      return {
        success: true,
        fromWallet: updatedFromWallet,
        toWallet: updatedToWallet,
        amount: amount,
        convertedAmount: amountToAdd
      };

    } catch (error) {
      console.error('❌ Error en transferencia:', error);
      throw error;
    }
  }

  async getRecentTransactions(limit = 10) {
    try {
      const transactions = await this.transactions.getAll({});
      return transactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, limit);
    } catch (error) {
      console.error('Error en transacciones recientes:', error);
      return [];
    }
  }

  async getSystemAlerts() {
    try {
      const alerts = [];

      const [budgetAlerts, wallets, ratesValid] = await Promise.all([
        this.budgets.getAlerts(),
        this.walletManager.getAll(),
        this.currencyManager.validateExchangeRates()
      ]);

      alerts.push(...budgetAlerts.map(alert => ({
        type: 'budget',
        level: alert.level,
        message: alert.message,
        priority: alert.level === 'exceeded' ? 'high' : 'medium'
      })));

      const lowBalanceWallets = wallets.filter(w => w.currentBalance < 1000);
      alerts.push(...lowBalanceWallets.map(wallet => ({
        type: 'wallet',
        level: 'warning',
        message: `Saldo bajo en ${wallet.name}: ${this.ui.formatCurrency(wallet.currentBalance)}`,
        priority: 'medium'
      })));

      if (!ratesValid) {
        alerts.push({
          type: 'currency',
          level: 'warning',
          message: 'Las tasas de cambio están desactualizadas',
          priority: 'low'
        });
      }

      return alerts.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

    } catch (error) {
      console.error('Error en alertas:', error);
      return [];
    }
  }

  async checkAutomaticCharges() {
    try {
      // Verificar si ya se ejecutó hoy
      const lastCheck = localStorage.getItem('lastAutoChargeCheck');
      const today = new Date().toDateString();

      if (lastCheck === today) {
        return; // Ya se ejecutó hoy
      }

      const result = await this.installmentsManager.processAutomaticCharges();

      if (result.processed > 0) {
        this.ui.showToast(
          `✅ ${result.processed} cuota(s) procesadas automáticamente`,
          'success'
        );
      }

      if (result.errors.length > 0) {
        this.ui.showToast(
          `⚠️ ${result.errors.length} cuota(s) con saldo insuficiente`,
          'warning'
        );
      }

      // Marcar como ejecutado hoy
      localStorage.setItem('lastAutoChargeCheck', today);

    } catch (error) {
      console.error('Error en checkAutomaticCharges:', error);
    }
  }

  async runSecurityMigration() {
    try {
      // Detección robusta de Bcrypt (dcodeIO o global)
      const bcrypt = (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt) ? dcodeIO.bcrypt : (typeof window !== 'undefined' ? window.bcrypt : null);

      if (!bcrypt) {
        console.warn('⚠️ Bcrypt no cargado aún, reintentando en 5s...');
        setTimeout(() => this.runSecurityMigration(), 5000);
        return;
      }

      const users = await this.storage.getUsers();
      let modified = false;

      for (const user of users) {
        if (user.password && !user.passwordHash) {
          console.log(`🔒 Asegurando cuenta de usuario: ${user.username}...`);
          user.passwordHash = await bcrypt.hash(user.password, 10);
          delete user.password; // Eliminar password plano

          modified = true;
        }
      }

      if (modified) {
        await this.storage.saveUsers(users);
        console.log('✅ Migración de seguridad completada exitosamente.');
        this.ui.showToast('Seguridad de cuenta actualizada correctamente', 'success');
      }
    } catch (err) {
      console.error('Error en migración de seguridad:', err);
    }
  }

}

// Inicialización global
const app = new FinancialApp();
window.app = app;

// Manejo de errores global
window.addEventListener('error', (event) => {
  console.error('Error global:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Promise rechazada:', event.reason);
});

// Inicialización cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

async function initializeApp() {
  try {
    // 1. Verificar si hay usuarios registrados (Primera vez)
    const users = await app.storage.getUsers();

    if (users.length === 0) {
      console.log('🚀 Primer inicio detectado. Mostrando configuración inicial.');

      // Ocultar login, mostrar setup
      document.getElementById('login-view').classList.remove('active');
      const setupView = document.getElementById('setup-view');
      if (setupView) setupView.classList.add('active');

      // Setup del form
      const setupForm = document.getElementById('setup-form');
      if (setupForm) {
        setupForm.onsubmit = async (e) => {
          e.preventDefault();
          const btn = setupForm.querySelector('button');
          const originalText = btn.innerText;
          btn.disabled = true;
          btn.innerText = 'Creando cuenta...';

          try {
            const name = document.getElementById('setup-name').value;
            const username = document.getElementById('setup-username').value;
            const password = document.getElementById('setup-password').value;
            const question = document.getElementById('setup-question').value;
            const answer = document.getElementById('setup-answer').value;

            // Hash password y respuesta
            // IMPORTANTE: CryptoUtils debe estar disponible. 
            // Como app.js ya importa otros módulos, me aseguraré de importar CryptoUtils si no está.
            const { CryptoUtils } = await import('./utils/crypto.js');

            const passwordHash = await CryptoUtils.hashPassword(password);
            const answerHash = await CryptoUtils.hashPassword(answer.trim().toLowerCase());

            const newAdmin = {
              id: 'admin',
              username: username,
              passwordHash: passwordHash,
              role: 'admin',
              name: name,
              securityQuestion: question,
              securityAnswerHash: answerHash, // Consistente con UserManager
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await app.storage.saveUsers([newAdmin]);
            console.log('✅ Admin creado exitosamente');

            // Auto-login: Simular el comportamiento de auth.login
            const sessionUser = {
              id: newAdmin.id,
              username: newAdmin.username,
              role: newAdmin.role,
              name: newAdmin.name
            };

            const expiryTime = (Date.now() + (30 * 60 * 1000)).toString(); // 30 minutos

            localStorage.setItem('currentUser', JSON.stringify(sessionUser));
            localStorage.setItem('sessionExpiry', expiryTime);

            // También en sessionStorage para la sesión actual
            sessionStorage.setItem('currentUser', JSON.stringify(sessionUser));
            sessionStorage.setItem('sessionExpiry', expiryTime);

            // Recargar para iniciar normal
            location.reload();

          } catch (error) {
            console.error(error);
            alert('Error al crear usuario: ' + error.message);
            btn.disabled = false;
            btn.innerText = originalText;
          }
        };
      }
      return; // Detener inicialización normal hasta que se cree el user
    }

    // 2. Flujo normal (Login)
    app.ui.setupLoginListener();

    const currentUser = app.auth.getCurrentUser();

    if (currentUser) {
      document.getElementById('login-screen').classList.remove('active');

      await app.initialize();
      await app.ui.init();
    }

  } catch (error) {
    console.error('⛔ Error inicializando app:', error);

    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
      loginScreen.innerHTML = `
        <div class="modal-content">
          <h2 style="margin-bottom: 24px; text-align: center; color: var(--danger);">Error de Inicialización</h2>
          <div style="text-align: center; color: var(--text-secondary); margin-bottom: 24px;">
            <p>Ha ocurrido un error al cargar la aplicación.</p>
            <p style="font-size: 14px; margin-top: 8px;">Detalles: ${error.message}</p>
          </div>
          <div style="display: flex; gap: 12px;">
            <button class="btn btn-primary" onclick="location.reload()" style="flex: 1;">
              Recargar Página
            </button>
            <button class="btn btn-secondary" onclick="localStorage.clear(); location.reload()">
              Limpiar Datos
            </button>
          </div>
        </div>
      `;
      loginScreen.classList.add('active');
    }
  }

  // ============================================
  // PROTECCIÓN CONTRA BYPASS DE INTERFAZ
  // ============================================

  // Verificar sesión cada 30 segundos
  setInterval(() => {
    if (!app.auth.getCurrentUser()) {
      const loginScreen = document.getElementById('login-screen');
      const appContainer = document.getElementById('app-container');

      if (loginScreen && !loginScreen.classList.contains('active')) {
        console.warn('⚠️ Sesión inválida detectada - Forzando logout');
        loginScreen.classList.add('active');
        if (appContainer) appContainer.style.display = 'none';
      }
    } else {
      // Extender sesión si hay actividad
      app.auth.extendSession();
    }
  }, 30000);

  // Proteger contra manipulación del DOM
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const loginScreen = document.getElementById('login-screen');
        const currentUser = app.auth.getCurrentUser();

        // Si no hay usuario pero se ocultó el login, forzar visibilidad
        if (!currentUser && loginScreen && !loginScreen.classList.contains('active')) {
          console.warn('⚠️ Intento de bypass detectado');
          loginScreen.classList.add('active');
        }
      }
    });
  });

  // Observar cambios en el login screen
  const loginScreen = document.getElementById('login-screen');
  if (loginScreen) {
    observer.observe(loginScreen, { attributes: true });
  }

}

export { app };