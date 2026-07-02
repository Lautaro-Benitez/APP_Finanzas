// js/core/loans.js - VERSIÓN COMPLETA CON CUOTAS E INTERESES
import { DateUtils } from '../utils/dates.js';
import { Validators } from '../utils/validators.js';
import { logger } from '../utils/logger.js';

export class LoansManager {
  constructor(storage, transactions, auth, walletManager, currencyManager) {
    this.storage = storage;
    this.transactions = transactions;
    this.auth = auth;
    this.walletManager = walletManager;
    this.currencyManager = currencyManager;
  }

  // ========================================
  // CRUD DE PRÉSTAMOS
  // ========================================

  async create(data) {
    const errors = this.validateLoanData(data);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    const loans = await this.getAll();
    const user = this.auth.getCurrentUser();

    // Validar wallet obligatoria
    if (!data.walletId) {
      throw new Error('Debe seleccionar una caja/billetera');
    }

    const wallet = await this.walletManager.getById(data.walletId);
    if (!wallet) {
      throw new Error('Caja/billetera no encontrada');
    }

    const originalAmount = parseFloat(data.originalAmount);
    const interestRate = parseFloat(data.interestRate || 0);
    const installments = parseInt(data.installments || 1);
    const amortizationType = data.amortizationType || 'simple';

    // ✅ VALIDACIÓN: Saldo para préstamos otorgados
    if (data.type === 'lent') {
      if (wallet.currentBalance < originalAmount) {
        throw new Error(`Saldo insuficiente en ${wallet.name}. Disponible: ${wallet.currentBalance}`);
      }
    }

    // Calcular monto total según sistema de amortización
    const totalInterest = this.calculateTotalInterest(originalAmount, interestRate, installments, amortizationType);
    const totalAmount = originalAmount + totalInterest;

    const loan = {
      id: `loan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: user.id,
      userName: user.name,
      type: data.type, // 'lent' o 'borrowed'
      amortizationType: amortizationType,
      title: data.title.trim(),
      description: data.description?.trim() || '',
      counterparty: data.counterparty.trim(),
      originalAmount: originalAmount,
      interestRate: interestRate,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      currentBalance: parseFloat(totalAmount.toFixed(2)),
      currency: data.currency || wallet.currency || 'ARS',
      walletId: data.walletId,
      walletName: wallet.name,
      installments: installments,
      installmentAmount: parseFloat((totalAmount / installments).toFixed(2)),
      isFixedInstallments: amortizationType !== 'german', // Alemán tiene cuotas decrecientes
      startDate: DateUtils.normalizeDate(data.startDate || new Date().toISOString()),
      dueDate: data.dueDate ? DateUtils.normalizeDate(data.dueDate) : null,
      status: 'active',
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Afectar wallet según tipo
    if (data.type === 'lent') {
      // Préstamo otorgado: reducir wallet (dinero sale)
      await this.walletManager.updateBalance(wallet.id, originalAmount, 'subtract');
      logger.log(`💸 Wallet ${wallet.name} reducida en ${originalAmount} (préstamo otorgado)`);
    } else if (data.type === 'borrowed') {
      // Préstamo recibido: incrementar wallet (dinero entra)
      await this.walletManager.updateBalance(wallet.id, originalAmount, 'add');

      // Crear transacción de ingreso automática
      const transactionData = {
        type: 'income',
        amount: originalAmount,
        category: 'Préstamos',
        subcategory: 'Préstamo recibido',
        description: `Préstamo recibido: ${loan.title} - ${loan.counterparty}`,
        date: loan.startDate,
        paymentMethod: 'Transferencia',
        currency: loan.currency,
        walletId: wallet.id,
        loanId: loan.id,
        isLoanTransaction: true
      };

      await this.transactions.create(transactionData);
      logger.log(`💰 Wallet ${wallet.name} incrementada en ${originalAmount} (préstamo recibido)`);
    }

    loans.push(loan);
    await this.storage.set('loans', loans);

    logger.log('✅ Préstamo creado:', loan);
    return loan;
  }

  async update(id, updates) {
    const loans = await this.getAll();
    const index = loans.findIndex(l => l.id === id);

    if (index === -1) {
      throw new Error('Préstamo no encontrado');
    }

    // No permitir editar ciertos campos si hay pagos
    if (loans[index].payments.length > 0 && (updates.originalAmount || updates.interestRate)) {
      throw new Error('No se puede cambiar el monto o interés si ya hay pagos registrados');
    }

    // Si se cambia el monto original, interés o cuotas y no hay pagos, recalcular
    if (loans[index].payments.length === 0 && 
       (updates.originalAmount || updates.interestRate !== undefined || updates.installments || updates.amortizationType)) {
      
      const loan = loans[index];
      const principal = updates.originalAmount !== undefined ? parseFloat(updates.originalAmount) : loan.originalAmount;
      const rate = updates.interestRate !== undefined ? parseFloat(updates.interestRate) : loan.interestRate;
      const periods = updates.installments !== undefined ? parseInt(updates.installments) : loan.installments;
      const type = updates.amortizationType || loan.amortizationType || 'simple';

      const totalInterest = this.calculateTotalInterest(principal, rate, periods, type);
      const newTotal = principal + totalInterest;

      updates.totalAmount = parseFloat(newTotal.toFixed(2));
      updates.currentBalance = parseFloat(newTotal.toFixed(2));
      updates.installmentAmount = parseFloat((newTotal / periods).toFixed(2));
      updates.isFixedInstallments = type !== 'german';
    }

    loans[index] = {
      ...loans[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.storage.set('loans', loans);
    return loans[index];
  }

  async delete(id) {
    const loans = await this.getAll();
    const loan = loans.find(l => l.id === id);

    if (!loan) {
      throw new Error('Préstamo no encontrado');
    }

    // Advertencia si tiene pagos
    if (loan.payments.length > 0) {
      console.warn('⚠️ Eliminando préstamo con pagos. Las transacciones asociadas NO se eliminarán automáticamente.');
    }

    const filtered = loans.filter(l => l.id !== id);
    await this.storage.set('loans', filtered);

    return true;
  }

  async getAll(filters = {}) {
    let loans = await this.storage.get('loans', []);

    // 🔄 FALLBACK/RECOVERY: Si la tabla loans está vacía, buscar en settings (viejo esquema de v1)
    if (loans.length === 0 && this.storage.db && this.storage.db.settings) {
      try {
        const oldData = await this.storage.db.settings.get('loans');
        if (oldData && oldData.data && Array.isArray(oldData.data) && oldData.data.length > 0) {
          console.warn('⚠️ Recuperando préstamos de ubicación antigua (settings)...');
          loans = oldData.data;

          // Migrar automáticamente a la nueva tabla
          await this.storage.saveLoans(loans);
          console.log('✅ Préstamos migrados y guardados en nueva tabla');
        }
      } catch (err) {
        console.warn('No se encontraron préstamos antiguos:', err);
      }
    }

    const user = this.auth.getCurrentUser();

    // Filtrar por usuario si no es admin
    if (!this.auth.isAdmin()) {
      loans = loans.filter(l => l.userId === user.id);
    }

    // Aplicar filtros
    if (filters.type) {
      loans = loans.filter(l => l.type === filters.type);
    }

    if (filters.status) {
      loans = loans.filter(l => l.status === filters.status);
    }

    // Actualizar estados automáticamente
    loans = loans.map(loan => this.updateLoanStatus(loan));

    // Ordenar por fecha de creación (más recientes primero)
    return loans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getById(id) {
    const loans = await this.getAll();
    const loan = loans.find(l => l.id === id);

    if (!loan) {
      throw new Error('Préstamo no encontrado');
    }

    return this.updateLoanStatus(loan);
  }

  // ========================================
  // PAGOS
  // ========================================

  async addPayment(loanId, paymentData) {
    const loans = await this.storage.get('loans', []);
    const index = loans.findIndex(l => l.id === loanId);

    if (index === -1) {
      throw new Error('Préstamo no encontrado');
    }

    const loan = loans[index];
    const amount = parseFloat(paymentData.amount);

    // Validaciones
    if (amount <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    if (amount > loan.currentBalance) {
      throw new Error(`El monto excede el saldo pendiente (${loan.currentBalance})`);
    }

    // Validar wallet
    const walletId = paymentData.walletId || loan.walletId;
    const wallet = await this.walletManager.getById(walletId);
    if (!wallet) {
      throw new Error('Caja/billetera no encontrada');
    }

    // Crear transacción asociada
    const transactionData = {
      type: loan.type === 'lent' ? 'income' : 'expense',
      amount: amount,
      category: 'Préstamos',
      subcategory: loan.type === 'lent' ? 'Cobro de préstamo' : 'Pago de deuda',
      description: `${loan.type === 'lent' ? 'Cobro' : 'Pago'}: ${loan.title} - ${loan.counterparty}`,
      date: paymentData.date || new Date().toISOString(),
      paymentMethod: paymentData.paymentMethod || 'Efectivo',
      card: paymentData.card || null,
      currency: loan.currency,
      walletId: walletId,
      loanId: loanId,
      isLoanPayment: true
    };

    logger.log('📝 Creando transacción para pago:', transactionData);
    const transaction = await this.transactions.create(transactionData);

    // Crear registro de pago
    const payment = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount: amount,
      date: DateUtils.normalizeDate(paymentData.date || new Date().toISOString()),
      paymentMethod: paymentData.paymentMethod || 'Efectivo',
      card: paymentData.card || null,
      walletId: walletId,
      transactionId: transaction.id,
      note: paymentData.note || '',
      createdAt: new Date().toISOString()
    };

    // Actualizar préstamo
    loan.payments.push(payment);
    loan.currentBalance = parseFloat((loan.currentBalance - amount).toFixed(2));
    loan.updatedAt = new Date().toISOString();

    // Actualizar estado si se completó
    if (loan.currentBalance <= 0) {
      loan.status = 'completed';
      loan.currentBalance = 0;
    }

    loans[index] = loan;
    await this.storage.set('loans', loans);

    logger.log('✅ Pago registrado:', payment);
    return { loan, payment, transaction };
  }

  async deletePayment(loanId, paymentId) {
    const loans = await this.storage.get('loans', []);
    const loanIndex = loans.findIndex(l => l.id === loanId);

    if (loanIndex === -1) {
      throw new Error('Préstamo no encontrado');
    }

    const loan = loans[loanIndex];
    const paymentIndex = loan.payments.findIndex(p => p.id === paymentId);

    if (paymentIndex === -1) {
      throw new Error('Pago no encontrado');
    }

    const payment = loan.payments[paymentIndex];

    // Eliminar transacción asociada
    if (payment.transactionId) {
      try {
        await this.transactions.delete(payment.transactionId);
      } catch (e) {
        console.warn('No se pudo eliminar la transacción asociada:', e);
      }
    }

    // Restaurar balance
    loan.currentBalance = parseFloat((loan.currentBalance + payment.amount).toFixed(2));
    loan.payments.splice(paymentIndex, 1);
    loan.status = 'active';
    loan.updatedAt = new Date().toISOString();

    loans[loanIndex] = loan;
    await this.storage.set('loans', loans);

    return loan;
  }

  // ========================================
  // UTILIDADES
  // ========================================

  updateLoanStatus(loan) {
    // Si está completado, mantener
    if (loan.currentBalance <= 0) {
      loan.status = 'completed';
      return loan;
    }

    // Verificar si está vencido
    if (loan.dueDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = new Date(loan.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate < today && loan.currentBalance > 0) {
        loan.status = 'overdue';
        return loan;
      }
    }

    loan.status = 'active';
    return loan;
  }

  async getSummary() {
    const loans = await this.getAll();

    const summary = {
      // Lo que me deben (yo presté)
      lent: {
        count: 0,
        totalOriginal: 0,
        totalWithInterest: 0,
        totalPending: 0,
        totalCollected: 0,
        overdue: 0,
        overdueAmount: 0
      },
      // Lo que debo (me prestaron)
      borrowed: {
        count: 0,
        totalOriginal: 0,
        totalWithInterest: 0,
        totalPending: 0,
        totalPaid: 0,
        overdue: 0,
        overdueAmount: 0
      }
    };

    for (const loan of loans) {
      const type = loan.type;
      summary[type].count++;
      summary[type].totalOriginal += loan.originalAmount;
      summary[type].totalWithInterest += loan.totalAmount;
      summary[type].totalPending += loan.currentBalance;

      const paid = loan.totalAmount - loan.currentBalance;
      if (type === 'lent') {
        summary[type].totalCollected += paid;
      } else {
        summary[type].totalPaid += paid;
      }

      if (loan.status === 'overdue') {
        summary[type].overdue++;
        summary[type].overdueAmount += loan.currentBalance;
      }
    }

    // Balance neto: lo que me deben - lo que debo
    summary.netBalance = summary.lent.totalPending - summary.borrowed.totalPending;

    return summary;
  }

  async getAlerts() {
    const loans = await this.getAll();
    const alerts = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const loan of loans) {
      if (loan.status === 'completed') continue;

      // Alerta de vencido
      if (loan.status === 'overdue') {
        alerts.push({
          level: 'danger',
          type: loan.type,
          message: `⊗ ${loan.type === 'lent' ? 'Préstamo' : 'Deuda'} VENCIDA: "${loan.title}" - ${loan.counterparty}`,
          loan
        });
        continue;
      }

      // Alerta de próximo a vencer (7 días)
      if (loan.dueDate) {
        const dueDate = new Date(loan.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        if (daysUntilDue <= 7 && daysUntilDue > 0) {
          alerts.push({
            level: 'warning',
            type: loan.type,
            message: `⚠ ${loan.type === 'lent' ? 'Préstamo' : 'Deuda'} vence en ${daysUntilDue} día(s): "${loan.title}"`,
            loan
          });
        }
      }
    }

    return alerts;
  }


  /**
   * Calcula los intereses totales según el sistema elegido
   */
  calculateTotalInterest(principal, annualRate, periods, type) {
    if (annualRate <= 0 || periods <= 0) return 0;
    
    // Tasa periódica (asumimos mensual ya que el sistema es para préstamos domésticos)
    const i = (annualRate / 100) / (periods > 1 ? 12 : 1);
    const n = periods;

    if (type === 'french') {
      // Sistema Francés: Cuotas constantes
      // Fórmula: PMT = P * (i * (1+i)^n) / ((1+i)^n - 1)
      const power = Math.pow(1 + i, n);
      const pmt = principal * (i * power) / (power - 1);
      return (pmt * n) - principal;
    } 
    
    if (type === 'german') {
      // Sistema Alemán: Amortización constante, cuotas decrecientes
      // Interés total = P * i * (n + 1) / 2
      return (principal * i * (n + 1)) / 2;
    }

    // Sistema Simple (Default): Interés directo sobre el capital
    return principal * (annualRate / 100);
  }

  validateLoanData(data) {
    const errors = [];

    if (!data.type || !['lent', 'borrowed'].includes(data.type)) {
      errors.push('Tipo de préstamo inválido');
    }

    if (!data.title || data.title.trim() === '') {
      errors.push('El título es requerido');
    }

    if (!data.counterparty || data.counterparty.trim() === '') {
      errors.push('Debes indicar a quién prestaste o quién te prestó');
    }

    if (!data.originalAmount || parseFloat(data.originalAmount) <= 0) {
      errors.push('El monto debe ser mayor a 0');
    }

    if (!data.walletId) {
      errors.push('Debe seleccionar una caja/billetera');
    }

    if (data.interestRate && parseFloat(data.interestRate) < 0) {
      errors.push('El interés no puede ser negativo');
    }

    if (data.installments && parseInt(data.installments) < 1) {
      errors.push('Las cuotas deben ser al menos 1');
    }

    if (data.dueDate) {
      const dueDate = new Date(data.dueDate);
      const startDate = new Date(data.startDate || new Date());
      if (dueDate < startDate) {
        errors.push('La fecha de vencimiento no puede ser anterior a la fecha de inicio');
      }
    }

    return errors;
  }
}