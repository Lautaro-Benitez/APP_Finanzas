// js/core/wallets.js - VERSIÓN CORREGIDA COMPLETA
import { Validators } from '../utils/validators.js';

export class WalletManager {
  constructor(storage, auth) {
    this.storage = storage;
    this.auth = auth;
  }

  async create(data) {
    const errors = this.validateWalletData(data);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    const wallets = await this.storage.getWallets();
    const user = this.auth.getCurrentUser();
    
    const wallet = {
      id: `wal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: user.id,
      userName: user.name,
      name: data.name,
      type: data.type,
      currency: data.currency || 'ARS',
      description: data.description || '',
      currentBalance: parseFloat(data.initialBalance) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    wallets.push(wallet);
    await this.storage.saveWallets(wallets);
    return wallet;
  }

  async update(id, updates) {
    const wallets = await this.storage.getWallets();
    const index = wallets.findIndex(w => w.id === id);
    
    if (index === -1) throw new Error('Caja/billetera no encontrada');
    
    this._validateWalletPermission(wallets[index]);
    
    // ✅ Si se actualiza initialBalance, actualizar currentBalance
    if (updates.initialBalance !== undefined) {
      updates.currentBalance = parseFloat(updates.initialBalance);
    }
    
    wallets[index] = { 
      ...wallets[index], 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    
    await this.storage.saveWallets(wallets);
    return wallets[index];
  }

  async updateBalance(id, amount, type = 'add') {
    const wallets = await this.storage.getWallets();
    const wallet = wallets.find(w => w.id === id);
    
    if (!wallet) throw new Error('Caja/billetera no encontrada');
    
    this._validateWalletPermission(wallet);

    if (type === 'add') {
      wallet.currentBalance += amount;
    } else if (type === 'subtract') {
      if (wallet.currentBalance < amount) {
        throw new Error(`Saldo insuficiente en ${wallet.name}. Disponible: ${wallet.currentBalance}`);
      }
      wallet.currentBalance -= amount;
    } else if (type === 'set') {
      wallet.currentBalance = amount;
    }
    
    wallet.updatedAt = new Date().toISOString();
    await this.storage.saveWallets(wallets);
    return wallet;
  }

  async getAll() {
    let wallets = await this.storage.getWallets();
    const user = this.auth.getCurrentUser();

    if (!this.auth.isAdmin()) {
      wallets = wallets.filter(w => w.userId === user.id);
    }

    return wallets;
  }

  async getById(id) {
    const wallets = await this.storage.getWallets();
    const wallet = wallets.find(w => w.id === id);
    
    if (!wallet) throw new Error('Caja/billetera no encontrada');
    
    this._validateWalletPermission(wallet);
    
    return wallet;
  }

  async delete(id) {
    const wallets = await this.storage.getWallets();
    const wallet = wallets.find(w => w.id === id);
    
    if (!wallet) throw new Error('Caja/billetera no encontrada');
    
    this._validateWalletPermission(wallet);
    
    // ✅ Permitir eliminar con saldo 0, alertar si tiene saldo
    if (wallet.currentBalance > 0) {
      throw new Error('No se puede eliminar una caja/billetera con saldo positivo. Transfiere el saldo primero.');
    }
    
    if (wallet.currentBalance < 0) {
      throw new Error('No se puede eliminar una caja/billetera con saldo negativo. Regulariza el saldo primero.');
    }
    
    const updatedWallets = wallets.filter(w => w.id !== id);
    await this.storage.saveWallets(updatedWallets);
    return true;
  }

  validateWalletData(data) {
    const errors = [];
    
    if (!data.name || data.name.trim().length < 2) {
      errors.push('El nombre debe tener al menos 2 caracteres');
    }
    
    // ✅ Tipos actualizados
    if (!data.type || !['Efectivo', 'Banco', 'Billetera Virtual', 'Caja Física', 'Acciones', 'Otro'].includes(data.type)) {
      errors.push('Tipo de caja/billetera inválido');
    }
    
    if (data.currency && !['ARS', 'USD', 'EUR'].includes(data.currency)) {
      errors.push('Moneda inválida');
    }
    
    // ✅ Permitir 0, solo validar que no sea negativo
    if (data.initialBalance !== undefined && data.initialBalance !== null) {
      const balance = parseFloat(data.initialBalance);
      if (isNaN(balance) || balance < 0) {
        errors.push('Saldo inicial inválido (no puede ser negativo)');
      }
    }
    
    return errors;
  }

  async getTotalBalance(targetCurrency = 'ARS', currencyManager = null) {
    const wallets = await this.getAll();
    let total = 0;
    
    for (const wallet of wallets) {
      if (wallet.currency === targetCurrency || !currencyManager) {
        total += wallet.currentBalance;
      } else {
        const converted = await currencyManager.convertAmount(
          wallet.currentBalance,
          wallet.currency,
          targetCurrency
        );
        total += (typeof converted === 'object' ? converted.amount : converted);
      }
    }
    
    return total;
  }

  async getBalanceByType(targetCurrency = 'ARS', currencyManager = null) {
    const wallets = await this.getAll();
    const byType = {};
    
    for (const wallet of wallets) {
      const type = wallet.type || 'Otro';
      if (!byType[type]) byType[type] = 0;
      
      if (wallet.currency === targetCurrency || !currencyManager) {
        byType[type] += wallet.currentBalance;
      } else {
        const converted = await currencyManager.convertAmount(
          wallet.currentBalance,
          wallet.currency,
          targetCurrency
        );
        byType[type] += (typeof converted === 'object' ? converted.amount : converted);
      }
    }
    
    return byType;
  }

  async getBalanceByCurrency() {
    const wallets = await this.getAll();
    const byCurrency = {};
    
    wallets.forEach(wallet => {
      const currency = wallet.currency || 'ARS';
      if (!byCurrency[currency]) byCurrency[currency] = 0;
      byCurrency[currency] += wallet.currentBalance;
    });
    
    return byCurrency;
  }

  async getWalletsByType(type) {
    const wallets = await this.getAll();
    return wallets.filter(w => w.type === type);
  }

  async getWalletsByCurrency(currency) {
    const wallets = await this.getAll();
    return wallets.filter(w => (w.currency || 'ARS') === currency);
  }

  // Método auxiliar para eliminar redundancias en validación de permisos
  _validateWalletPermission(wallet) {
    const user = this.auth.getCurrentUser();
    if (!this.auth.isAdmin() && wallet.userId !== user.id) {
      throw new Error('No tienes permisos para esta caja/billetera');
    }
  }
}