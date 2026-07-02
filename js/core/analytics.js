// js/core/analytics.js

import { DateUtils } from '../utils/dates.js';

export class AnalyticsEngine {

  _filterNonTransferTransactions(transactions) {
    return transactions.filter(t =>
      t.category !== 'Transferencia' && t.category !== 'Ahorro'
    );
  }

  constructor(transactions) {
    this.transactions = transactions;
  }

  async generateReport(startDate, endDate) {
    const normalizedStart = DateUtils.normalizeDate(startDate);
    const normalizedEnd = DateUtils.normalizeDate(endDate);

    const transactions = await this.transactions.getAll({
      startDate: normalizedStart,
      endDate: normalizedEnd
    });

    let income = 0;
    let expenses = 0;

    const filteredTransactions = this._filterNonTransferTransactions(transactions);

    for (const t of filteredTransactions) {
      const amount = await this.convertToARS(t);

      if (t.type === 'income') {
        income += amount;
      } else if (t.type === 'expense') {
        expenses += amount;
      }
    }

    const balance = income - expenses;
    const savingsRate = income > 0 ? ((balance / income) * 100).toFixed(1) : 0;

    const byCategory = {};
    for (const t of filteredTransactions) {
      const amount = await this.convertToARS(t);

      if (!byCategory[t.category]) {
        byCategory[t.category] = { type: t.type, total: 0, count: 0 };
      }
      byCategory[t.category].total += amount;
      byCategory[t.category].count += 1;
    }

    const categories = Object.entries(byCategory).map(([cat, data]) => ({
      category: cat,
      type: data.type,
      total: data.total,
      count: data.count,
      percentage: data.type === 'expense' ?
        (expenses > 0 ? (data.total / expenses * 100).toFixed(1) : 0) :
        (income > 0 ? (data.total / income * 100).toFixed(1) : 0)
    }));

    const avgTransaction = filteredTransactions.length > 0 ?
      (income + expenses) / filteredTransactions.length : 0;

    const largestIncome = Math.max(
      ...filteredTransactions.filter(t => t.type === 'income').map(t => t.amount),
      0
    );

    const largestExpense = Math.max(
      ...filteredTransactions.filter(t => t.type === 'expense').map(t => t.amount),
      0
    );

    return {
      summary: {
        totalIncome: income,
        totalExpenses: expenses,
        netBalance: balance,
        savingsRate,
        transactionCount: filteredTransactions.length,
        avgTransaction,
        largestIncome,
        largestExpense
      },
      categories: categories.sort((a, b) => b.total - a.total),
      period: {
        start: DateUtils.formatDateForDisplay(normalizedStart),
        end: DateUtils.formatDateForDisplay(normalizedEnd)
      }
    };
  }

  async convertToARS(transaction) {
    let amount = transaction.amount;

    if (transaction.currency && transaction.currency !== 'ARS') {
      const currencyManager = this.transactions.currencyManager;
      amount = await currencyManager.convertAmount(
        transaction.amount,
        transaction.currency,
        'ARS'
      );
    }

    return amount;
  }

  async calculateMetricsOverTime(transactions, period, options = {}) {

    const filteredTransactions = this._filterNonTransferTransactions(transactions);

    if (filteredTransactions.length === 0 && !options.startDate) {
      return {
        labels: [],
        income: [],
        expenses: [],
        balance: []
      };
    }

    const periodMapping = {
      'week': 'day',
      'month': 'day',
      'quarter': 'week',
      'year': 'month'
    };

    const effectivePeriod = periodMapping[period] || 'day';

    let minDate, maxDate;

    if (options.startDate && options.endDate) {
      minDate = new Date(options.startDate);
      maxDate = new Date(options.endDate);
    } else {
      const dates = filteredTransactions.map(t => new Date(t.date));
      minDate = new Date(Math.min(...dates));
      maxDate = new Date(Math.max(...dates));
    }

    const allKeys = this.generateAllPeriodKeys(minDate, maxDate, effectivePeriod);

    const grouped = {};
    allKeys.forEach(key => {
      grouped[key] = { income: 0, expenses: 0 };
    });

    // Usar for...of para permitir await convertToARS
    for (const t of filteredTransactions) {
      const key = this.getGroupingKey(t.date, effectivePeriod);

      if (grouped[key]) {
        const amount = await this.convertToARS(t);
        if (t.type === 'income') {
          grouped[key].income += amount;
        } else if (t.type === 'expense') {
          grouped[key].expenses += amount;
        }
      }
    }

    const sortedKeys = allKeys.sort();
    const labels = this.generateLabels(sortedKeys, effectivePeriod);

    return {
      labels,
      income: sortedKeys.map(k => grouped[k].income),
      expenses: sortedKeys.map(k => grouped[k].expenses),
      balance: sortedKeys.map(k => grouped[k].income - grouped[k].expenses)
    };
  }

  generateAllPeriodKeys(startDate, endDate, period) {
    const keys = [];
    const current = new Date(startDate);

    current.setUTCHours(0, 0, 0, 0);

    while (current <= endDate) {
      const key = this.getGroupingKey(current.toISOString(), period);

      if (!keys.includes(key)) {
        keys.push(key);
      }

      switch (period) {
        case 'day':
          current.setUTCDate(current.getUTCDate() + 1);
          break;
        case 'week':
          current.setUTCDate(current.getUTCDate() + 7);
          break;
        case 'month':
          current.setUTCMonth(current.getUTCMonth() + 1);
          break;
        case 'quarter':
          current.setUTCMonth(current.getUTCMonth() + 3);
          break;
        case 'year':
          current.setUTCFullYear(current.getUTCFullYear() + 1);
          break;
        default:
          current.setUTCDate(current.getUTCDate() + 1);
      }
    }

    return keys;
  }

  getGroupingKey(dateString, period) {
    const date = new Date(dateString);

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();

    switch (period) {
      case 'day':
        const monthDay = String(month + 1).padStart(2, '0');
        const dayDay = String(day).padStart(2, '0');
        return `${year}-${monthDay}-${dayDay}`;

      case 'week':
        const weekStart = new Date(Date.UTC(year, month, day));
        const dayOfWeek = weekStart.getUTCDay();
        weekStart.setUTCDate(day - dayOfWeek);

        const weekYear = weekStart.getUTCFullYear();
        const weekMonth = String(weekStart.getUTCMonth() + 1).padStart(2, '0');
        const weekDay = String(weekStart.getUTCDate()).padStart(2, '0');

        return `${weekYear}-${weekMonth}-${weekDay}`;

      case 'month':
        const monthStr = String(month + 1).padStart(2, '0');
        return `${year}-${monthStr}`;

      case 'quarter':
        const quarter = Math.floor(month / 3) + 1;
        return `${year}-Q${quarter}`;

      case 'year':
        return `${year}`;

      default:
        const monthDefault = String(month + 1).padStart(2, '0');
        const dayDefault = String(day).padStart(2, '0');
        return `${year}-${monthDefault}-${dayDefault}`;
    }
  }

  generateLabels(keys, period) {
    switch (period) {
      case 'day':
        return keys.map(k => {
          const [year, month, day] = k.split('-');
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          return date.toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'short'
          });
        });

      case 'week':
        return keys.map(k => {
          const date = new Date(k + 'T00:00:00Z');
          const weekNum = this.getWeekNumber(date);
          const month = date.toLocaleDateString('es-AR', { month: 'short' });
          return `${month} Sem ${weekNum}`;
        });

      case 'month':
        return keys.map(k => {
          const [year, month] = k.split('-');
          const date = new Date(parseInt(year), parseInt(month) - 1, 1);
          return date.toLocaleDateString('es-AR', {
            month: 'short',
            year: '2-digit'
          });
        });

      case 'quarter':
        return keys.map(k => k);

      case 'year':
        return keys.map(k => k);

      default:
        return keys.map(k => {
          const [year, month, day] = k.split('-');
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          return date.toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'short'
          });
        });
    }
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  async getCategoryAnalysis(category, months = 6) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const transactions = await this.transactions.getAll({
      category,
      startDate: DateUtils.normalizeDate(startDate.toISOString()),
      endDate: DateUtils.normalizeDate(endDate.toISOString())
    });

    const monthlyData = {};
    for (const t of transactions) {
      const monthKey = t.date.substring(0, 7);
      if (!monthlyData[monthKey]) monthlyData[monthKey] = 0;
      const amount = await this.convertToARS(t);
      monthlyData[monthKey] += amount;
    }

    const sortedMonths = Object.keys(monthlyData).sort();

    return {
      category,
      months: sortedMonths.map(month => ({
        month: new Date(month + '-01').toLocaleDateString('es-AR', {
          year: 'numeric',
          month: 'long'
        }),
        amount: monthlyData[month],
        trend: this.calculateTrend(monthlyData, month)
      })),
      total: await (async () => {
        let sum = 0;
        for (const t of transactions) sum += await this.convertToARS(t);
        return sum;
      })(),
      average: transactions.length > 0 ?
        (await (async () => {
          let sum = 0;
          for (const t of transactions) sum += await this.convertToARS(t);
          return sum;
        })()) / transactions.length : 0
    };
  }

  calculateTrend(data, currentMonth) {
    const months = Object.keys(data).sort();
    const currentIndex = months.indexOf(currentMonth);

    if (currentIndex < 1) return 'stable';

    const currentAmount = data[currentMonth];
    const previousAmount = data[months[currentIndex - 1]];

    if (previousAmount === 0) return 'stable';

    const change = ((currentAmount - previousAmount) / previousAmount) * 100;

    if (change > 10) return 'up';
    if (change < -10) return 'down';
    return 'stable';
  }

  async getPaymentMethodAnalysis(startDate, endDate) {
    const transactions = await this.transactions.getAll({
      type: 'expense',
      startDate: DateUtils.normalizeDate(startDate),
      endDate: DateUtils.normalizeDate(endDate)
    });

    const filteredTransactions = this._filterNonTransferTransactions(transactions);

    const byPaymentMethod = {};

    for (const t of filteredTransactions) {
      const method = t.paymentMethod || 'Sin especificar';
      const amount = await this.convertToARS(t);

      if (!byPaymentMethod[method]) {
        byPaymentMethod[method] = { total: 0, count: 0 };
      }

      byPaymentMethod[method].total += amount;
      byPaymentMethod[method].count += 1;
    }

    const total = Object.values(byPaymentMethod).reduce((sum, m) => sum + m.total, 0);

    return Object.entries(byPaymentMethod).map(([method, data]) => ({
      method,
      total: data.total,
      count: data.count,
      percentage: total > 0 ? ((data.total / total) * 100).toFixed(1) : 0
    })).sort((a, b) => b.total - a.total);
  }

  async getTopCategories(limit = 5, type = 'expense', startDate, endDate) {
    const transactions = await this.transactions.getAll({
      type,
      startDate: DateUtils.normalizeDate(startDate),
      endDate: DateUtils.normalizeDate(endDate)
    });

    const filteredTransactions = this._filterNonTransferTransactions(transactions);

    const byCategory = {};

    for (const t of filteredTransactions) {
      const amount = await this.convertToARS(t);

      if (!byCategory[t.category]) {
        byCategory[t.category] = { total: 0, count: 0 };
      }

      byCategory[t.category].total += amount;
      byCategory[t.category].count += 1;
    }

    return Object.entries(byCategory)
      .map(([category, data]) => ({
        category,
        total: data.total,
        count: data.count
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  async getPreviousMonthComparison() {
    try {
      const now = new Date();
      const currentMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      const currentMonthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

      const prevMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
      const prevMonthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999));

      const currentReport = await this.generateReport(
        currentMonthStart.toISOString(),
        currentMonthEnd.toISOString()
      );

      const previousReport = await this.generateReport(
        prevMonthStart.toISOString(),
        prevMonthEnd.toISOString()
      );

      const calculateChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / Math.abs(previous)) * 100;
      };

      return {
        income: {
          current: currentReport.summary.totalIncome,
          previous: previousReport.summary.totalIncome,
          change: calculateChange(
            currentReport.summary.totalIncome,
            previousReport.summary.totalIncome
          ),
          trend: currentReport.summary.totalIncome >= previousReport.summary.totalIncome ? 'up' : 'down'
        },
        expenses: {
          current: currentReport.summary.totalExpenses,
          previous: previousReport.summary.totalExpenses,
          change: calculateChange(
            currentReport.summary.totalExpenses,
            previousReport.summary.totalExpenses
          ),
          trend: currentReport.summary.totalExpenses >= previousReport.summary.totalExpenses ? 'up' : 'down'
        },
        balance: {
          current: currentReport.summary.netBalance,
          previous: previousReport.summary.netBalance,
          change: calculateChange(
            currentReport.summary.netBalance,
            previousReport.summary.netBalance
          ),
          trend: currentReport.summary.netBalance >= previousReport.summary.netBalance ? 'up' : 'down'
        }
      };
    } catch (error) {
      return null;
    }
  }

  async calculateBurnRate() {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

      const transactions = await this.transactions.getAll({
        startDate: monthStart.toISOString(),
        endDate: monthEnd.toISOString()
      });

      const filteredTransactions = this._filterNonTransferTransactions(transactions);

      let totalExpenses = 0;
      let totalIncome = 0;

      for (const tx of filteredTransactions) {
        const amountInARS = await this.convertToARS(tx);

        if (tx.type === 'expense') {
          totalExpenses += amountInARS;
        } else if (tx.type === 'income') {
          totalIncome += amountInARS;
        }
      }

      const netBalance = totalIncome - totalExpenses;

      const daysInMonth = monthEnd.getUTCDate();
      const currentDay = now.getUTCDate();
      const daysElapsed = currentDay;

      const avgDailyExpense = daysElapsed > 0 ? totalExpenses / daysElapsed : 0;

      let daysUntilZero = 0;
      let status = 'ok';

      if (netBalance > 0 && avgDailyExpense > 0) {
        daysUntilZero = Math.floor(netBalance / avgDailyExpense);

        if (daysUntilZero <= 7) {
          status = 'danger';
        } else if (daysUntilZero <= 15) {
          status = 'warning';
        } else {
          status = 'ok';
        }
      } else if (netBalance <= 0) {
        status = 'danger';
        daysUntilZero = 0;
      } else {
        status = 'ok';
        daysUntilZero = 999;
      }

      return {
        avgDailyExpense,
        totalExpenses,
        totalIncome,
        netBalance,
        daysUntilZero,
        status,
        daysElapsed,
        daysRemaining: daysInMonth - currentDay
      };
    } catch (error) {
      return null;
    }
  }

  async predictEndOfMonth() {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
      const currentDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getUTCDate()));

      const currentTxs = await this.transactions.getAll({
        startDate: monthStart.toISOString(),
        endDate: currentDate.toISOString()
      });

      const filteredTxs = currentTxs.filter(t =>
        t.category !== 'Transferencia' && t.category !== 'Ahorro'
      );

      let currentIncome = 0;
      let currentExpenses = 0;

      for (const tx of filteredTxs) {
        const amountInARS = await this.convertToARS(tx);

        if (tx.type === 'income') {
          currentIncome += amountInARS;
        } else if (tx.type === 'expense') {
          currentExpenses += amountInARS;
        }
      }

      const daysElapsed = now.getUTCDate();
      const daysInMonth = monthEnd.getUTCDate();
      const daysRemaining = daysInMonth - daysElapsed;

      const avgDailyIncome = daysElapsed > 0 ? currentIncome / daysElapsed : 0;
      const avgDailyExpense = daysElapsed > 0 ? currentExpenses / daysElapsed : 0;

      const projectedIncome = currentIncome + (avgDailyIncome * daysRemaining);
      const projectedExpenses = currentExpenses + (avgDailyExpense * daysRemaining);
      const projectedBalance = projectedIncome - projectedExpenses;

      let status = 'ok';
      if (projectedBalance < 0) {
        status = 'danger';
      } else if (projectedBalance < (projectedIncome * 0.1)) {
        status = 'warning';
      }

      let confidence = 'low';
      if (daysElapsed >= 20) confidence = 'high';
      else if (daysElapsed >= 10) confidence = 'medium';

      return {
        currentIncome,
        currentExpenses,
        currentBalance: currentIncome - currentExpenses,
        projectedIncome,
        projectedExpenses,
        projectedBalance,
        avgDailyIncome,
        avgDailyExpense,
        daysElapsed,
        daysRemaining,
        daysInMonth,
        status,
        confidence
      };
    } catch (error) {
      return null;
    }
  }

  async calculateFinancialHealthScore() {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

      const report = await this.generateReport(
        monthStart.toISOString(),
        monthEnd.toISOString()
      );

      let score = 0;
      const breakdown = {};

      if (report.summary.netBalance > 0) {
        breakdown.balance = 20;
        score += 20;
      } else if (report.summary.netBalance > -10000) {
        breakdown.balance = 10;
        score += 10;
      } else {
        breakdown.balance = 0;
      }

      const savingsRate = parseFloat(report.summary.savingsRate) || 0;
      if (savingsRate >= 20) {
        breakdown.savings = 25;
        score += 25;
      } else if (savingsRate >= 10) {
        breakdown.savings = 15;
        score += 15;
      } else if (savingsRate >= 5) {
        breakdown.savings = 8;
        score += 8;
      } else {
        breakdown.savings = 0;
      }

      const budgets = await this.transactions.storage.getBudgets();
      if (budgets.length > 0) {
        breakdown.budgets = 20;
        score += 20;
      } else {
        breakdown.budgets = 0;
      }

      const wallets = await this.transactions.storage.getWallets();
      if (wallets.length >= 3) {
        breakdown.diversification = 15;
        score += 15;
      } else if (wallets.length >= 2) {
        breakdown.diversification = 10;
        score += 10;
      } else if (wallets.length >= 1) {
        breakdown.diversification = 5;
        score += 5;
      } else {
        breakdown.diversification = 0;
      }

      if (report.summary.totalIncome > 0) {
        const expenseRatio = (report.summary.totalExpenses / report.summary.totalIncome) * 100;

        if (expenseRatio <= 70) {
          breakdown.expenseControl = 20;
          score += 20;
        } else if (expenseRatio <= 85) {
          breakdown.expenseControl = 12;
          score += 12;
        } else if (expenseRatio <= 100) {
          breakdown.expenseControl = 5;
          score += 5;
        } else {
          breakdown.expenseControl = 0;
        }
      } else {
        breakdown.expenseControl = 0;
      }

      let category = 'critical';
      let emoji = '🔴';

      if (score >= 90) {
        category = 'excellent';
        emoji = '💚';
      } else if (score >= 70) {
        category = 'good';
        emoji = '💛';
      } else if (score >= 50) {
        category = 'regular';
        emoji = '🟧';
      }

      return {
        score,
        breakdown,
        category,
        emoji,
        maxScore: 100
      };
    } catch (error) {
      return {
        score: 0,
        breakdown: {},
        category: 'unknown',
        emoji: '❓',
        maxScore: 100
      };
    }
  }
}