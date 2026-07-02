// js/utils/currency.js - VERSIÓN CON VALORES REALES DE APIs

import { logger } from './logger.js';

export class CurrencyManager {
  constructor(storage) {
    this.storage = storage;
    this.supportedCurrencies = {
      'ARS': { symbol: '$', name: 'Peso Argentino', decimal: 2 },
      'USD': { symbol: 'US$', name: 'Dólar Americano', decimal: 2 },
      'EUR': { symbol: '€', name: 'Euro', decimal: 2 }
    };

    // ✅ APIs QUE DEVUELVEN VALORES REALES
    this.apiSources = {
      // dolarapi.com tiene endpoints separados para cada moneda
      usd_official: 'https://dolarapi.com/v1/dolares/oficial',
      usd_blue: 'https://dolarapi.com/v1/dolares/blue',
      eur_official: 'https://dolarapi.com/v1/cotizaciones/eur',
      eur_blue: 'https://dolarapi.com/v1/cotizaciones/eur/blue'
    };

    this.initializeRates();
  }

  async initializeRates() {
    try {
      const rates = await this.storage.getExchangeRates();

      if (!rates || !rates.USD || rates.USD === 0) {
        logger.log('💱 Inicializando tasas por defecto...');
        const defaultRates = {
          ARS: 1,
          USD: 1000,
          EUR: 1100,
          lastUpdated: new Date().toISOString(),
          source: 'default',
          autoUpdated: false
        };
        await this.storage.saveExchangeRates(defaultRates);
        logger.log('💱 Tasas por defecto guardadas:', defaultRates);
      } else {
        logger.log('💱 Tasas existentes cargadas:', rates);
      }

    } catch (error) {
      console.error('Error initializing rates:', error);
      const errorRates = {
        ARS: 1,
        USD: 1000,
        EUR: 1100,
        lastUpdated: new Date().toISOString(),
        source: 'error_fallback',
        autoUpdated: false
      };
      await this.storage.saveExchangeRates(errorRates);
    }
  }

  async forceUpdateRates() {
    try {
      logger.log('🔄 Iniciando actualización de cotizaciones REALES...');

      const updatedRates = await this.fetchRealRates();

      if (updatedRates) {
        logger.log('✅ Cotizaciones REALES obtenidas:', updatedRates);

        const finalRates = {
          ARS: 1,
          USD: updatedRates.USD,
          EUR: updatedRates.EUR,
          lastUpdated: new Date().toISOString(),
          source: updatedRates.source,
          autoUpdated: true
        };

        await this.storage.saveExchangeRates(finalRates);

        logger.log('✅ Cotizaciones REALES guardadas:', finalRates);

        return {
          success: true,
          rates: finalRates,
          message: `Actualizado: USD $${updatedRates.USD} | EUR $${updatedRates.EUR}`
        };
      } else {
        console.warn('⚠️ No se pudieron obtener cotizaciones reales');
        const defaultRates = {
          ARS: 1,
          USD: 1200,
          EUR: 1300,
          lastUpdated: new Date().toISOString(),
          source: 'default_fallback',
          autoUpdated: false
        };

        await this.storage.saveExchangeRates(defaultRates);

        return {
          success: true,
          rates: defaultRates,
          message: 'Usando valores por defecto (APIs no disponibles)'
        };
      }

    } catch (error) {
      console.error('❌ Error en forceUpdateRates:', error);

      const errorRates = {
        ARS: 1,
        USD: 1000,
        EUR: 1100,
        lastUpdated: new Date().toISOString(),
        source: 'error_recovery',
        autoUpdated: false
      };

      await this.storage.saveExchangeRates(errorRates);

      return {
        success: false,
        error: error.message,
        message: 'Error al actualizar, usando valores de respaldo'
      };
    }
  }

  // ✅ MÉTODO QUE OBTIENE VALORES REALES DE APIs
  async fetchRealRates() {
    logger.log('🌐 Obteniendo cotizaciones REALES...');

    try {
      // ✅ OBTENER USD OFICIAL
      logger.log('🔹 Obteniendo USD oficial...');
      const usdData = await this.fetchFromAPI(this.apiSources.usd_official);
      let usdRate = usdData?.venta || usdData?.compra;

      // ✅ OBTENER EUR OFICIAL
      logger.log('🔹 Obteniendo EUR oficial...');
      const eurData = await this.fetchFromAPI(this.apiSources.eur_official);
      let eurRate = eurData?.venta || eurData?.compra;

      // ✅ SI FALLA EUR OFICIAL, INTENTAR CON EUR BLUE
      if (!eurRate) {
        logger.log('🔹 Intentando EUR blue...');
        const eurBlueData = await this.fetchFromAPI(this.apiSources.eur_blue);
        eurRate = eurBlueData?.venta || eurBlueData?.compra;
      }

      // ✅ VALIDAR QUE TENEMOS AMBAS COTIZACIONES
      if (usdRate && eurRate) {
        const result = {
          ARS: 1,
          USD: Math.round(usdRate * 100) / 100,
          EUR: Math.round(eurRate * 100) / 100,
          source: 'dolarapi.com (valores reales)',
          date: new Date().toISOString()
        };

        logger.log('✅ Cotizaciones REALES obtenidas:', result);
        return result;
      }

      // ✅ SI FALLA ALGUNA, USAR BLUELYTCIS COMO RESPALDO
      logger.log('🔹 Usando bluelytics como respaldo...');
      const backupRates = await this.fetchFromBluelytics();
      if (backupRates) {
        return backupRates;
      }

      return null;

    } catch (error) {
      console.error('❌ Error en fetchRealRates:', error);
      return null;
    }
  }

  // ✅ MÉTODO GENÉRICO PARA FETCH
  async fetchFromAPI(apiUrl) {
    try {
      logger.log('🌐 Conectando a:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      logger.log('🔹 Status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      logger.log('🔹 Datos recibidos:', data);

      return data;

    } catch (error) {
      logger.log('❌ Error en fetchFromAPI:', error.message);
      return null;
    }
  }

  // ✅ BLUELYTCIS COMO RESPALDO COMPLETO
  async fetchFromBluelytics() {
    try {
      logger.log('🌐 Conectando a bluelytics...');

      const response = await fetch('https://api.bluelytics.com.ar/v2/latest');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      logger.log('🔹 Datos bluelytics:', data);

      // ✅ BLUELYTCIS DEVUELVE USD Y EUR REALES
      let usdRate = data.oficial?.value_sell || data.oficial?.value_avg;
      let eurRate = data.oficial_euro?.value_sell || data.oficial_euro?.value_avg;

      if (usdRate && eurRate) {
        const result = {
          ARS: 1,
          USD: Math.round(usdRate * 100) / 100,
          EUR: Math.round(eurRate * 100) / 100,
          source: 'bluelytics.com.ar (valores reales)',
          date: new Date().toISOString()
        };

        logger.log('✅ Cotizaciones de bluelytics:', result);
        return result;
      }

      return null;

    } catch (error) {
      console.error('❌ Error en fetchFromBluelytics:', error.message);
      return null;
    }
  }

  async getExchangeRates() {
    try {
      const rates = await this.storage.getExchangeRates();

      if (!rates || !rates.USD || rates.USD <= 0) {
        console.warn('⚠️ Tasas no válidas, devolviendo valores por defecto');
        return {
          ARS: 1,
          USD: 1000,
          EUR: 1100,
          lastUpdated: new Date().toISOString(),
          source: 'fallback',
          autoUpdated: false
        };
      }

      return rates;
    } catch (error) {
      console.error('Error getting exchange rates:', error);
      return {
        ARS: 1,
        USD: 1000,
        EUR: 1100,
        lastUpdated: new Date().toISOString(),
        source: 'error',
        autoUpdated: false
      };
    }
  }

  async updateExchangeRates(newRates) {
    try {
      const rates = await this.getExchangeRates();
      const updatedRates = {
        ...rates,
        ...newRates,
        lastUpdated: new Date().toISOString(),
        manualUpdate: true
      };
      await this.storage.saveExchangeRates(updatedRates);
      return updatedRates;
    } catch (error) {
      console.error('Error updating exchange rates:', error);
      throw error;
    }
  }

  async convertAmount(amount, fromCurrency, toCurrency = 'ARS') {
    if (fromCurrency === toCurrency) return amount;

    try {
      const rates = await this.getExchangeRates();
      const rateFrom = rates[fromCurrency] || 1;
      const rateTo = rates[toCurrency] || 1;

      if (rateTo === 0) return amount;

      const amountInARS = amount * rateFrom;
      return amountInARS / rateTo;
    } catch (error) {
      console.error('Error converting amount:', error);
      return amount;
    }
  }

  async formatCurrency(amount, currency = 'ARS') {
    try {
      const currencyInfo = this.supportedCurrencies[currency];
      if (!currencyInfo) return this.formatCurrency(amount, 'ARS');

      const formatted = amount.toLocaleString('es-AR', {
        minimumFractionDigits: currencyInfo.decimal,
        maximumFractionDigits: currencyInfo.decimal
      });

      return `${currencyInfo.symbol} ${formatted}`;
    } catch (error) {
      console.error('Error formatting currency:', error);
      return `$${amount.toFixed(2)}`;
    }
  }

  async getCurrencySymbol(currency) {
    return this.supportedCurrencies[currency]?.symbol || '$';
  }

  getSupportedCurrencies() {
    return Object.keys(this.supportedCurrencies);
  }

  async validateExchangeRates() {
    try {
      const rates = await this.getExchangeRates();
      if (!rates.lastUpdated) return true;

      const now = new Date();
      const lastUpdated = new Date(rates.lastUpdated);
      const hoursDiff = (now - lastUpdated) / (1000 * 60 * 60);

      return hoursDiff < 24;
    } catch (error) {
      console.error('Error validating exchange rates:', error);
      return true;
    }
  }

  async getUpdateInfo() {
    try {
      const rates = await this.getExchangeRates();

      if (!rates.lastUpdated) {
        return {
          lastUpdated: null,
          source: 'manual',
          hoursAgo: null,
          needsUpdate: false
        };
      }

      const lastUpdated = new Date(rates.lastUpdated);
      const now = new Date();
      const hoursAgo = (now - lastUpdated) / (1000 * 60 * 60);

      return {
        lastUpdated: rates.lastUpdated,
        source: rates.source || 'manual',
        hoursAgo: Math.round(hoursAgo * 10) / 10,
        needsUpdate: false,
        isAutoUpdated: rates.autoUpdated || false
      };
    } catch (error) {
      console.error('Error getting update info:', error);
      return {
        lastUpdated: null,
        source: 'error',
        hoursAgo: null,
        needsUpdate: false,
        isAutoUpdated: false
      };
    }
  }
}