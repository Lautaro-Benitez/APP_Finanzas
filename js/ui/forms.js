// js/ui/forms.js - VERSIÓN COMPLETA CORREGIDA

import { logger } from '../utils/logger.js';

export class FormManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.app = uiManager.app;
  }

  async updateCategoryOptions(type, selectElement = null) {
    try {
      const categories = await this.app.storage.getCategories();
      const select = selectElement || document.getElementById('tx-category');

      if (!select) return;

      const cats = categories[type] || [];
      const currentValue = select.value;

      select.innerHTML = cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

      if (currentValue && cats.find(c => c.name === currentValue)) {
        select.value = currentValue;
      }

      this.updateSubcategoryOptions(select.value);

    } catch (error) {
      console.error('Error updating category options:', error);
    }
  }

  async updateSubcategoryOptions(category) {
    try {
      const categories = await this.app.storage.getCategories();
      const type = document.getElementById('tx-type')?.value || 'expense';
      const cat = categories[type].find(c => c.name === category);

      const subGroup = document.getElementById('subcategory-group');
      const subSelect = document.getElementById('tx-subcategory');

      if (!subGroup || !subSelect) return;

      if (cat && cat.subs && cat.subs.length > 0) {
        subGroup.classList.remove('hidden');
        const currentValue = subSelect.value;

        subSelect.innerHTML = '<option value="">Sin subcategoría</option>' +
          cat.subs.map(s => `<option value="${s}">${s}</option>`).join('');

        if (currentValue && cat.subs.includes(currentValue)) {
          subSelect.value = currentValue;
        }
      } else {
        subGroup.classList.add('hidden');
        subSelect.innerHTML = '';
      }

    } catch (error) {
      console.error('Error updating subcategory options:', error);
    }
  }

  // ✅ CORREGIDO: Toggle de campos de pago - solo mostrar tarjetas si corresponde
  togglePaymentFields(method) {
    const cardGroup = document.getElementById('card-group');
    const installmentsGroup = document.getElementById('installments-group');

    const cardSelect = document.getElementById('tx-card');
    const installmentsInput = document.querySelector('[name="installments"]');

    if (!cardGroup || !installmentsGroup) return;

    // ✅ Solo mostrar tarjetas si el método es Débito o Crédito
    if (method === 'Débito' || method === 'Crédito') {
      cardGroup.classList.remove('hidden');
      this.loadCardsToSelect(method);

      if (method === 'Crédito') {
        installmentsGroup.classList.remove('hidden');
        if (installmentsInput) {
          installmentsInput.required = true;
          installmentsInput.min = 1;
          installmentsInput.value = 1;
        }
      } else {
        installmentsGroup.classList.add('hidden');
        if (installmentsInput) {
          installmentsInput.required = false;
          installmentsInput.value = 1;
        }
      }
    } else {
      // ✅ Ocultar campos de tarjeta para otros métodos
      cardGroup.classList.add('hidden');
      installmentsGroup.classList.add('hidden');

      if (installmentsInput) {
        installmentsInput.required = false;
        installmentsInput.value = 1;
      }

      if (cardSelect) cardSelect.value = '';
    }
  }

  // ✅ CORREGIDO: Cargar tarjetas filtradas por tipo
  async loadCardsToSelect(paymentMethod = null) {
    try {
      const cards = await this.app.storage.getCards();
      const select = document.getElementById('tx-card');

      if (!select) return;

      let filteredCards = cards;

      // Filtrar por tipo de tarjeta según método de pago
      if (paymentMethod === 'Débito') {
        filteredCards = cards.filter(c => c.type === 'Débito');
      } else if (paymentMethod === 'Crédito') {
        filteredCards = cards.filter(c => c.type === 'Crédito');
      }

      if (filteredCards.length === 0) {
        select.innerHTML = '<option value="">No hay tarjetas de este tipo</option>';
      } else {
        select.innerHTML = '<option value="">Seleccionar tarjeta</option>' +
          filteredCards.map(c => `<option value="${c.name}">${c.name} (${c.currency || 'ARS'})</option>`).join('');
      }

    } catch (error) {
      console.error('Error loading cards to select:', error);
    }
  }

  validateForm(formData, formType) {
    const errors = [];

    switch (formType) {
      case 'transaction':
        if (!formData.get('type')) errors.push('Tipo es requerido');
        if (!formData.get('amount') || parseFloat(formData.get('amount')) <= 0) errors.push('Monto válido es requerido');
        if (!formData.get('date')) errors.push('Fecha es requerida');
        if (!formData.get('category')) errors.push('Categoría es requerida');
        if (!formData.get('paymentMethod')) errors.push('Método de pago es requerido');
        break;

      case 'budget':
        if (!formData.get('category')) errors.push('Categoría es requerida');
        if (!formData.get('limit') || parseFloat(formData.get('limit')) <= 0) errors.push('Límite válido es requerido');
        if (!formData.get('period')) errors.push('Período es requerido');
        break;

      case 'savings':
        if (!formData.get('name') || formData.get('name').trim().length < 2) errors.push('Nombre válido es requerido');
        if (!formData.get('goalAmount') || parseFloat(formData.get('goalAmount')) <= 0) errors.push('Meta válida es requerida');
        break;

      case 'user':
        if (!formData.get('name') || formData.get('name').trim().length < 2) errors.push('Nombre válido es requerido');
        if (!formData.get('username') || formData.get('username').trim().length < 3) errors.push('Usuario válido es requerido');
        if (!formData.get('role')) errors.push('Rol es requerido');
        break;
    }

    return errors;
  }

  formatFormData(formData, formType) {
    const data = {};

    switch (formType) {
      case 'transaction':
        data.type = formData.get('type');
        data.amount = parseFloat(formData.get('amount'));
        data.date = formData.get('date');
        data.category = formData.get('category');
        data.subcategory = formData.get('subcategory') || null;
        data.description = formData.get('description') || 'Sin descripción';
        data.paymentMethod = formData.get('paymentMethod');

        if (data.paymentMethod === 'Débito' || data.paymentMethod === 'Crédito') {
          data.card = formData.get('card') || null;
          data.installments = data.paymentMethod === 'Crédito' ?
            parseInt(formData.get('installments')) || 1 : 1;
        }
        break;

      case 'budget':
        data.category = formData.get('category');
        data.limit = parseFloat(formData.get('limit'));
        data.period = formData.get('period');
        break;

      case 'savings':
        data.name = formData.get('name').trim();
        data.goalAmount = parseFloat(formData.get('goalAmount'));
        if (formData.get('currentAmount')) {
          data.currentAmount = parseFloat(formData.get('currentAmount'));
        }
        break;

      case 'user':
        data.name = formData.get('name').trim();
        data.username = formData.get('username').trim();
        data.role = formData.get('role');
        if (formData.get('password')) {
          data.password = formData.get('password');
        }
        break;
    }

    return data;
  }

  resetForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
      form.reset();

      if (formId === 'transaction-form') {
        const subGroup = document.getElementById('subcategory-group');
        const cardGroup = document.getElementById('card-group');
        const installmentsGroup = document.getElementById('installments-group');

        if (subGroup) subGroup.classList.add('hidden');
        if (cardGroup) cardGroup.classList.add('hidden');
        if (installmentsGroup) installmentsGroup.classList.add('hidden');
      }
    }
  }

  showFormErrors(formElement, errors) {
    this.clearFormErrors(formElement);

    errors.forEach(error => {
      const errorElement = document.createElement('div');
      errorElement.className = 'form-error';
      errorElement.style.cssText = `
        color: var(--danger);
        font-size: 12px;
        margin-top: 4px;
        padding: 4px 8px;
        background: rgba(239, 68, 68, 0.1);
        border-radius: 4px;
        border-left: 3px solid var(--danger);
      `;
      errorElement.textContent = error;

      formElement.appendChild(errorElement);
    });
  }

  clearFormErrors(formElement) {
    const errors = formElement.querySelectorAll('.form-error');
    errors.forEach(error => error.remove());
  }

  setFormDisabled(formId, disabled) {
    const form = document.getElementById(formId);
    if (form) {
      const inputs = form.querySelectorAll('input, select, textarea, button');
      inputs.forEach(input => {
        if (input.type !== 'submit' && input.type !== 'button') {
          input.disabled = disabled;
        }
      });
    }
  }

  updateCurrencyOptions(selectElement = null) {
    const select = selectElement || document.getElementById('tx-currency');
    if (!select) return;

    const currencies = this.app.currencyManager.getSupportedCurrencies();
    select.innerHTML = currencies.map(currency => {
      const info = this.app.currencyManager.supportedCurrencies[currency];
      return `<option value="${currency}">${info.name} (${info.symbol})</option>`;
    }).join('');
  }
}