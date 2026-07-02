// js/core/savings.js - SOLUCIÓN DEFINITIVA MULTI-MONEDA

import { Validators } from '../utils/validators.js';
import { logger } from '../utils/logger.js';

export class SavingsManager {

  _parseConvertedAmount(converted) {
    if (typeof converted === 'object' && converted.amount !== undefined) {
      return converted.amount;
    }
    return parseFloat(converted);
  }

  constructor(storage, auth, walletManager) {
    this.storage = storage;
    this.auth = auth;
    this.walletManager = walletManager;
  }

  async create(data) {
    const errors = Validators.validateSavingsData(data);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    const savings = await this.storage.getSavings();
    const user = this.auth.getCurrentUser();

    const saving = {
      id: `sav_${Date.now()}`,
      userId: user.id,
      userName: user.name,
      name: data.name,
      goalAmount: parseFloat(data.goalAmount),
      currentAmount: parseFloat(data.currentAmount) || 0,
      currency: data.currency || 'ARS',
      walletId: data.walletId || null,
      deadline: data.deadline || null,
      description: data.description || '',
      contributionHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    savings.push(saving);
    await this.storage.saveSavings(savings);
    return saving;
  }

  async update(id, updates) {
    const savings = await this.storage.getSavings();
    const index = savings.findIndex(s => s.id === id);

    if (index === -1) throw new Error('Objetivo de ahorro no encontrado');

    const user = this.auth.getCurrentUser();
    if (!this.auth.isAdmin() && savings[index].userId !== user.id) {
      throw new Error('No tienes permisos para editar este objetivo');
    }

    if (updates.name || updates.goalAmount) {
      const validationData = {
        name: updates.name || savings[index].name,
        goalAmount: updates.goalAmount || savings[index].goalAmount
      };

      const errors = Validators.validateSavingsData(validationData);
      if (errors.length > 0) {
        throw new Error(errors.join(', '));
      }
    }

    savings[index] = {
      ...savings[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.storage.saveSavings(savings);
    return savings[index];
  }

  /**
   * ✅ Agrega aporte guardando moneda original
   */
  async addContribution(savingId, amount, walletId, description = '', currencyManager) {
    const savings = await this.storage.getSavings();
    const saving = savings.find(s => s.id === savingId);

    if (!saving) throw new Error('Objetivo de ahorro no encontrado');

    const user = this.auth.getCurrentUser();
    if (!this.auth.isAdmin() && saving.userId !== user.id) {
      throw new Error('No tienes permisos para modificar este objetivo');
    }

    if (amount <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    let walletName = null;
    let sourceCurrency = 'ARS';
    let originalAmount = amount;
    let exchangeRate = 1;
    let amountInSavingCurrency = amount;

    if (walletId) {
      try {
        const wallet = await this.walletManager.getById(walletId);
        walletName = wallet.name;
        sourceCurrency = wallet.currency || 'ARS';

        // ✅ FIX: convertAmount retorna número directamente
        if (sourceCurrency !== saving.currency && currencyManager) {
          const converted = await currencyManager.convertAmount(
            amount,
            sourceCurrency,
            saving.currency
          );

          // ✅ CRÍTICO: Manejar si retorna objeto o número
          amountInSavingCurrency = this._parseConvertedAmount(converted);
          exchangeRate = amountInSavingCurrency / amount;
        }

      } catch (error) {
        console.error('Error obteniendo wallet:', error);
        walletName = 'Wallet no encontrada';
      }
    }

    if (saving.currentAmount + amountInSavingCurrency > saving.goalAmount) {
      throw new Error(`El aporte excede la meta. Máximo: ${(saving.goalAmount - saving.currentAmount).toFixed(2)} ${saving.currency}`);
    }

    const contribution = {
      id: `cont_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

      // Moneda original
      originalAmount: parseFloat(originalAmount),
      originalCurrency: sourceCurrency,

      // Moneda del ahorro
      amountInSavingCurrency: parseFloat(amountInSavingCurrency),
      savingCurrency: saving.currency,

      exchangeRate: parseFloat(exchangeRate),

      walletId: walletId,
      walletName: walletName,
      description: description || 'Aporte al ahorro',
      date: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
      type: 'contribution'
    };

    saving.currentAmount = parseFloat((saving.currentAmount + amountInSavingCurrency).toFixed(2));

    if (!saving.contributionHistory) {
      saving.contributionHistory = [];
    }

    saving.contributionHistory.push(contribution);
    saving.updatedAt = new Date().toISOString();

    await this.storage.saveSavings(savings);

    logger.log('✅ Aporte agregado:', {
      original: `${originalAmount} ${sourceCurrency}`,
      converted: `${amountInSavingCurrency} ${saving.currency}`,
      rate: exchangeRate
    });

    return { saving, contribution };
  }

  /**
   * ✅ Retira aporte individual con moneda original EXACTA
   */
  async withdrawContribution(savingId, contributionId, walletIdDestination, currencyManager) {
    const savings = await this.storage.getSavings();
    const saving = savings.find(s => s.id === savingId);

    if (!saving) throw new Error('Objetivo de ahorro no encontrado');

    const user = this.auth.getCurrentUser();
    if (!this.auth.isAdmin() && saving.userId !== user.id) {
      throw new Error('No tienes permisos para modificar este objetivo');
    }

    if (!saving.contributionHistory || saving.contributionHistory.length === 0) {
      throw new Error('No hay aportes para retirar');
    }

    const contributionIndex = saving.contributionHistory.findIndex(c => c.id === contributionId);

    if (contributionIndex === -1) {
      throw new Error('Aporte no encontrado');
    }

    const contribution = saving.contributionHistory[contributionIndex];

    if (contribution.type !== 'contribution') {
      throw new Error('Solo se pueden retirar aportes, no retiros previos');
    }

    if (saving.currentAmount < contribution.amountInSavingCurrency) {
      throw new Error('El ahorro no tiene suficiente saldo');
    }

    let destinationWalletName = null;
    let destinationCurrency = contribution.originalCurrency; // Default: moneda original
    let withdrawalAmount = contribution.originalAmount; // Default: monto original EXACTO

    if (walletIdDestination) {
      try {
        const wallet = await this.walletManager.getById(walletIdDestination);
        destinationWalletName = wallet.name;
        destinationCurrency = wallet.currency || 'ARS';

        // ✅ Solo convertir si la wallet destino tiene moneda diferente a la original del aporte
        if (destinationCurrency !== contribution.originalCurrency && currencyManager) {
          const converted = await currencyManager.convertAmount(
            contribution.originalAmount,
            contribution.originalCurrency,
            destinationCurrency
          );

          withdrawalAmount = this._parseConvertedAmount(converted);
        }

      } catch (error) {
        console.error('Error obteniendo wallet destino:', error);
        destinationWalletName = 'Wallet no encontrada';
      }
    }

    // Restar del ahorro (en su moneda)
    saving.currentAmount = parseFloat((saving.currentAmount - contribution.amountInSavingCurrency).toFixed(2));

    // Eliminar el aporte del historial
    saving.contributionHistory.splice(contributionIndex, 1);
    saving.updatedAt = new Date().toISOString();

    await this.storage.saveSavings(savings);

    logger.log('✅ Retiro exitoso:', {
      original: `${contribution.originalAmount} ${contribution.originalCurrency}`,
      devuelto: `${withdrawalAmount} ${destinationCurrency}`,
      restaDelAhorro: `${contribution.amountInSavingCurrency} ${saving.currency}`
    });

    return {
      saving,
      withdrawnAmount: parseFloat(withdrawalAmount),
      withdrawnCurrency: destinationCurrency,
      originalWalletId: contribution.walletId,
      destinationWalletId: walletIdDestination,
      originalContribution: contribution
    };
  }

  /**
   * ✅ Transferir monto parcial (crea retiro en historial)
   */
  async transferToWallet(savingId, amount, walletIdDestination, description = '', currencyManager) {
    const savings = await this.storage.getSavings();
    const saving = savings.find(s => s.id === savingId);

    if (!saving) throw new Error('Objetivo de ahorro no encontrado');

    const user = this.auth.getCurrentUser();
    if (!this.auth.isAdmin() && saving.userId !== user.id) {
      throw new Error('No tienes permisos para modificar este objetivo');
    }

    if (amount <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    if (saving.currentAmount < amount) {
      throw new Error(`Saldo insuficiente. Disponible: ${saving.currentAmount} ${saving.currency}`);
    }

    let walletName = null;
    let destinationCurrency = 'ARS';
    let withdrawalAmount = amount;

    if (walletIdDestination) {
      try {
        const wallet = await this.walletManager.getById(walletIdDestination);
        walletName = wallet.name;
        destinationCurrency = wallet.currency || 'ARS';

        if (saving.currency !== destinationCurrency && currencyManager) {
          const converted = await currencyManager.convertAmount(
            amount,
            saving.currency,
            destinationCurrency
          );

          withdrawalAmount = this._parseConvertedAmount(converted);
        }

      } catch (error) {
        console.error('Error obteniendo wallet:', error);
        walletName = 'Wallet no encontrada';
      }
    }

    saving.currentAmount = parseFloat((saving.currentAmount - amount).toFixed(2));

    const withdrawal = {
      id: `withd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

      originalAmount: -parseFloat(amount),
      originalCurrency: saving.currency,

      amountInDestinationCurrency: parseFloat(withdrawalAmount),
      destinationCurrency: destinationCurrency,

      walletId: walletIdDestination,
      walletName: walletName,
      description: description || 'Retiro del ahorro',
      date: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
      type: 'withdrawal'
    };

    if (!saving.contributionHistory) {
      saving.contributionHistory = [];
    }

    saving.contributionHistory.push(withdrawal);
    saving.updatedAt = new Date().toISOString();

    await this.storage.saveSavings(savings);

    return {
      saving,
      withdrawal,
      amount: parseFloat(withdrawalAmount),
      currency: destinationCurrency,
      walletIdDestination
    };
  }

  async getContributionHistory(savingId) {
    const saving = await this.getById(savingId);

    if (!saving.contributionHistory || saving.contributionHistory.length === 0) {
      return [];
    }

    const wallets = await this.storage.getWallets();

    return saving.contributionHistory.map(contribution => {
      let walletName = contribution.walletName;

      if (!walletName && contribution.walletId) {
        const wallet = wallets.find(w => w.id === contribution.walletId);
        walletName = wallet ? wallet.name : 'Wallet eliminada';
      }

      return {
        ...contribution,
        walletName: walletName || 'Sin wallet'
      };
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async addAmount(id, amount) {
    return await this.addContribution(id, amount, null, 'Aporte manual');
  }

  async getAll() {
    let savings = await this.storage.getSavings();
    const user = this.auth.getCurrentUser();

    if (!this.auth.isAdmin()) {
      savings = savings.filter(s => s.userId === user.id);
    }

    return savings;
  }

  async getById(id) {
    const savings = await this.storage.getSavings();
    const saving = savings.find(s => s.id === id);

    if (!saving) throw new Error('Objetivo de ahorro no encontrado');

    const user = this.auth.getCurrentUser();
    if (!this.auth.isAdmin() && saving.userId !== user.id) {
      throw new Error('No tienes permisos para ver este objetivo');
    }

    return saving;
  }

  async delete(id) {
    const savings = await this.storage.getSavings();
    const saving = savings.find(s => s.id === id);

    if (!saving) throw new Error('Objetivo de ahorro no encontrado');

    const user = this.auth.getCurrentUser();
    if (!this.auth.isAdmin() && saving.userId !== user.id) {
      throw new Error('No tienes permisos para eliminar este objetivo');
    }

    const updatedSavings = savings.filter(s => s.id !== id);
    await this.storage.saveSavings(updatedSavings);
    return true;
  }

  async getProgress(id) {
    const saving = await this.getById(id);
    const progress = (saving.currentAmount / saving.goalAmount * 100).toFixed(1);

    return {
      ...saving,
      progress: parseFloat(progress),
      remaining: saving.goalAmount - saving.currentAmount
    };
  }

  async getTotalSavings() {
    const savings = await this.getAll();
    return savings.reduce((total, s) => total + s.currentAmount, 0);
  }

  async getContributionStats(savingId) {
    const history = await this.getContributionHistory(savingId);

    if (history.length === 0) {
      return {
        totalContributions: 0,
        totalWithdrawals: 0,
        netAmount: 0,
        contributionCount: 0,
        withdrawalCount: 0,
        averageContribution: 0
      };
    }

    const contributions = history.filter(h => h.type === 'contribution');
    const withdrawals = history.filter(h => h.type === 'withdrawal');

    const totalContributions = contributions.reduce((sum, c) => sum + (c.amountInSavingCurrency || 0), 0);
    const totalWithdrawals = Math.abs(withdrawals.reduce((sum, w) => sum + Math.abs(w.originalAmount || 0), 0));

    return {
      totalContributions,
      totalWithdrawals,
      netAmount: totalContributions - totalWithdrawals,
      contributionCount: contributions.length,
      withdrawalCount: withdrawals.length,
      averageContribution: contributions.length > 0 ? totalContributions / contributions.length : 0
    };
  }

  /**
   * ✅ NUEVO: Calcula el monto actual con cotización en tiempo real
   * Recalcula sumando todos los aportes con tasas actuales
   */
  async getCurrentAmountDynamic(savingId, currencyManager) {
    try {
      const saving = await this.getById(savingId);
      const history = await this.getContributionHistory(savingId);

      if (!history || history.length === 0) {
        return saving.currentAmount;
      }

      // Obtener tasas actuales
      const currentRates = await currencyManager.getExchangeRates();

      let totalInSavingCurrency = 0;

      // Recalcular cada aporte con cotización actual
      for (const item of history) {
        if (item.type === 'contribution') {
          // Usar converitAmount del manager para consistencia
          const currentAmount = await currencyManager.convertAmount(
            item.originalAmount,
            item.originalCurrency,
            saving.currency
          );
          
          totalInSavingCurrency += this._parseConvertedAmount(currentAmount);

        } else if (item.type === 'withdrawal') {
          // Restar retiros (ya están en moneda del ahorro)
          totalInSavingCurrency += item.originalAmount; // Es negativo
        }
      }

      return parseFloat(totalInSavingCurrency.toFixed(2));

    } catch (error) {
      console.error('Error calculando monto dinámico:', error);
      return saving.currentAmount; // Fallback al guardado
    }
  }

}