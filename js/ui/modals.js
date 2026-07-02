// js/ui/modals.js - PARTE 1: TRANSACTION MODAL CORREGIDO

import logger from '../utils/logger.js';

export class ModalManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.app = uiManager.app;
  }

  // ========================================
  // ✅ BUG #1 CORREGIDO: Listeners duplicados
  // ========================================
  showTransactionModal(transaction = null) {
    const isEdit = !!transaction;
    const modal = document.getElementById('transaction-modal');
    const title = document.getElementById('transaction-modal-title');
    const form = document.getElementById('transaction-form');
    const submitBtn = document.getElementById('transaction-submit-btn');

    // ✅ SOLUCIÓN: Clonar formulario para eliminar listeners antiguos
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    const freshForm = document.getElementById('transaction-form');

    if (isEdit) {
      title.textContent = 'Editar Transacción';
      submitBtn.textContent = 'Actualizar';

      freshForm.querySelector('[name="type"]').value = transaction.type;
      freshForm.querySelector('[name="amount"]').value = transaction.amount;

      // ✅ BUG #2 CORREGIDO: Normalización de fechas UTC
      const dateForInput = transaction.date.includes('T') ?
        transaction.date.split('T')[0] : transaction.date;
      freshForm.querySelector('[name="date"]').value = dateForInput;

      freshForm.querySelector('[name="description"]').value = transaction.description || '';
      freshForm.querySelector('[name="paymentMethod"]').value = transaction.paymentMethod;

      const txCurrency = transaction.currency || 'ARS';
      const currencyInput = document.getElementById('tx-currency');
      const currencyDisplay = document.getElementById('tx-currency-display');

      if (currencyInput) currencyInput.value = txCurrency;
      if (currencyDisplay) currencyDisplay.value = txCurrency;

      document.getElementById('transaction-id').value = transaction.id;

      // ✅ BUG #3 CORREGIDO: Cargar categorías de forma asíncrona correcta
      this.ui.forms.updateCategoryOptions(transaction.type).then(() => {
        freshForm.querySelector('[name="category"]').value = transaction.category;

        if (transaction.subcategory) {
          this.ui.forms.updateSubcategoryOptions(transaction.category).then(() => {
            setTimeout(() => {
              const subSelect = freshForm.querySelector('[name="subcategory"]');
              if (subSelect) {
                subSelect.value = transaction.subcategory;
              }
            }, 50);
          });
        }
      });

      this.ui.forms.togglePaymentFields(transaction.paymentMethod);

      if (transaction.card) {
        this.ui.forms.loadCardsToSelect().then(() => {
          setTimeout(() => {
            const cardSelect = freshForm.querySelector('[name="card"]');
            if (cardSelect) {
              cardSelect.value = transaction.card;
            }
          }, 50);
        });
      }

      if (transaction.installments && transaction.installments > 1) {
        freshForm.querySelector('[name="installments"]').value = transaction.installments;
      }

      this.loadWalletsToSelect().then(() => {
        if (transaction.walletId) {
          setTimeout(() => {
            const walletSelect = freshForm.querySelector('[name="walletId"]');
            if (walletSelect) {
              walletSelect.value = transaction.walletId;
            }
          }, 50);
        }
      });

    } else {
      // Modo crear
      title.textContent = 'Nueva Transacción';
      submitBtn.textContent = 'Guardar';
      freshForm.reset();
      document.getElementById('transaction-id').value = '';

      // ✅ BUG #4 CORREGIDO: Fecha actual correcta
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      freshForm.querySelector('[name="date"]').value = `${year}-${month}-${day}`;

      const currencyInput = document.getElementById('tx-currency');
      const currencyDisplay = document.getElementById('tx-currency-display');

      if (currencyInput) currencyInput.value = 'ARS';
      if (currencyDisplay) currencyDisplay.value = 'ARS';

      this.ui.forms.updateCategoryOptions('expense');
      this.loadWalletsToSelect();
    }

    modal.classList.add('active');

    // ✅ BUG #5 CORREGIDO: Botón cancelar con función flecha
    const cancelBtn = document.getElementById('cancel-transaction-btn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        modal.classList.remove('active');
      };
    }

    // ✅ CORRECCIÓN: Nuevo listener único para el form submit
    freshForm.onsubmit = (e) => this.handleTransactionSubmit(e, isEdit);

    // ✅ BUG #6 CORREGIDO: Configurar listeners de campos correctamente
    this.setupTransactionFieldListeners();
  }

  // ========================================
  // ✅ NUEVO: Método centralizado para listeners
  // ========================================
  setupTransactionFieldListeners() {
    const typeSelect = document.getElementById('tx-type');
    const categorySelect = document.getElementById('tx-category');
    const paymentSelect = document.getElementById('payment-method');
    const walletSelect = document.getElementById('tx-wallet');

    if (typeSelect) {
      typeSelect.onchange = (e) => {
        this.ui.forms.updateCategoryOptions(e.target.value);
      };
    }

    if (categorySelect) {
      categorySelect.onchange = (e) => {
        this.ui.forms.updateSubcategoryOptions(e.target.value);
      };
    }

    if (paymentSelect) {
      paymentSelect.onchange = (e) => {
        this.ui.forms.togglePaymentFields(e.target.value);
      };
    }

    if (walletSelect) {
      walletSelect.onchange = async (e) => {
        const walletId = e.target.value;

        if (!walletId) {
          const currencyInput = document.getElementById('tx-currency');
          const currencyDisplay = document.getElementById('tx-currency-display');
          if (currencyInput) currencyInput.value = 'ARS';
          if (currencyDisplay) currencyDisplay.value = 'ARS';
          return;
        }

        try {
          const wallet = await this.app.walletManager.getById(walletId);
          const currency = wallet.currency || 'ARS';

          const currencyInput = document.getElementById('tx-currency');
          const currencyDisplay = document.getElementById('tx-currency-display');

          if (currencyInput) currencyInput.value = currency;
          if (currencyDisplay) currencyDisplay.value = currency;

        } catch (error) {
          console.error('Error loading wallet:', error);
        }
      };
    }
  }

  // ========================================
  // ✅ WALLETS SELECT LOADER
  // ========================================
  async loadWalletsToSelect() {
    try {
      const wallets = await this.app.walletManager.getAll();
      const select = document.getElementById('tx-wallet');

      if (!select) return;

      select.innerHTML = '<option value="">Sin caja específica</option>' +
        wallets.map(w => {
          const currency = w.currency || 'ARS';
          return `<option value="${w.id}">${w.name} (${this.ui.formatCurrency(w.currentBalance)} ${currency})</option>`;
        }).join('');

    } catch (error) {
      console.error('Error loading wallets to select:', error);
    }
  }

  // ========================================
  // ✅ BUG #7 CORREGIDO: Submit handler con validaciones
  // ========================================
  async handleTransactionSubmit(e, isEdit) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = isEdit ? 'Actualizando...' : 'Guardando...';

      const formData = new FormData(form);

      // ✅ BUG #8 CORREGIDO: Validar datos antes de enviar
      const amount = parseFloat(formData.get('amount'));
      if (!amount || amount <= 0) {
        throw new Error('El monto debe ser mayor a 0');
      }

      const data = {
        type: formData.get('type'),
        amount: amount,
        date: formData.get('date'),
        category: formData.get('category'),
        subcategory: formData.get('subcategory') || null,
        description: formData.get('description') || 'Sin descripción',
        paymentMethod: formData.get('paymentMethod'),
        currency: formData.get('currency') || 'ARS',
        walletId: formData.get('walletId') || null
      };

      // ✅ Validar campos requeridos
      if (!data.type || !data.category || !data.paymentMethod) {
        throw new Error('Todos los campos obligatorios deben estar completos');
      }

      if (data.paymentMethod === 'Débito' || data.paymentMethod === 'Crédito') {
        data.card = formData.get('card') || null;
        data.installments = data.paymentMethod === 'Crédito' ?
          parseInt(formData.get('installments')) || 1 : 1;
      } else {
        data.card = null;
        data.installments = 1;
      }

      let result;
      if (isEdit) {
        const id = formData.get('id');
        result = await this.app.transactions.update(id, data);
      } else {
        result = await this.app.transactions.create(data);
      }

      form.reset();
      this.closeModal('transaction-modal');

      this.ui.showToast(
        `Transacción ${isEdit ? 'actualizada' : 'creada'} correctamente`,
        'success'
      );

      // ✅ BUG #9 CORREGIDO: Recargar vistas después de guardar
      await this.reloadAllViews();

    } catch (error) {
      console.error('Error saving transaction:', error);
      this.ui.showToast('Error: ' + error.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }

  // ========================================
  // ✅ MÉTODO CRÍTICO: Recargar vistas
  // ========================================
  async reloadAllViews() {
    try {
      // Siempre recargar dashboard
      await this.ui.loadDashboard();

      // Recargar vista actual si no es dashboard
      const currentView = this.ui.currentView;

      switch (currentView) {
        case 'transactions':
          await this.ui.filterTransactions();
          break;
        case 'budgets':
          await this.ui.loadBudgets();
          break;
        case 'savings':
          await this.ui.loadSavings();
          break;
        case 'wallets':
          await this.ui.loadWallets();
          break;
        case 'settings':
          await this.ui.loadSettings();
          break;
      }
    } catch (error) {
      console.error('Error reloading views:', error);
    }
  }

  // ========================================
  // UTILITY: Close Modal
  // ========================================
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  }

  // ========================================
  // ✅ BUDGET MODAL CORREGIDO
  // ========================================
  showBudgetModal(budget = null) {
    const isEdit = !!budget;

    // ✅ OBTENER CATEGORÍAS PRIMERO
    this.app.storage.getCategories().then(categories => {
      const expenseCategories = categories.expense || [];

      const html = `
        <div class="modal active" id="budget-modal">
            <div class="modal-content">
            <h2 style="margin-bottom: 20px;">${isEdit ? 'Editar' : 'Nuevo'} Presupuesto</h2>
            <form id="budget-form">
                <input type="hidden" name="id" value="${isEdit ? budget.id : ''}">
                
                <div class="form-group">
                <label class="form-label">Categoría</label>
                <select class="form-select" name="category" id="budget-category" required>
                    <option value="">Seleccionar categoría...</option>
                    ${expenseCategories.map(cat => `
                    <option value="${cat.name}" ${isEdit && budget.category === cat.name ? 'selected' : ''}>
                        ${cat.name}
                    </option>
                    `).join('')}
                </select>
                </div>
                
                <div class="form-group hidden" id="budget-subcategory-group">
                <label class="form-label">Subcategoría (opcional)</label>
                <select class="form-select" name="subcategory" id="budget-subcategory">
                    <option value="">Todas las subcategorías</option>
                </select>
                </div>
                
                <div class="form-group">
                <label class="form-label">Límite de Gasto</label>
                <input type="number" class="form-input" name="limit" step="0.01" min="0.01" 
                        value="${isEdit ? budget.limit : ''}" required>
                </div>
                
                <div class="form-group">
                <label class="form-label">Período</label>
                <select class="form-select" name="period" required>
                    <option value="weekly" ${isEdit && budget.period === 'weekly' ? 'selected' : ''}>Semanal</option>
                    <option value="monthly" ${isEdit && budget.period === 'monthly' ? 'selected' : ''}>Mensual</option>
                    <option value="quarterly" ${isEdit && budget.period === 'quarterly' ? 'selected' : ''}>Trimestral (3 meses)</option>
                    <option value="semiannual" ${isEdit && budget.period === 'semiannual' ? 'selected' : ''}>Semestral (6 meses)</option>
                    <option value="yearly" ${isEdit && budget.period === 'yearly' ? 'selected' : ''}>Anual (12 meses)</option>
                </select>
                </div>
                
                <div style="display: flex; gap: 12px;">
                <button type="submit" class="btn btn-success" style="flex: 1;">
                    ${isEdit ? 'Actualizar' : 'Guardar'}
                </button>
                <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
                </div>
            </form>
            </div>
        </div>
        `;

      document.body.insertAdjacentHTML('beforeend', html);

      // ✅ CONFIGURAR SUBCATEGORÍAS INICIALES SI ES EDICIÓN
      if (isEdit && budget.category) {
        const selectedCategory = expenseCategories.find(c => c.name === budget.category);
        if (selectedCategory && selectedCategory.subs && selectedCategory.subs.length > 0) {
          const subGroup = document.getElementById('budget-subcategory-group');
          const subSelect = document.getElementById('budget-subcategory');

          subGroup.classList.remove('hidden');
          subSelect.innerHTML = '<option value="">Todas las subcategorías</option>' +
            selectedCategory.subs.map(s =>
              `<option value="${s}" ${budget.subcategory === s ? 'selected' : ''}>${s}</option>`
            ).join('');
        }
      }

      // ✅ LISTENER PARA CAMBIO DE CATEGORÍA (siempre activo)
      document.getElementById('budget-category').addEventListener('change', async (e) => {
        const category = e.target.value;
        const selectedCategory = expenseCategories.find(c => c.name === category);

        const subGroup = document.getElementById('budget-subcategory-group');
        const subSelect = document.getElementById('budget-subcategory');

        if (selectedCategory && selectedCategory.subs && selectedCategory.subs.length > 0) {
          subGroup.classList.remove('hidden');
          subSelect.innerHTML = '<option value="">Todas las subcategorías</option>' +
            selectedCategory.subs.map(s => `<option value="${s}">${s}</option>`).join('');
        } else {
          subGroup.classList.add('hidden');
          subSelect.innerHTML = '<option value="">Todas las subcategorías</option>';
        }
      });

      const budgetForm = document.getElementById('budget-form');
      if (budgetForm) {
        budgetForm.onsubmit = async (e) => {
          e.preventDefault();

          const submitBtn = e.target.querySelector('button[type="submit"]');
          const originalText = submitBtn.textContent;

          try {
            submitBtn.disabled = true;
            submitBtn.textContent = isEdit ? 'Actualizando...' : 'Guardando...';

            const formData = new FormData(e.target);

            const budgetData = {
              category: formData.get('category'),
              subcategory: formData.get('subcategory') || null,
              limit: parseFloat(formData.get('limit')),
              period: formData.get('period')
            };

            // ✅ VALIDACIONES MEJORADAS CON DEBUG
            if (!budgetData.category || budgetData.category === '') {
              throw new Error('Debes seleccionar una categoría');
            }

            if (!budgetData.limit || budgetData.limit <= 0 || isNaN(budgetData.limit)) {
              throw new Error('El límite debe ser un número mayor a 0');
            }

            if (!budgetData.period) {
              throw new Error('Debes seleccionar un período');
            }

            if (isEdit) {
              const id = formData.get('id');
              await this.app.budgets.update(id, budgetData);
            } else {
              await this.app.budgets.create(budgetData);
            }

            document.getElementById('budget-modal').remove();
            this.ui.showToast(`Presupuesto ${isEdit ? 'actualizado' : 'creado'} correctamente`, 'success');

            await this.reloadAllViews();

          } catch (error) {
            console.error('❌ Budget save error:', error);
            this.ui.showToast('Error: ' + error.message, 'error');
          } finally {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = originalText;
            }
          }
        };
      }
    });
  }

  // ========================================
  // ✅ SAVINGS MODAL CORREGIDO
  // ========================================
  async showSavingsModal(saving = null) {
    const isEdit = !!saving;
    const wallets = await this.app.walletManager.getAll();

    // ✅ Obtener datos si es edición
    let contributionHistory = [];
    let stats = null;
    let currentRates = null;
    let currentAmountDynamic = null;

    if (isEdit) {
      try {
        [contributionHistory, stats, currentRates] = await Promise.all([
          this.app.savings.getContributionHistory(saving.id),
          this.app.savings.getContributionStats(saving.id),
          this.app.currencyManager.getExchangeRates()
        ]);

        // ✅ NUEVO: Calcular total con cotización actual
        currentAmountDynamic = await this.app.savings.getCurrentAmountDynamic(
          saving.id,
          this.app.currencyManager
        );

      } catch (error) {
        console.error('Error cargando historial:', error);
        currentAmountDynamic = saving.currentAmount;
      }
    }

    // ✅ Función auxiliar para convertir en tiempo real
    const convertDynamic = (amount, fromCurrency, toCurrency) => {
      if (fromCurrency === toCurrency) return amount;
      if (!currentRates) return amount;

      let amountInARS = amount;
      if (fromCurrency !== 'ARS') {
        amountInARS = amount * (currentRates[fromCurrency] || 1);
      }

      if (toCurrency !== 'ARS') {
        return amountInARS / (currentRates[toCurrency] || 1);
      }

      return amountInARS;
    };

    // ✅ Calcular diferencia con monto guardado
    const showDynamicWarning = isEdit && currentAmountDynamic !== null &&
      Math.abs(currentAmountDynamic - saving.currentAmount) > 0.01;

    const html = `
      <div class="modal active" id="savings-modal-custom">
        <div class="modal-content" style="max-width: 700px;">
          <h2 style="margin-bottom: 20px;">${isEdit ? 'Editar' : 'Nuevo'} Objetivo de Ahorro</h2>
          
          <form id="savings-form-custom">
            <div class="form-group">
              <label class="form-label">Nombre</label>
              <input type="text" class="form-input" name="name" 
                    value="${isEdit ? saving.name : ''}" 
                    placeholder="Ej: Vacaciones, Auto nuevo" required>
            </div>
            
            <div class="form-row">
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Meta</label>
                <input type="number" class="form-input" name="goalAmount" 
                      step="0.01" min="0.01" 
                      value="${isEdit ? saving.goalAmount : ''}" required>
              </div>
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Moneda</label>
                <select class="form-select" name="currency" required>
                  <option value="ARS" ${isEdit && saving.currency === 'ARS' ? 'selected' : ''}>ARS ($)</option>
                  <option value="USD" ${isEdit && saving.currency === 'USD' ? 'selected' : ''}>USD (US$)</option>
                  <option value="EUR" ${isEdit && saving.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                </select>
              </div>
            </div>
            
            ${isEdit ? `
              <div class="form-group">
                <label class="form-label">Monto Actual ${showDynamicWarning ? '(cotización actual)' : ''}</label>
                <input type="number" class="form-input" 
                      value="${currentAmountDynamic !== null ? currentAmountDynamic.toFixed(2) : saving.currentAmount.toFixed(2)}" 
                      readonly style="background: var(--bg-tertiary); cursor: not-allowed;">
                <small style="color: var(--text-secondary); font-size: 11px;">
                  ${showDynamicWarning ?
          `💱 Recalculado con cotización actual (guardado: ${this.ui.formatCurrency(saving.currentAmount)})` :
          'El monto se modifica agregando o retirando fondos'
        }
                </small>
              </div>
              
              ${stats ? `
                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                  <strong style="display: block; margin-bottom: 8px;">📊 Estadísticas:</strong>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                    <div>✅ Aportes: ${this.ui.formatCurrency(stats.totalContributions)}</div>
                    <div>📤 Retiros: ${this.ui.formatCurrency(stats.totalWithdrawals)}</div>
                    <div>💰 Total actual: ${this.ui.formatCurrency(currentAmountDynamic || saving.currentAmount)}</div>
                    <div>🎯 Progreso: ${((currentAmountDynamic || saving.currentAmount) / saving.goalAmount * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ` : ''}
            ` : ''}
            
            <div class="form-group">
              <label class="form-label">Fecha Límite (opcional)</label>
              <input type="date" class="form-input" name="deadline" 
                    value="${isEdit && saving.deadline ? saving.deadline.split('T')[0] : ''}">
            </div>
            
            <div class="form-group">
              <label class="form-label">Descripción (opcional)</label>
              <textarea class="form-input" name="description" 
                        placeholder="Describe tu objetivo" 
                        rows="2">${isEdit ? saving.description || '' : ''}</textarea>
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 20px;">
              <button type="submit" class="btn btn-primary" style="flex: 1;">
                ${isEdit ? 'Actualizar' : 'Guardar'}
              </button>
              <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            </div>
          </form>
          
          ${isEdit && contributionHistory.length > 0 ? `
            <div style="border-top: 2px solid var(--border-color); margin-top: 24px; padding-top: 20px;">
              <h3 style="margin-bottom: 16px;">📋 Historial de Movimientos</h3>
              <div style="max-height: 300px; overflow-y: auto;">
                ${contributionHistory.map(contrib => {
          const isWithdrawal = contrib.type === 'withdrawal';
          const displayAmount = isWithdrawal ?
            Math.abs(contrib.originalAmount) :
            contrib.originalAmount;
          const displayCurrency = contrib.originalCurrency;

          let convertedAmount = null;
          let showConversion = false;

          if (!isWithdrawal && displayCurrency !== saving.currency) {
            convertedAmount = convertDynamic(displayAmount, displayCurrency, saving.currency);
            showConversion = true;
          }

          return `
                    <div class="list-item" style="padding: 12px; margin-bottom: 8px;">
                      <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                          <strong style="color: ${isWithdrawal ? 'var(--danger)' : 'var(--success)'};">
                            ${isWithdrawal ? '📤' : '📥'} ${this.ui.formatCurrency(displayAmount)} ${displayCurrency}
                          </strong>
                          <span style="font-size: 11px; color: var(--text-secondary);">
                            ${new Date(contrib.date).toLocaleDateString('es-AR')}
                          </span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                          <div>${contrib.description}</div>
                          <div>${contrib.walletName || 'Sin wallet'} • ${contrib.userName}</div>
                          ${showConversion ? `
                            <div style="font-size: 11px; color: var(--primary); margin-top: 4px; padding: 4px 8px; background: rgba(79, 70, 229, 0.1); border-radius: 4px; display: inline-block;">
                              ≈ ${this.ui.formatCurrency(convertedAmount)} ${saving.currency} (cotización actual)
                            </div>
                          ` : ''}
                        </div>
                      </div>
                      ${!isWithdrawal ? `
                        <button class="btn-icon" 
                                onclick="app.ui.modals.withdrawContribution('${saving.id}', '${contrib.id}')" 
                                title="Devolver este aporte">
                          ↩️
                        </button>
                      ` : ''}
                    </div>
                  `;
        }).join('')}
              </div>
              
            </div>
          ` : ''}
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('savings-form-custom').onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = isEdit ? 'Actualizando...' : 'Guardando...';

        const savingData = {
          name: formData.get('name'),
          goalAmount: parseFloat(formData.get('goalAmount')),
          currency: formData.get('currency'),
          deadline: formData.get('deadline') || null,
          description: formData.get('description') || ''
        };

        if (!savingData.name || savingData.name.trim().length < 2) {
          throw new Error('El nombre debe tener al menos 2 caracteres');
        }

        if (!savingData.goalAmount || savingData.goalAmount <= 0) {
          throw new Error('La meta debe ser mayor a 0');
        }

        if (isEdit) {
          await this.app.savings.update(saving.id, savingData);
        } else {
          await this.app.savings.create(savingData);
        }

        document.getElementById('savings-modal-custom').remove();
        this.ui.showToast(`Objetivo ${isEdit ? 'actualizado' : 'creado'}`, 'success');

        await this.reloadAllViews();

      } catch (error) {
        console.error('Error guardando ahorro:', error);
        this.ui.showToast('Error: ' + error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    };
  }


  // ========================================
  // ✅ FUNCIÓN 2: withdrawContribution() CORREGIDA
  // Ubicación: js/ui/modals.js línea ~500
  // Reemplazar la función existente por esta
  // ========================================

  async withdrawContribution(savingId, contributionId) {
    try {
      const wallets = await this.app.walletManager.getAll();

      if (wallets.length === 0) {
        this.ui.showToast('No hay wallets disponibles', 'error');
        return;
      }

      // Obtener info del aporte
      const saving = await this.app.savings.getById(savingId);
      const history = await this.app.savings.getContributionHistory(savingId);
      const contribution = history.find(c => c.id === contributionId);

      if (!contribution) {
        this.ui.showToast('Aporte no encontrado', 'error');
        return;
      }

      const confirmed = await this.showConfirm(
        'Devolver Aporte',
        `¿Devolver este aporte?\n\n` +
        `Monto: ${this.ui.formatCurrency(contribution.originalAmount)} ${contribution.originalCurrency}\n` +
        `Se restará del ahorro: ${this.ui.formatCurrency(contribution.amountInSavingCurrency)} ${contribution.savingCurrency}\n\n` +
        `Selecciona la wallet de destino:`
      );

      if (!confirmed) return;

      // Modal para seleccionar wallet
      const html = `
      <div class="modal active" id="withdraw-modal">
        <div class="modal-content small">
          <h3 style="margin-bottom: 16px;">💰 Devolver Aporte</h3>
          
          <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
            <div style="margin-bottom: 4px;">
              <strong>Monto original:</strong> ${this.ui.formatCurrency(contribution.originalAmount)} ${contribution.originalCurrency}
            </div>
            <div style="color: var(--text-secondary); font-size: 11px;">
              ${contribution.originalCurrency !== contribution.savingCurrency ?
          `Se restará del ahorro: ${this.ui.formatCurrency(contribution.amountInSavingCurrency)} ${contribution.savingCurrency}` :
          'Se restará del ahorro el mismo monto'
        }
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Wallet Destino</label>
            <select class="form-select" id="wallet-destination" required>
              <option value="">Seleccionar wallet...</option>
              ${wallets.map(w => {
          const isOriginal = w.id === contribution.walletId;
          return `
                  <option value="${w.id}" ${isOriginal ? 'selected' : ''}>
                    ${w.name} (${w.currency || 'ARS'})${isOriginal ? ' ⭐ ORIGINAL' : ''}
                  </option>
                `;
        }).join('')}
            </select>
            <small style="color: var(--text-secondary); font-size: 11px; margin-top: 4px; display: block;">
              ${contribution.walletId ?
          '⭐ Se seleccionó la wallet original del aporte' :
          'Selecciona la wallet donde devolver el dinero'
        }
            </small>
          </div>
          
          <div style="display: flex; gap: 12px; margin-top: 20px;">
            <button class="btn btn-primary" id="confirm-withdraw" style="flex: 1;">Devolver</button>
            <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
          </div>
        </div>
      </div>
    `;

      document.body.insertAdjacentHTML('beforeend', html);

      // ✅ CRÍTICO: Usar arrow function para mantener contexto
      const confirmBtn = document.getElementById('confirm-withdraw');
      confirmBtn.onclick = async () => {
        const walletId = document.getElementById('wallet-destination').value;

        if (!walletId) {
          this.ui.showToast('Selecciona una wallet', 'error');
          return;
        }

        const originalText = confirmBtn.textContent;

        try {
          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Procesando...';

          // ✅ withdrawContribution ya maneja la conversión
          const result = await this.app.savings.withdrawContribution(
            savingId,
            contributionId,
            walletId,
            this.app.currencyManager
          );

          // Agregar a la wallet
          await this.app.walletManager.updateBalance(
            walletId,
            result.withdrawnAmount,
            'add'
          );

          // Crear transacción de registro
          const transactions = await this.app.storage.getTransactions();
          const user = this.app.auth.getCurrentUser();

          transactions.push({
            id: `tx_${Date.now()}_return`,
            userId: user.id,
            userName: user.name,
            type: 'income',
            amount: result.withdrawnAmount,
            currency: result.withdrawnCurrency,
            category: 'Ahorro',
            subcategory: saving.name,
            description: `Devolución de aporte a ${saving.name}`,
            date: new Date().toISOString(),
            paymentMethod: 'Ahorro',
            walletId: walletId,
            savingId: savingId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          await this.app.storage.saveTransactions(transactions);

          // Cerrar modales
          document.getElementById('withdraw-modal').remove();
          document.getElementById('savings-modal-custom')?.remove();

          this.ui.showToast(
            `✅ Aporte devuelto: ${this.ui.formatCurrency(result.withdrawnAmount)} ${result.withdrawnCurrency}`,
            'success'
          );

          await this.reloadAllViews();

        } catch (error) {
          console.error('❌ Error en retiro:', error);
          this.ui.showToast('Error: ' + error.message, 'error');
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = originalText;
        }
      };

    } catch (error) {
      console.error('❌ Error abriendo modal de retiro:', error);
      this.ui.showToast('Error: ' + error.message, 'error');
    }
  }


  // ✅ Actualizar también el método addToSaving en ui-manager.js para usar el nuevo sistema

  // REEMPLAZAR el método addToSaving existente por este:
  async addToSaving(id) {
    try {
      const saving = await this.app.savings.getById(id);
      const wallets = await this.app.walletManager.getAll();

      if (wallets.length === 0) {
        this.ui.showToast('No tienes wallets disponibles', 'error');
        return;
      }

      const remainingToGoal = saving.goalAmount - saving.currentAmount;

      if (remainingToGoal <= 0) {
        this.ui.showToast('Este objetivo ya alcanzó su meta', 'success');
        return;
      }

      const html = `
      <div class="modal active" id="add-saving-modal">
        <div class="modal-content">
          <h2 style="margin-bottom: 20px;">💰 Agregar a Ahorro</h2>
          <form id="add-saving-form">
            <p style="margin-bottom: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px;">
              <strong>${saving.name}</strong><br>
              <span style="color: var(--text-secondary); font-size: 14px;">
                Meta: ${this.ui.formatCurrency(saving.goalAmount)} ${saving.currency || 'ARS'}<br>
                Ahorrado: ${this.ui.formatCurrency(saving.currentAmount)}<br>
                Falta: ${this.ui.formatCurrency(remainingToGoal)}
              </span>
            </p>
            
            <div class="form-group">
              <label class="form-label">Desde Billetera</label>
              <select class="form-select" name="walletId" id="saving-wallet" required>
                <option value="">Seleccionar billetera</option>
                ${wallets.map(w => `
                  <option value="${w.id}" data-balance="${w.currentBalance}" data-currency="${w.currency || 'ARS'}">
                    ${w.name} - ${this.ui.formatCurrency(w.currentBalance)} ${w.currency || 'ARS'}
                  </option>
                `).join('')}
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label">Monto a Agregar</label>
              <input type="number" class="form-input" name="amount" 
                     step="0.01" min="0.01" required>
              <small style="color: var(--text-secondary); font-size: 11px;" id="wallet-balance-info">
                Selecciona una billetera
              </small>
            </div>
            
            <div class="form-group">
              <label class="form-label">Descripción (opcional)</label>
              <input type="text" class="form-input" name="description" 
                     placeholder="Ej: Aporte mensual enero">
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 20px;">
              <button type="submit" class="btn btn-primary" style="flex: 1;">💰 Agregar</button>
              <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    `;

      document.body.insertAdjacentHTML('beforeend', html);

      document.getElementById('saving-wallet').addEventListener('change', (e) => {
        const selected = e.target.options[e.target.selectedIndex];
        const balance = parseFloat(selected.dataset.balance) || 0;
        const currency = selected.dataset.currency || 'ARS';
        document.getElementById('wallet-balance-info').textContent =
          `Saldo disponible: ${this.ui.formatCurrency(balance)} ${currency}`;
      });

      document.getElementById('add-saving-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const walletId = formData.get('walletId');
        const amount = parseFloat(formData.get('amount'));
        const description = formData.get('description') || 'Aporte al ahorro';

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Procesando...';

          if (!walletId) {
            throw new Error('Debes seleccionar una billetera');
          }

          if (!amount || amount <= 0) {
            throw new Error('El monto debe ser mayor a 0');
          }

          const wallet = await this.app.walletManager.getById(walletId);

          const savingCurrency = saving.currency || 'ARS';
          const walletCurrency = wallet.currency || 'ARS';

          // ✅ CRÍTICO: Convertir ANTES de validar saldo
          let amountInSavingCurrency = amount;
          if (walletCurrency !== savingCurrency) {
            amountInSavingCurrency = await this.app.currencyManager.convertAmount(
              amount,
              walletCurrency,
              savingCurrency
            );
          }

          // ✅ CORREGIDO: Validar saldo en la moneda de la wallet
          if (wallet.currentBalance < amount) {
            throw new Error(`Saldo insuficiente en la billetera. Disponible: ${this.ui.formatCurrency(wallet.currentBalance)} ${walletCurrency}`);
          }

          // ✅ Validar que no exceda la meta (en moneda del ahorro)
          if (amountInSavingCurrency > remainingToGoal) {
            throw new Error(`No puedes exceder la meta. Máximo: ${this.ui.formatCurrency(remainingToGoal)} ${savingCurrency}`);
          }

          // ✅ Usar addContribution() con walletId
          const result = await this.app.savings.addContribution(
            id,
            amountInSavingCurrency,
            walletId,
            description
          );

          // Descontar de wallet (en su moneda original)
          await this.app.walletManager.updateBalance(walletId, amount, 'subtract');

          // Crear transacción de registro
          const transactions = await this.app.storage.getTransactions();
          const user = this.app.auth.getCurrentUser();

          transactions.push({
            id: `tx_${Date.now()}_saving`,
            userId: user.id,
            userName: user.name,
            type: 'expense',
            amount: amount,
            currency: walletCurrency,
            category: 'Ahorro',
            subcategory: saving.name,
            description: description,
            date: new Date().toISOString(),
            paymentMethod: 'Ahorro',
            walletId: walletId,
            savingId: id, // ✅ Vincular con ahorro
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          await this.app.storage.saveTransactions(transactions);

          document.getElementById('add-saving-modal').remove();
          this.ui.showToast(`✅ ${this.ui.formatCurrency(amountInSavingCurrency)} ${savingCurrency} agregados a "${saving.name}"`, 'success');

          // Recargar vistas
          await this.reloadAllViews();

        } catch (error) {
          console.error('❌ Error en addToSaving:', error);
          this.ui.showToast('Error: ' + error.message, 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      };

    } catch (error) {
      console.error('❌ Error abriendo modal addToSaving:', error);
      this.ui.showToast('Error: ' + error.message, 'error');
    }
  }

  // ========================================
  // ✅ WALLET MODAL CORREGIDO
  // ========================================
  showWalletModal(wallet = null) {
    const isEdit = !!wallet;
    const html = `
      <div class="modal active" id="wallet-modal-custom">
        <div class="modal-content">
          <h2 style="margin-bottom: 20px;">${isEdit ? 'Editar' : 'Nueva'} Caja/Billetera</h2>
          <form id="wallet-form-custom">
            <input type="hidden" name="id" value="${isEdit ? wallet.id : ''}">
            
            <div class="form-group">
              <label class="form-label">Nombre</label>
              <input type="text" class="form-input" name="name" 
                     value="${isEdit ? wallet.name : ''}" 
                     placeholder="Ej: Efectivo, Banco Galicia, Mercado Pago" required>
            </div>
            
            <div class="form-row">
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Tipo</label>
                <select class="form-select" name="type" required>
                  <option value="Efectivo" ${isEdit && wallet.type === 'Efectivo' ? 'selected' : ''}>Efectivo</option>
                  <option value="Banco" ${isEdit && wallet.type === 'Banco' ? 'selected' : ''}>Cuenta Bancaria</option>
                  <option value="Billetera Virtual" ${isEdit && wallet.type === 'Billetera Virtual' ? 'selected' : ''}>Billetera Virtual</option>
                  <option value="Caja Física" ${isEdit && wallet.type === 'Caja Física' ? 'selected' : ''}>Caja Física</option>
                  <option value="Acciones" ${isEdit && wallet.type === 'Acciones' ? 'selected' : ''}>Acciones/Inversiones</option>
                  <option value="Otro" ${isEdit && wallet.type === 'Otro' ? 'selected' : ''}>Otro</option>
                </select>
              </div>
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Moneda</label>
                <select class="form-select" name="currency" required>
                  <option value="ARS" ${isEdit && wallet.currency === 'ARS' ? 'selected' : ''}>ARS ($)</option>
                  <option value="USD" ${isEdit && wallet.currency === 'USD' ? 'selected' : ''}>USD (US$)</option>
                  <option value="EUR" ${isEdit && wallet.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                </select>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">${isEdit ? 'Saldo Actual' : 'Saldo Inicial'}</label>
              <input type="number" class="form-input" name="initialBalance" 
                     step="0.01" min="0" 
                     value="${isEdit ? wallet.currentBalance : '0'}" required>
              <small style="color: var(--text-secondary); font-size: 11px;">
                ${isEdit ? 'Saldo actual de la caja/billetera' : 'Saldo inicial al crear la caja'}
              </small>
            </div>
            
            <div class="form-group">
              <label class="form-label">Descripción (opcional)</label>
              <textarea class="form-input" name="description" 
                        placeholder="Descripción o notas sobre esta caja" 
                        rows="3">${isEdit ? wallet.description || '' : ''}</textarea>
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 20px;">
              <button type="submit" class="btn btn-primary" style="flex: 1;">
                ${isEdit ? 'Actualizar' : 'Guardar'}
              </button>
              <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('wallet-form-custom').onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = isEdit ? 'Actualizando...' : 'Guardando...';

        const walletData = {
          name: formData.get('name'),
          type: formData.get('type'),
          currency: formData.get('currency'),
          initialBalance: parseFloat(formData.get('initialBalance')),
          description: formData.get('description') || ''
        };

        // ✅ BUG #13 CORREGIDO: Validaciones
        if (!walletData.name || walletData.name.trim().length < 2) {
          throw new Error('El nombre debe tener al menos 2 caracteres');
        }

        if (walletData.initialBalance < 0) {
          throw new Error('El saldo no puede ser negativo');
        }

        if (isEdit) {
          await this.app.walletManager.update(wallet.id, walletData);
        } else {
          await this.app.walletManager.create(walletData);
        }

        document.getElementById('wallet-modal-custom').remove();
        this.ui.showToast(`Caja ${isEdit ? 'actualizada' : 'creada'}`, 'success');

        await this.reloadAllViews();

      } catch (error) {
        this.ui.showToast('Error: ' + error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    };
  }

  // ========================================
  // ✅ TRANSFER MODAL CORREGIDO
  // ========================================
  showTransferModal() {
    this.app.walletManager.getAll().then(wallets => {
      if (wallets.length < 2) {
        this.ui.showToast('Necesitas al menos 2 cajas para realizar transferencias', 'error');
        return;
      }

      const html = `
        <div class="modal active" id="transfer-modal-custom">
          <div class="modal-content">
            <h2 style="margin-bottom: 20px;">💸 Transferir entre Cajas</h2>
            <form id="transfer-form-custom">
              <div class="form-group">
                <label class="form-label">Desde Caja</label>
                <select class="form-select" name="fromWalletId" id="from-wallet-select" required>
                  <option value="">Seleccionar caja origen</option>
                  ${wallets.map(w => `<option value="${w.id}" data-balance="${w.currentBalance}" data-currency="${w.currency || 'ARS'}">${w.name} (${this.ui.formatCurrency(w.currentBalance)} ${w.currency || 'ARS'})</option>`).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label class="form-label">Hacia Caja</label>
                <select class="form-select" name="toWalletId" id="to-wallet-select" required>
                  <option value="">Seleccionar caja destino</option>
                </select>
              </div>
              
              <div class="form-group">
                <label class="form-label">Monto a Transferir</label>
                <input type="number" class="form-input" name="amount" step="0.01" min="0.01" required>
                <small style="color: var(--text-secondary); font-size: 11px;" id="from-wallet-balance-info">
                  Selecciona una caja origen
                </small>
              </div>
              
              <div class="form-group">
                <label class="form-label">Descripción (opcional)</label>
                <input type="text" class="form-input" name="description" placeholder="Ej: Transferencia mensual">
              </div>
              
              <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button type="submit" class="btn btn-success" style="flex: 1;">Transferir</button>
                <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', html);

      const fromSelect = document.getElementById('from-wallet-select');
      const toSelect = document.getElementById('to-wallet-select');
      const balanceInfo = document.getElementById('from-wallet-balance-info');

      // ✅ BUG #14 CORREGIDO: Listener para cambio de wallet origen
      fromSelect.addEventListener('change', (e) => {
        const fromId = e.target.value;
        const selectedOption = e.target.options[e.target.selectedIndex];
        const balance = parseFloat(selectedOption.dataset.balance) || 0;
        const currency = selectedOption.dataset.currency || 'ARS';

        if (fromId) {
          balanceInfo.textContent = `Saldo disponible: ${this.ui.formatCurrency(balance)} ${currency}`;

          // Filtrar wallets disponibles (excluir la seleccionada)
          const availableWallets = wallets.filter(w => w.id !== fromId);

          toSelect.innerHTML = '<option value="">Seleccionar caja destino</option>' +
            availableWallets.map(w => `<option value="${w.id}">${w.name} (${w.currency || 'ARS'})</option>`).join('');
        } else {
          balanceInfo.textContent = 'Selecciona una caja origen';
          toSelect.innerHTML = '<option value="">Seleccionar caja destino</option>';
        }
      });

      const transferForm = document.getElementById('transfer-form-custom');
      if (transferForm) {
        transferForm.onsubmit = async (e) => {
          e.preventDefault();

          const submitBtn = e.target.querySelector('button[type="submit"]');
          const originalText = submitBtn.textContent;

          try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Transfiriendo...';

            const formData = new FormData(e.target);
            const fromWalletId = formData.get('fromWalletId');
            const toWalletId = formData.get('toWalletId');
            const amount = parseFloat(formData.get('amount'));
            const description = formData.get('description');

            // ✅ BUG #15 CORREGIDO: Validaciones antes de transferir
            if (!fromWalletId || !toWalletId) {
              throw new Error('Debes seleccionar ambas cajas');
            }

            if (fromWalletId === toWalletId) {
              throw new Error('No puedes transferir a la misma caja');
            }

            if (!amount || amount <= 0) {
              throw new Error('El monto debe ser mayor a 0');
            }

            // Verificar saldo disponible
            const fromWallet = wallets.find(w => w.id === fromWalletId);
            if (fromWallet.currentBalance < amount) {
              throw new Error(`Saldo insuficiente. Disponible: ${this.ui.formatCurrency(fromWallet.currentBalance)}`);
            }

            await this.app.transferBetweenWallets(fromWalletId, toWalletId, amount, description);

            document.getElementById('transfer-modal-custom').remove();
            this.ui.showToast('✅ Transferencia realizada correctamente', 'success');

            await this.reloadAllViews();

          } catch (error) {
            console.error('Transfer error:', error);
            this.ui.showToast('Error: ' + error.message, 'error');
          } finally {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = originalText;
            }
          }
        };
      }
    });
  }

  // ========================================
  // ✅ USER MODAL CORREGIDO
  // ========================================
  async showUserModal(user = null) {
    const isEdit = !!user;

    // Cargar preguntas de seguridad
    const securityQuestions = [
      "¿Cuál es el nombre de tu primera mascota?",
      "¿En qué ciudad naciste?",
      "¿Cuál es el nombre de soltera de tu madre?",
      "¿Cuál fue el nombre de tu primera escuela?"
    ];

    const modalHTML = `
      <div class="modal active" id="user-modal">
        <div class="modal-content">
          <h2 style="margin-bottom: 20px;">${isEdit ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
          <form id="user-form">
            <input type="hidden" id="user-id" value="${isEdit ? user.id : ''}">
            
            <div class="form-group">
              <label class="form-label">Nombre Completo</label>
              <input type="text" class="form-input" id="user-name" value="${isEdit ? user.name : ''}" required>
              <span class="field-error" id="user-name-error"></span>
            </div>

            <div class="form-group">
              <label class="form-label">Nombre de Usuario</label>
              <input type="text" class="form-input" id="user-username" value="${isEdit ? user.username : ''}" required ${isEdit ? 'readonly style="background: var(--bg-tertiary); cursor: not-allowed;"' : ''}>
              <span class="field-error" id="user-username-error"></span>
            </div>

            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" class="form-input" id="user-email" value="${isEdit && user.email ? user.email : ''}" required placeholder="usuario@ejemplo.com">
              <span class="field-error" id="user-email-error"></span>
            </div>

            <div class="form-group">
              <label class="form-label">${isEdit ? 'Nueva Contraseña (dejar vacío para mantener)' : 'Contraseña'}</label>
              <input type="password" class="form-input" id="user-password" ${!isEdit ? 'required' : ''} placeholder="Mínimo 6 caracteres" autocomplete="new-password">
              <span class="field-error" id="user-password-error"></span>
            </div>

            <div class="form-group">
              <label class="form-label">Pregunta de Seguridad</label>
              <select class="form-select" id="user-security-question" required>
                <option value="">Selecciona una pregunta</option>
                ${securityQuestions.map(q => `
                  <option value="${q}" ${isEdit && user.securityQuestion === q ? 'selected' : ''}>${q}</option>
                `).join('')}
              </select>
              <span class="field-error" id="user-security-question-error"></span>
              <small style="color: var(--text-secondary); font-size: 11px; margin-top: 4px; display: block;">
                Necesaria para recuperar contraseña
              </small>
            </div>

            <div class="form-group">
              <label class="form-label">${isEdit ? 'Nueva Respuesta de Seguridad (dejar vacío para mantener)' : 'Respuesta de Seguridad'}</label>
              <input type="text" class="form-input" id="user-security-answer" ${!isEdit ? 'required' : ''} placeholder="Tu respuesta">
              <span class="field-error" id="user-security-answer-error"></span>
              <small style="color: var(--text-secondary); font-size: 11px; margin-top: 4px; display: block;">
                Recuerda tu respuesta exacta (no distingue mayúsculas)
              </small>
            </div>

            <div class="form-group">
              <label class="form-label">Rol</label>
              <select class="form-select" id="user-role" required ${isEdit && user.id === 'admin' ? 'disabled' : ''}>
                <option value="user" ${isEdit && user.role === 'user' ? 'selected' : ''}>Usuario</option>
                <option value="admin" ${isEdit && user.role === 'admin' ? 'selected' : ''}>Administrador</option>
              </select>
            </div>

            <div style="display: flex; gap: 12px; margin-top: 20px;">
              <button type="submit" class="btn btn-primary" style="flex: 1;">
                ${isEdit ? 'Actualizar' : 'Guardar Usuario'}
              </button>
              <button type="button" class="btn btn-secondary" id="cancel-user-btn">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('user-modal');
    const form = document.getElementById('user-form');

    // Validación en tiempo real
    const inputs = ['user-name', 'user-username', 'user-email', 'user-password', 'user-security-answer'];
    inputs.forEach(inputId => {
      const input = document.getElementById(inputId);
      input?.addEventListener('input', () => this.validateUserField(input));
    });

    // Submit del formulario
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const userId = document.getElementById('user-id').value;
      const name = document.getElementById('user-name').value.trim();
      const username = document.getElementById('user-username').value.trim();
      const email = document.getElementById('user-email').value.trim();
      const password = document.getElementById('user-password').value;
      const role = document.getElementById('user-role').value;
      const securityQuestion = document.getElementById('user-security-question').value;
      const securityAnswer = document.getElementById('user-security-answer').value.trim();

      // Validaciones
      if (!isEdit && (!securityQuestion || !securityAnswer)) {
        this.app.ui.showToast('Debes configurar una pregunta de seguridad', 'error');
        return;
      }

      try {
        if (isEdit) {
          const updates = { name, email, role };
          if (password) updates.password = password;
          if (securityQuestion) updates.securityQuestion = securityQuestion;
          if (securityAnswer) updates.securityAnswer = securityAnswer;

          await this.app.users.update(userId, updates);
          this.app.ui.showToast('Usuario actualizado', 'success');
        } else {
          await this.app.users.create({
            name,
            username,
            password,
            role,
            email,
            securityQuestion,
            securityAnswer
          });
          this.app.ui.showToast('Usuario creado correctamente', 'success');
        }

        modal.remove();
        await this.app.ui.loadSettings();
      } catch (error) {
        console.error('Error guardando usuario:', error);
        this.app.ui.showToast(error.message, 'error');
      }
    });

    // Cancelar
    document.getElementById('cancel-user-btn').addEventListener('click', () => {
      modal.remove();
    });
  }

  validateUserField(input) {
    const value = input.value.trim();
    const id = input.id;
    const errorEl = document.getElementById(`${id}-error`);

    input.classList.remove('valid', 'invalid');
    if (errorEl) errorEl.textContent = '';

    if (!value && id !== 'user-password' && id !== 'user-security-answer') {
      input.classList.add('invalid');
      if (errorEl) errorEl.textContent = 'Campo requerido';
      return false;
    }

    if (id === 'user-email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        input.classList.add('invalid');
        if (errorEl) errorEl.textContent = 'Email inválido';
        return false;
      }
    }

    if (id === 'user-password' && value && value.length < 6) {
      input.classList.add('invalid');
      if (errorEl) errorEl.textContent = 'Mínimo 6 caracteres';
      return false;
    }

    if (id === 'user-username' && value.length < 3) {
      input.classList.add('invalid');
      if (errorEl) errorEl.textContent = 'Mínimo 3 caracteres';
      return false;
    }

    if (id === 'user-security-answer' && value && value.length < 2) {
      input.classList.add('invalid');
      if (errorEl) errorEl.textContent = 'Mínimo 2 caracteres';
      return false;
    }

    if (value) {
      input.classList.add('valid');
    }
    return true;
  }

  // ============================================
  // ELIMINAR FUNCIÓN: sendVerificationEmail()
  // ============================================

  validateUserField(input) {
    const value = input.value.trim();
    const id = input.id;
    const errorEl = document.getElementById(`${id}-error`);

    input.classList.remove('valid', 'invalid');
    if (errorEl) errorEl.textContent = '';

    if (!value) {
      if (id !== 'user-password') { // Password puede estar vacío en edición
        input.classList.add('invalid');
        if (errorEl) errorEl.textContent = 'Campo requerido';
        return false;
      }
    }

    if (id === 'user-email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        input.classList.add('invalid');
        if (errorEl) errorEl.textContent = 'Email inválido';
        return false;
      }
    }

    if (id === 'user-password' && value && value.length < 6) {
      input.classList.add('invalid');
      if (errorEl) errorEl.textContent = 'Mínimo 6 caracteres';
      return false;
    }

    if (id === 'user-username' && value.length < 3) {
      input.classList.add('invalid');
      if (errorEl) errorEl.textContent = 'Mínimo 3 caracteres';
      return false;
    }

    input.classList.add('valid');
    return true;
  }

  // ========================================
  // ✅ CARD MODAL CORREGIDO
  // ========================================
  showCardModal(card = null) {
    const isEdit = !!card;

    // Obtener wallets disponibles
    this.app.walletManager.getAll().then(wallets => {
      const html = `
        <div class="modal active" id="card-modal">
          <div class="modal-content">
            <h2 style="margin-bottom: 20px;">${isEdit ? 'Editar' : 'Nueva'} Tarjeta</h2>
            <form id="card-form">
              <input type="hidden" name="id" value="${isEdit ? card.id : ''}">
              
              <div class="form-group">
                <label class="form-label">Nombre de la Tarjeta</label>
                <input type="text" class="form-input" name="name" 
                      value="${isEdit ? card.name : ''}" 
                      placeholder="Ej: Visa Gold, Mastercard Black" required>
              </div>
              
              <div class="form-row">
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Tipo</label>
                  <select class="form-select" name="type" id="card-type" required>
                    <option value="Débito" ${isEdit && card.type === 'Débito' ? 'selected' : ''}>Débito</option>
                    <option value="Crédito" ${isEdit && card.type === 'Crédito' ? 'selected' : ''}>Crédito</option>
                  </select>
                </div>
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Moneda</label>
                  <select class="form-select" name="currency" required>
                    <option value="ARS" ${isEdit && card.currency === 'ARS' ? 'selected' : ''}>ARS ($)</option>
                    <option value="USD" ${isEdit && card.currency === 'USD' ? 'selected' : ''}>USD (US$)</option>
                    <option value="EUR" ${isEdit && card.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                  </select>
                </div>
              </div>
              
              <div class="form-group" id="wallet-group">
                <label class="form-label">Wallet/Caja Asociada</label>
                <select class="form-select" name="walletId" id="card-wallet">
                  <option value="">Sin wallet asociada</option>
                  ${wallets.map(w => `
                    <option value="${w.id}" ${isEdit && card.walletId === w.id ? 'selected' : ''}>
                      ${w.name} (${w.currency || 'ARS'}) - ${this.ui.formatCurrency(w.currentBalance)}
                    </option>
                  `).join('')}
                </select>
                <small style="color: var(--text-secondary); font-size: 11px; margin-top: 4px; display: block;">
                  Si es Débito: descuenta directamente de la wallet<br>
                  Si es Crédito: registra cuotas pero descuenta de la wallet mes a mes
                </small>
              </div>
              
              <div class="form-group" id="due-day-group">
                <label class="form-label">Día de Vencimiento (solo Crédito)</label>
                <input type="number" class="form-input" name="dueDay" 
                      min="1" max="31" value="${isEdit ? (card.dueDay || 10) : 10}">
                <small style="color: var(--text-secondary); font-size: 11px;">
                  Día del mes en que vence la tarjeta de crédito (1-31)
                </small>
              </div>
              
              <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button type="submit" class="btn btn-success" style="flex: 1;">
                  ${isEdit ? 'Actualizar' : 'Guardar'}
                </button>
                <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', html);

      // ✅ Toggle campo de vencimiento según tipo
      const cardTypeSelect = document.getElementById('card-type');
      const dueDayGroup = document.getElementById('due-day-group');

      const toggleDueDay = () => {
        if (cardTypeSelect.value === 'Crédito') {
          dueDayGroup.style.display = 'block';
        } else {
          dueDayGroup.style.display = 'none';
        }
      };

      toggleDueDay();
      cardTypeSelect.addEventListener('change', toggleDueDay);

      // ✅ Submit form
      document.getElementById('card-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = isEdit ? 'Actualizando...' : 'Guardando...';

          const cardData = {
            id: formData.get('id') || `card_${Date.now()}`,
            name: formData.get('name').trim(),
            type: formData.get('type'),
            currency: formData.get('currency'),
            walletId: formData.get('walletId') || null,
            dueDay: formData.get('type') === 'Crédito' ? parseInt(formData.get('dueDay')) : null
          };

          // Validaciones
          if (!cardData.name || cardData.name.length < 2) {
            throw new Error('El nombre debe tener al menos 2 caracteres');
          }

          if (cardData.dueDay && (cardData.dueDay < 1 || cardData.dueDay > 31)) {
            throw new Error('El día de vencimiento debe estar entre 1 y 31');
          }

          const cards = await this.app.storage.getCards();

          if (isEdit) {
            // Actualizar
            const index = cards.findIndex(c => c.id === cardData.id);
            if (index === -1) throw new Error('Tarjeta no encontrada');
            cards[index] = { ...cards[index], ...cardData, updatedAt: new Date().toISOString() };
          } else {
            // Crear nueva
            const exists = cards.find(c => c.name.toLowerCase() === cardData.name.toLowerCase());
            if (exists) throw new Error('Ya existe una tarjeta con ese nombre');

            cardData.createdAt = new Date().toISOString();
            cardData.updatedAt = new Date().toISOString();
            cards.push(cardData);
          }

          await this.app.storage.saveCards(cards);

          document.getElementById('card-modal').remove();
          this.ui.showToast(`Tarjeta ${isEdit ? 'actualizada' : 'agregada'}`, 'success');

          await this.ui.loadSettings();

        } catch (error) {
          this.ui.showToast('Error: ' + error.message, 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      };
    });
  }

  // ========================================
  // ✅ CATEGORY MODALS CORREGIDOS
  // ========================================
  showAddCategoryModal(type) {
    const typeLabel = type === 'income' ? 'Ingreso' : 'Gasto';
    const html = `
      <div class="modal active" id="category-modal">
        <div class="modal-content">
          <h2 style="margin-bottom: 20px;">Nueva Categoría de ${typeLabel}</h2>
          <form id="category-form">
            <div class="form-group">
              <label class="form-label">Nombre de Categoría</label>
              <input type="text" class="form-input" name="name" placeholder="Ej: Educación" required>
            </div>
            
            <div class="form-group">
              <label class="form-label">Subcategorías (opcional)</label>
              <input type="text" class="form-input" name="subs" placeholder="Separadas por comas: Libros, Cursos, Útiles">
              <small style="color: var(--text-secondary); font-size: 11px;">
                Puedes dejar en blanco si no necesitas subcategorías
              </small>
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 20px;">
              <button type="submit" class="btn btn-primary" style="flex: 1;">Guardar</button>
              <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('category-form').onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      try {
        const name = formData.get('name').trim();
        const subsRaw = formData.get('subs').trim();
        const subs = subsRaw ? subsRaw.split(',').map(s => s.trim()).filter(s => s) : [];

        // ✅ BUG #18 CORREGIDO: Validar nombre de categoría
        if (!name || name.length < 2) {
          throw new Error('El nombre debe tener al menos 2 caracteres');
        }

        await this.addCategory(type, name, subs);
        document.getElementById('category-modal').remove();

      } catch (error) {
        this.ui.showToast('Error: ' + error.message, 'error');
      }
    };
  }

  showEditCategoryModal(type, oldName) {
    const typeLabel = type === 'income' ? 'Ingreso' : 'Gasto';

    this.app.storage.getCategories().then(categories => {
      const category = categories[type].find(c => c.name === oldName);
      if (!category) return;

      const html = `
        <div class="modal active" id="edit-category-modal">
          <div class="modal-content">
            <h2 style="margin-bottom: 20px;">Editar Categoría de ${typeLabel}</h2>
            <form id="edit-category-form">
              <div class="form-group">
                <label class="form-label">Nombre de Categoría</label>
                <input type="text" class="form-input" name="name" value="${category.name}" required>
              </div>
              
              <div class="form-group">
                <label class="form-label">Subcategorías</label>
                <input type="text" class="form-input" name="subs" 
                      value="${category.subs ? category.subs.join(', ') : ''}" 
                      placeholder="Separadas por comas">
              </div>
              
              <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button type="submit" class="btn btn-primary" style="flex: 1;">Actualizar</button>
                <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', html);

      document.getElementById('edit-category-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const newName = formData.get('name').trim();
          const subsRaw = formData.get('subs').trim();
          const newSubs = subsRaw ? subsRaw.split(',').map(s => s.trim()).filter(s => s) : [];

          if (!newName || newName.length < 2) {
            throw new Error('El nombre debe tener al menos 2 caracteres');
          }

          await this.updateCategory(type, oldName, newName, newSubs);
          document.getElementById('edit-category-modal').remove();

        } catch (error) {
          this.ui.showToast('Error: ' + error.message, 'error');
        }
      };
    });
  }

  async addCategory(type, name, subs) {
    try {
      const categories = await this.app.storage.getCategories();

      const exists = categories[type].find(c => c.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        throw new Error('Ya existe una categoría con ese nombre');
      }

      categories[type].push({ name, subs });
      await this.app.storage.saveCategories(categories);

      this.ui.showToast('Categoría agregada', 'success');
      await this.ui.loadSettings();

    } catch (error) {
      throw error;
    }
  }

  async updateCategory(type, oldName, newName, newSubs) {
    try {
      const categories = await this.app.storage.getCategories();
      const index = categories[type].findIndex(c => c.name === oldName);

      if (index === -1) {
        throw new Error('Categoría no encontrada');
      }

      if (oldName !== newName) {
        const exists = categories[type].find(c => c.name.toLowerCase() === newName.toLowerCase());
        if (exists) {
          throw new Error('Ya existe una categoría con ese nombre');
        }
      }

      categories[type][index] = { name: newName, subs: newSubs };
      await this.app.storage.saveCategories(categories);

      this.ui.showToast('Categoría actualizada', 'success');
      await this.ui.loadSettings();

    } catch (error) {
      throw error;
    }
  }

  // ========================================
  // ✅ DIALOGS CORREGIDOS
  // ========================================
  showConfirm(title, message) {
    return new Promise((resolve) => {
      const html = `
        <div class="modal active" id="custom-confirm">
          <div class="modal-content custom-dialog">
            <h3>${title}</h3>
            <p style="white-space: pre-line;">${message}</p>
            <div class="dialog-buttons">
              <button class="btn btn-primary" id="confirm-ok">Aceptar</button>
              <button class="btn btn-secondary" id="confirm-cancel">Cancelar</button>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', html);

      document.getElementById('confirm-ok').onclick = () => {
        document.getElementById('custom-confirm').remove();
        resolve(true);
      };

      document.getElementById('confirm-cancel').onclick = () => {
        document.getElementById('custom-confirm').remove();
        resolve(false);
      };
    });
  }

  showAlert(title, message) {
    const html = `
      <div class="modal active" id="custom-alert">
        <div class="modal-content custom-dialog">
          <h3>${title}</h3>
          <p style="white-space: pre-line;">${message}</p>
          <div class="dialog-buttons">
            <button class="btn btn-primary" onclick="document.getElementById('custom-alert').remove()">Aceptar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  }

  closeAllModals() {
    document.querySelectorAll('.modal.active').forEach(modal => {
      modal.classList.remove('active');
      setTimeout(() => {
        if (modal.parentNode) {
          modal.remove();
        }
      }, 300);
    });
  }
}