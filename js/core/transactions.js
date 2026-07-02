// js/core/transactions.js
import { DateUtils } from '../utils/dates.js';
import { logger } from '../utils/logger.js';

export class TransactionManager {
  constructor(storage, auth, currencyManager, walletManager, budgetManager = null) {
    this.storage = storage;
    this.auth = auth;
    this.currencyManager = currencyManager;
    this.walletManager = walletManager;
    this.budgetManager = budgetManager;
  }

  async create(data) {
    const errors = this.validateTransactionData(data);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    const transactions = await this.storage.getTransactions();
    const user = this.auth.getCurrentUser();

    let amountInARS = data.amount;
    if (data.currency && data.currency !== 'ARS') {
      amountInARS = await this.currencyManager.convertAmount(data.amount, data.currency, 'ARS');
    }

    const transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: user.id,
      userName: user.name,
      ...data,
      amount: data.amount,
      amountInARS: amountInARS,
      currency: data.currency || 'ARS',
      date: DateUtils.normalizeDate(data.date || new Date().toISOString()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 🆕 NUEVO: Determinar paymentStatus para crédito
    const isCreditCard = data.paymentMethod === 'Crédito';
    const hasInstallments = data.installments && data.installments > 1;

    if (isCreditCard) {
      // Todas las transacciones de crédito empiezan como pendientes
      transaction.paymentStatus = 'pending';
    }

    // Solo actualizar wallet si NO es crédito (o si es débito/efectivo/etc)
    if (data.walletId && data.walletId !== '' && data.type !== 'transfer' && !isCreditCard) {
      try {
        if (data.type === 'income') {
          await this.walletManager.updateBalance(data.walletId, data.amount, 'add');
          transaction.autoCharged = true;
          transaction.autoChargedDate = new Date().toISOString();
        } else if (data.type === 'expense') {
          await this.walletManager.updateBalance(data.walletId, data.amount, 'subtract');
          transaction.autoCharged = true;
          transaction.autoChargedDate = new Date().toISOString();
        }
      } catch (error) {
        console.error('Error updating wallet balance:', error);
        throw new Error(`Error en wallet: ${error.message}`);
      }
    }

    if (isCreditCard && hasInstallments) {
      return await this.createInstallments(transaction);
    }

    transactions.push(transaction);
    await this.storage.saveTransactions(transactions);

    // Actualizar presupuestos si es gasto
    if (transaction.type === 'expense' && !transaction.savingId) {
      await this.updateBudgets(transaction);
    }

    return transaction;
  }

  async createInstallments(transaction) {
    const transactions = await this.storage.getTransactions();
    const cards = await this.storage.getCards();
    const { installments, amount } = transaction;
    const installmentAmount = parseFloat((amount / installments).toFixed(2));
    const baseId = `tx_${Date.now()}`;

    // Obtener día de vencimiento de la tarjeta
    const card = cards.find(c => c.name === transaction.card);
    const dueDay = card?.dueDay || 10;  // Por defecto día 10

    // Fecha de la transacción
    const purchaseDate = new Date(transaction.date);
    const purchaseDay = purchaseDate.getDate();
    const purchaseMonth = purchaseDate.getMonth();
    const purchaseYear = purchaseDate.getFullYear();

    // Determinar el primer mes de vencimiento
    // Si la compra es DESPUÉS del día de cierre, va al siguiente mes
    let firstDueMonth = purchaseMonth;
    let firstDueYear = purchaseYear;

    if (purchaseDay >= dueDay) {
      // La compra fue EN o DESPUÉS del cierre del mes actual
      // El vencimiento es el mes siguiente
      firstDueMonth++;
      if (firstDueMonth > 11) {
        firstDueMonth = 0;
        firstDueYear++;
      }
    }

    for (let i = 0; i < installments; i++) {
      // Calcular la fecha de vencimiento de esta cuota
      const dueMonth = (firstDueMonth + i) % 12;
      const dueYear = firstDueYear + Math.floor((firstDueMonth + i) / 12);
      const dueDate = new Date(dueYear, dueMonth, dueDay);

      transactions.push({
        ...transaction,
        id: `${baseId}_${i}`,
        amount: installmentAmount,
        date: DateUtils.normalizeDate(dueDate.toISOString()),  // Fecha de vencimiento
        description: `${transaction.description} (${i + 1}/${installments})`,
        installmentInfo: {
          current: i + 1,
          total: installments,
          parentId: baseId,
          purchaseDate: transaction.date,  // Guardar fecha original de compra
          dueDate: dueDate.toISOString()   // Fecha de vencimiento
        },
        isInstallment: true,
        paymentStatus: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    await this.storage.saveTransactions(transactions);
    return transactions;
  }

  // 🆕 NUEVA FUNCIÓN: Pagar una cuota pendiente
  async payInstallment(installmentId, walletId) {
    const transactions = await this.storage.getTransactions();
    const index = transactions.findIndex(t => t.id === installmentId);

    if (index === -1) {
      throw new Error('Cuota no encontrada');
    }

    const installment = transactions[index];

    // Validar que esté pendiente
    if (installment.paymentStatus === 'paid') {
      throw new Error('Esta cuota ya está paga');
    }

    // Descontar de la wallet
    if (walletId) {
      await this.walletManager.updateBalance(walletId, installment.amount, 'subtract');
    }

    // Actualizar transacción
    transactions[index] = {
      ...installment,
      paymentStatus: 'paid',
      paidDate: new Date().toISOString(),
      walletId: walletId,
      updatedAt: new Date().toISOString()
    };

    await this.storage.saveTransactions(transactions);
    return transactions[index];
  }


  // 🆕 NUEVA FUNCIÓN: Marcar como paga SIN cobrar (solo admin)
  async markInstallmentAsPaidWithoutCharge(installmentId) {
    const transactions = await this.storage.getTransactions();
    const index = transactions.findIndex(t => t.id === installmentId);

    if (index === -1) {
      throw new Error('Cuota no encontrada');
    }

    const installment = transactions[index];

    // Validar que esté pendiente
    if (installment.paymentStatus === 'paid') {
      throw new Error('Esta cuota ya está marcada como paga');
    }

    // Actualizar transacción SIN tocar wallet
    transactions[index] = {
      ...installment,
      paymentStatus: 'paid',
      paidDate: new Date().toISOString(),
      paidWithoutCharge: true,  // Flag para identificar que se marcó sin cobro
      updatedAt: new Date().toISOString()
    };

    await this.storage.saveTransactions(transactions);
    return transactions[index];
  }

  // 🆕 NUEVA FUNCIÓN: Deshacer pago de cuota (solo admin)
  async undoInstallmentPayment(installmentId) {
    const transactions = await this.storage.getTransactions();
    const index = transactions.findIndex(t => t.id === installmentId);

    if (index === -1) {
      throw new Error('Cuota no encontrada');
    }

    const installment = transactions[index];

    // Validar que esté paga
    if (installment.paymentStatus !== 'paid' && !installment.autoCharged) {
      throw new Error('Esta cuota no está marcada como paga');
    }

    // Si fue pagada con wallet (NO paidWithoutCharge), DEVOLVER el dinero
    if (installment.walletId && !installment.paidWithoutCharge) {
      await this.walletManager.updateBalance(installment.walletId, installment.amount, 'add');
    }

    // Actualizar transacción
    transactions[index] = {
      ...installment,
      paymentStatus: 'pending',
      autoCharged: false,
      paidDate: null,
      paidWithoutCharge: false,
      autoChargedDate: null,
      updatedAt: new Date().toISOString()
    };

    await this.storage.saveTransactions(transactions);
    return transactions[index];
  }

  // 🆕 NUEVA FUNCIÓN: Obtener cuotas pendientes con alertas
  async getPendingInstallments() {
    const transactions = await this.storage.getTransactions();
    const cardsList = await this.storage.getCards();
    const cardsMap = cardsList.reduce((map, c) => { map[c.name] = c; return map; }, {});
    const now = new Date();

    const pending = transactions.filter(t =>
      t.paymentMethod === 'Crédito' &&
      (!t.paymentStatus || t.paymentStatus === 'pending') &&
      !t.autoCharged
    );

    return pending.map(installment => {
      const card = cardsMap[installment.card];
      const dueDay = card?.dueDay || 10;
      let dueDate;

      if (installment.installmentInfo?.dueDate) {
        dueDate = new Date(installment.installmentInfo.dueDate);
      } else {
        dueDate = this._calculateDueDate(installment.date, dueDay);
      }

      const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      let alertLevel = 'ok';
      if (diffDays < 0) alertLevel = 'overdue';
      else if (diffDays <= 3) alertLevel = 'urgent';
      else if (diffDays <= 7) alertLevel = 'warning';

      return {
        ...installment,
        dueDate: dueDate.toISOString(),
        dueDateFormatted: `${dueDate.getDate()}/${dueDate.getMonth() + 1}/${dueDate.getFullYear()}`,
        daysUntilDue: diffDays,
        alertLevel,
        cardDueDay: dueDay
      };
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  _calculateDueDate(purchaseDateStr, dueDay) {
    const purchaseDate = new Date(purchaseDateStr);
    const purchaseDay = purchaseDate.getDate();
    let dueMonth = purchaseDate.getMonth();
    let dueYear = purchaseDate.getFullYear();

    if (purchaseDay >= dueDay) {
      dueMonth++;
      if (dueMonth > 11) {
        dueMonth = 0;
        dueYear++;
      }
    }
    return new Date(dueYear, dueMonth, dueDay);
  }

  // 🆕 FUNCIÓN DE MIGRACIÓN: Actualizar transacciones antiguas de crédito
  async migrateCreditCardTransactions() {
    const transactions = await this.storage.getTransactions();
    const cards = await this.storage.getCards();
    let updated = false;

    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];

      // Solo procesar transacciones de crédito que NO tienen installmentInfo.dueDate
      if (t.paymentMethod === 'Crédito' && !t.installmentInfo?.dueDate) {
        const card = cards.find(c => c.name === t.card);
        const dueDay = card?.dueDay || 10;

        // La fecha actual de la transacción es la fecha de compra
        const purchaseDate = new Date(t.date);
        const purchaseDay = purchaseDate.getDate();
        const purchaseMonth = purchaseDate.getMonth();
        const purchaseYear = purchaseDate.getFullYear();

        const dueDate = this._calculateDueDate(t.date, dueDay);

        // Actualizar la transacción
        transactions[i] = {
          ...t,
          date: DateUtils.normalizeDate(dueDate.toISOString()),  // FECHA DE VENCIMIENTO
          installmentInfo: {
            ...(t.installmentInfo || {}),
            purchaseDate: t.date,  // Guardar fecha original de compra
            dueDate: dueDate.toISOString()
          },
          updatedAt: new Date().toISOString()
        };

        updated = true;
      }
    }

    if (updated) {
      await this.storage.saveTransactions(transactions);
    }

    return updated;
  }


  async getAll(filters = {}) {
    let transactions = await this.storage.getTransactions();
    const user = this.auth.getCurrentUser();

    if (!this.auth.isAdmin()) {
      transactions = transactions.filter(t => t.userId === user.id);
    }

    if (filters.type) {
      if (filters.type === 'loan') {
        transactions = transactions.filter(t => t.loanId || t.category === 'Préstamo');
      } else if (filters.type === 'saving') {
        transactions = transactions.filter(t => t.savingId || t.category === 'Ahorro');
      } else {
        transactions = transactions.filter(t => t.type === filters.type);
      }
    }

    if (filters.category) {
      transactions = transactions.filter(t => t.category === filters.category);
    }

    if (filters.subcategory) {
      transactions = transactions.filter(t => t.subcategory === filters.subcategory);
    }

    if (filters.paymentMethod) {
      transactions = transactions.filter(t => t.paymentMethod === filters.paymentMethod);
    }

    if (filters.startDate) {
      transactions = transactions.filter(t => new Date(t.date) >= new Date(filters.startDate));
    }

    if (filters.endDate) {
      transactions = transactions.filter(t => new Date(t.date) <= new Date(filters.endDate));
    }

    if (filters.userId) {
      transactions = transactions.filter(t => t.userId === filters.userId);
    }

    return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async getById(id) {
    const transactions = await this.storage.getTransactions();
    const transaction = transactions.find(t => t.id === id);

    if (!transaction) {
      throw new Error('Transacción no encontrada');
    }

    if (!this.auth.canViewTransaction(transaction)) {
      throw new Error('No tienes permisos para ver esta transacción');
    }

    return transaction;
  }

  async update(id, updates) {
    const transactions = await this.storage.getTransactions();
    const index = transactions.findIndex(t => t.id === id);

    if (index === -1) {
      throw new Error('Transacción no encontrada');
    }

    if (!this.auth.canEditTransaction(transactions[index])) {
      throw new Error('No tienes permisos para editar esta transacción');
    }

    if (updates.date) {
      updates.date = DateUtils.normalizeDate(updates.date);
    }

    const oldTransaction = transactions[index];
    const walletChanged = updates.walletId && updates.walletId !== oldTransaction.walletId;
    const amountChanged = updates.amount && updates.amount !== oldTransaction.amount;
    const paymentMethod = updates.paymentMethod || oldTransaction.paymentMethod;

    // 🆕 NO tocar wallet si es transacción de CRÉDITO
    const shouldUpdateWallet = paymentMethod !== 'Crédito';

    if ((walletChanged || amountChanged) && shouldUpdateWallet) {
      if (oldTransaction.walletId) {
        if (oldTransaction.type === 'income') {
          await this.walletManager.updateBalance(oldTransaction.walletId, oldTransaction.amount, 'subtract');
        } else if (oldTransaction.type === 'expense') {
          await this.walletManager.updateBalance(oldTransaction.walletId, oldTransaction.amount, 'add');
        }
      }

      const newWalletId = updates.walletId || oldTransaction.walletId;
      const newAmount = updates.amount || oldTransaction.amount;

      if (newWalletId) {
        const transactionType = updates.type || oldTransaction.type;
        if (transactionType === 'income') {
          await this.walletManager.updateBalance(newWalletId, newAmount, 'add');
        } else if (transactionType === 'expense') {
          await this.walletManager.updateBalance(newWalletId, newAmount, 'subtract');
        }
      }
    }

    transactions[index] = {
      ...transactions[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.storage.saveTransactions(transactions);
    return transactions[index];
  }

  async delete(id) {
    const transactions = await this.storage.getTransactions();
    const transaction = transactions.find(t => t.id === id);

    if (!transaction) {
      throw new Error('Transacción no encontrada');
    }

    if (!this.auth.canDeleteTransaction(transaction)) {
      throw new Error('No tienes permisos para eliminar esta transacción');
    }

    // ✅ SOLO restaurar saldo si:
    // 1. NO es crédito (porque ya se descontó al crear)
    // 2. ES crédito pero ya fue COBRADA (autoCharged o paymentStatus === 'paid')
    const isCredit = transaction.paymentMethod === 'Crédito';
    const isPaidCredit = isCredit && (transaction.autoCharged || transaction.paymentStatus === 'paid');
    
    // Si no es crédito, siempre se descontó del wallet
    // Si es crédito, solo se descontó si ya se marcó como paga
    const shouldRestoreWallet = transaction.walletId && (!isCredit || isPaidCredit);

    if (shouldRestoreWallet) {
      try {
        if (transaction.type === 'income') {
          await this.walletManager.updateBalance(transaction.walletId, transaction.amount, 'subtract');
        } else if (transaction.type === 'expense') {
          await this.walletManager.updateBalance(transaction.walletId, transaction.amount, 'add');
        }
      } catch (error) {
        console.error('Error restaurando saldo al eliminar:', error);
      }
    }

    // ✅ ACTUALIZAR PRESUPUESTOS (Restar el gasto eliminado)
    if (transaction.type === 'expense' && !transaction.savingId && this.budgetManager) {
      try {
        const budgets = await this.budgetManager.getAll();
        for (const budget of budgets) {
          const categoryMatches = budget.category === transaction.category;
          const subcategoryMatches = !budget.subcategory || budget.subcategory === transaction.subcategory;

          if (categoryMatches && subcategoryMatches) {
            // Restar enviando el monto en negativo
            await this.budgetManager.updateSpent(budget.id, -transaction.amount);
          }
        }
      } catch (error) {
        console.error('Error actualizando presupuesto al eliminar:', error);
      }
    }

    const updatedTransactions = transactions.filter(t => t.id !== id);
    await this.storage.saveTransactions(updatedTransactions);
    return true;
  }

  async getByCategory(category, startDate, endDate) {
    const transactions = await this.getAll({
      category,
      startDate,
      endDate
    });

    return transactions.filter(t => t.type === 'expense');
  }

  async getTotalByType(type, startDate, endDate) {
    const transactions = await this.getAll({ type, startDate, endDate });
    let total = 0;

    for (const t of transactions) {
      if (t.currency && t.currency !== 'ARS') {
        const convertedAmount = await this.currencyManager.convertAmount(t.amount, t.currency, 'ARS');
        total += convertedAmount;
      } else {
        total += t.amount;
      }
    }

    return total;
  }

  validateTransactionData(data) {
    const errors = [];

    if (!data.type || !['income', 'expense', 'transfer'].includes(data.type)) {
      errors.push('Tipo de transacción inválido');
    }

    if (!data.amount || data.amount <= 0 || isNaN(data.amount)) {
      errors.push('El monto debe ser un número mayor a 0');
    }

    if (!data.date || isNaN(new Date(data.date).getTime())) {
      errors.push('Fecha inválida');
    }

    if (!data.category || data.category.trim() === '') {
      errors.push('Categoría requerida');
    }

    if (!data.paymentMethod || !['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Ahorro'].includes(data.paymentMethod)) {
      errors.push('Método de pago inválido');
    }

    if (data.currency && !['ARS', 'USD', 'EUR'].includes(data.currency)) {
      errors.push('Moneda inválida');
    }

    return errors;
  }

  async updateBudgets(transaction) {
    try {
      // Importar dinámicamente el BudgetManager si no está disponible
      if (!this.budgetManager) {
        return; // Si no hay budgetManager, no hacer nada
      }

      const budgets = await this.budgetManager.getAll();

      for (const budget of budgets) {
        // Verificar si la transacción coincide con el presupuesto
        const categoryMatches = budget.category === transaction.category;
        const subcategoryMatches = !budget.subcategory || budget.subcategory === transaction.subcategory;

        if (categoryMatches && subcategoryMatches) {
          await this.budgetManager.updateSpent(budget.id, transaction.amount);
        }
      }
    } catch (error) {
      console.error('Error actualizando presupuestos:', error);
      // No lanzar error para no bloquear la creación de transacciones
    }
  }

}