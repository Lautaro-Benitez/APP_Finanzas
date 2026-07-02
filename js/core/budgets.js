// js/core/budgets.js 
import { DateUtils } from '../utils/dates.js';
import { Validators } from '../utils/validators.js';
import { logger } from '../utils/logger.js';

export class BudgetManager {
  constructor(storage, transactions = null) {
    this.storage = storage;
    this.transactions = transactions;
  }

  async create(data) {
    const errors = Validators.validateBudgetData(data);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    const budgets = await this.storage.getBudgets();

    const existing = budgets.find(b =>
      b.category === data.category &&
      b.period === data.period &&
      ((!data.subcategory && !b.subcategory) || b.subcategory === data.subcategory)
    );

    if (existing) {
      throw new Error(`Ya existe un presupuesto ${this.getPeriodLabel(data.period)} para ${data.category}${data.subcategory ? ' - ' + data.subcategory : ''}`);
    }

    const now = new Date();

    budgets.push({
      id: `budget_${Date.now()}`,
      category: data.category,
      subcategory: data.subcategory || null,
      limit: parseFloat(data.limit),
      period: data.period,
      spent: 0,
      month: now.getMonth(),
      year: now.getFullYear(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await this.storage.saveBudgets(budgets);
    return budgets;
  }

  async update(id, updates) {
    const budgets = await this.storage.getBudgets();
    const index = budgets.findIndex(b => b.id === id);

    if (index === -1) throw new Error('Presupuesto no encontrado');

    const currentBudget = budgets[index];

    if (updates.category || updates.period || updates.subcategory !== undefined) {
      const categoryToCheck = updates.category || currentBudget.category;
      const periodToCheck = updates.period || currentBudget.period;
      const subcategoryToCheck = updates.subcategory !== undefined ? updates.subcategory : currentBudget.subcategory;

      const existing = budgets.find(b =>
        b.id !== id &&
        b.category === categoryToCheck &&
        b.period === periodToCheck &&
        ((!subcategoryToCheck && !b.subcategory) || b.subcategory === subcategoryToCheck)
      );

      if (existing) {
        throw new Error(`Ya existe otro presupuesto ${this.getPeriodLabel(periodToCheck)} para ${categoryToCheck}${subcategoryToCheck ? ' - ' + subcategoryToCheck : ''}`);
      }
    }

    budgets[index] = {
      ...budgets[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.storage.saveBudgets(budgets);
    return budgets[index];
  }

  async delete(id) {
    const budgets = await this.storage.getBudgets();
    const updatedBudgets = budgets.filter(b => b.id !== id);
    return await this.storage.saveBudgets(updatedBudgets);
  }

  async getAll() {
    return await this.storage.getBudgets();
  }

  async getById(id) {
    const budgets = await this.storage.getBudgets();
    const budget = budgets.find(b => b.id === id);

    if (!budget) throw new Error('Presupuesto no encontrado');
    return budget;
  }

  async getUtilization(budgetId) {
    const budgets = await this.storage.getBudgets();
    const budget = budgets.find(b => b.id === budgetId);
    if (!budget) return null;
    // Usar fecha actual para determinar el periodo vigente (ej: Mes actual)
    const now = new Date();
    const dates = this.getBudgetPeriodDates(budget.period, now);
    // Obtener TODAS las transacciones del periodo primero
    const allTransactionsInPeriod = await this.transactions.getAll({
      startDate: dates.start,
      endDate: dates.end
    });
    // Filtrar en memoria para asegurar comparación robusta de categorías (ignorando espacios)
    const transactions = allTransactionsInPeriod.filter(tx => {
      if (tx.type !== 'expense') return false;
      const txCat = (tx.category || '').trim();
      const budgetCat = (budget.category || '').trim();
      if (txCat !== budgetCat) return false;
      // Si el presupuesto tiene subcategoría, debe coincidir exactamente (ignorando espacios)
      if (budget.subcategory) {
        const txSub = (tx.subcategory || '').trim();
        const budgetSub = (budget.subcategory || '').trim();
        return txSub === budgetSub;
      }

      // Si el presupuesto NO tiene subcategoría, incluimos todos los gastos de esa categoría
      return true;
    });
    // ✅ CORREGIDO: Usar amountInARS para conversión correcta de monedas
    const spent = transactions.reduce((sum, t) => sum + (t.amountInARS || t.amount), 0);

    // ✅ NUEVO: Calcular compromisos futuros (cuotas pendientes)
    const futureCommitments = transactions
      .filter(t => t.installmentInfo && t.installmentInfo.current < t.installmentInfo.total)
      .reduce((sum, t) => {
        const remaining = t.installmentInfo.total - t.installmentInfo.current;
        const amountPerInstallment = (t.amountInARS || t.amount);
        return sum + (amountPerInstallment * remaining);
      }, 0);

    const utilization = budget.limit > 0 ? spent / budget.limit : 0;

    return {
      ...budget,
      spent,
      remaining: Math.max(0, budget.limit - spent),
      utilization,
      percentage: Math.min(100, (utilization * 100).toFixed(1)),
      alertLevel: utilization >= 1 ? 'exceeded' :
        utilization >= 0.9 ? 'danger' :
          utilization >= 0.75 ? 'warning' : 'ok',
      transactionCount: transactions.length,
      futureCommitments, // ✅ NUEVO: Cuotas pendientes
      totalProjected: spent + futureCommitments, // ✅ NUEVO: Total proyectado
      periodStart: dates.start,
      periodEnd: dates.end
    };
  }

  // Este método se mantiene por compatibilidad, pero con lógica mejorada
  async getTransactionsByCategoryAndSubcategory(category, subcategory, startDate, endDate) {
    const allTransactions = await this.transactions.getAll({ startDate, endDate });
    return allTransactions.filter(tx => {
      const txCat = (tx.category || '').trim();
      const targetCat = (category || '').trim();
      const txSub = (tx.subcategory || '').trim();
      const targetSub = (subcategory || '').trim();
      return tx.type === 'expense' &&
        txCat === targetCat &&
        txSub === targetSub;
    });
  }

  async getAllUtilizations() {
    const budgets = await this.getAll();
    const now = new Date();

    // Obtener transacciones una sola vez para optimizar (opcional, pero más seguro hacerlo por loop)
    // Aquí iteramos calculando cada uno con la lógica robusta
    const utilizations = [];
    for (const budget of budgets) {
      // Reutilizamos la lógica centralizada llamando a getUtilization
      // Esto asegura consistencia total entre la vista individual y la lista
      const utilization = await this.getUtilization(budget.id);
      if (utilization) {
        utilizations.push(utilization);
      }
    }
    return utilizations;
  }

  async updateSpent(budgetId, amount) {
    const budgets = await this.storage.getBudgets();
    const index = budgets.findIndex(b => b.id === budgetId);

    if (index === -1) {
      throw new Error('Presupuesto no encontrado');
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Actualizar spent y guardar mes/año actual
    budgets[index].spent = (budgets[index].spent || 0) + amount;
    budgets[index].month = currentMonth;
    budgets[index].year = currentYear;
    budgets[index].updatedAt = new Date().toISOString();

    await this.storage.saveBudgets(budgets);

    return budgets[index];
  }

  async getAlerts() {
    const utilizations = await this.getAllUtilizations();
    return utilizations
      .filter(u => u.alertLevel !== 'ok')
      .map(u => ({
        level: u.alertLevel,
        message: `${u.alertLevel === 'exceeded' ? '⊗' : '⚠'} ${u.category}${u.subcategory ? ` - ${u.subcategory}` : ''}: ${u.percentage}% (${u.spent.toFixed(0)}/${u.limit})`,
        budget: u
      }));
  }

  getBudgetPeriodDates(period, referenceDate = new Date()) {
    const refDate = new Date(referenceDate);
    let start, end;

    switch (period) {
      case 'weekly':
        start = new Date(refDate);
        start.setDate(refDate.getDate() - refDate.getDay());
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'monthly':
        start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
        end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
        break;
      case 'quarterly':
        const quarter = Math.floor(refDate.getMonth() / 3);
        start = new Date(refDate.getFullYear(), quarter * 3, 1);
        end = new Date(refDate.getFullYear(), (quarter + 1) * 3, 0);
        break;
      case 'semiannual':
        const half = Math.floor(refDate.getMonth() / 6);
        start = new Date(refDate.getFullYear(), half * 6, 1);
        end = new Date(refDate.getFullYear(), (half + 1) * 6, 0);
        break;
      case 'yearly':
        start = new Date(refDate.getFullYear(), 0, 1);
        end = new Date(refDate.getFullYear(), 11, 31);
        break;
      default:
        start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
        end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
    }

    return {
      start: DateUtils.normalizeDate(start.toISOString()),
      end: DateUtils.normalizeDate(end.toISOString())
    };
  }

  getPeriodLabel(period) {
    const labels = {
      'weekly': 'semanal',
      'monthly': 'mensual',
      'quarterly': 'trimestral',
      'semiannual': 'semestral',
      'yearly': 'anual'
    };
    return labels[period] || period;
  }
}