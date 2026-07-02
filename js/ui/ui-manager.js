// js/ui/ui-manager.js - VERSIÓN LIMPIA Y OPTIMIZADA
import { ModalManager } from './modals.js';
import { ChartManager } from './charts.js';
import { FormManager } from './forms.js';
import { CurrencySettingsManager } from './currency-settings.js';
import { logger } from '../utils/logger.js';

export class UIManager {
  constructor(app) {
    this.app = app;
    this.charts = {};
    this.currentView = 'dashboard';
    this.modals = new ModalManager(this);
    this.chartManager = new ChartManager(this);

    // Paginación de transacciones
    this.currentPage = 1;
    this.pageSize = 30;
    this.filteredTransactions = [];
    
    // Configuración compartida
    this.PERIOD_LABELS = {
      'weekly': 'Semanal',
      'monthly': 'Mensual',
      'quarterly': 'Trimestral',
      'semiannual': 'Semestral',
      'yearly': 'Anual'
    };

    this.forms = new FormManager(this);
    this.currencySettings = new CurrencySettingsManager(this);
  }


  async init() {
    const sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (sidebarCollapsed) {
      document.querySelector('.app-container').classList.add('sidebar-collapsed');
    }

    this.setupEventListeners();
    await this.loadDashboard();
    
    // ✅ NUEVO: Mostrar versión global en el UI
    this.updateVersionDisplay();

    // ✅ NUEVO: Verificar límites de almacenamiento al iniciar
    this.checkStorageOnInit();
  }
  
  // ✅ NUEVO: Método para inyectar la versión en el DOM
  updateVersionDisplay() {
    const versionElements = document.querySelectorAll('.app-version-text');
    versionElements.forEach(el => {
      const prefix = el.getAttribute('data-prefix') || '';
      el.textContent = `${prefix}${this.app.version}`;
    });
  }

  // ✅ NUEVO: Verificar storage al iniciar
  async checkStorageOnInit() {
    try {
      const storageAlert = await this.app.storage.getStorageAlert();
      if (storageAlert.show) {
        if (storageAlert.level === 'critical') {
          this.modals.showAlert('⚠️ Almacenamiento Crítico', storageAlert.message);
        } else if (storageAlert.level === 'warning') {
          this.showToast(storageAlert.message.split('\n')[0], 'warning');
        }
      }
    } catch (error) {
      console.error('Error verificando storage:', error);
    }
  }

  setupEventListeners() {
    // Navegación
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.target.closest('[data-nav]').dataset.nav;
        this.navigateTo(view);
      });
    });

    // Botones principales
    this.setupButton('new-transaction-btn', () => this.modals.showTransactionModal());
    this.setupButton('new-budget-btn', () => this.modals.showBudgetModal());
    this.setupButton('pending-payments-link', () => this.navigateTo('pending-payments')); this.setupButton('new-savings-btn', () => this.modals.showSavingsModal());
    this.setupButton('new-wallet-btn', () => this.modals.showWalletModal());
    this.setupButton('transfer-wallet-btn', () => this.modals.showTransferModal());
    this.setupButton('logout-btn', () => this.app.logout());
    this.setupButton('sidebar-toggle', () => this.toggleSidebar());

    // Configuración
    this.setupButton('currency-settings-btn', () => this.currencySettings.showCurrencySettings());
    this.setupButton('new-user-btn', () => this.modals.showUserModal());
    this.setupButton('new-card-btn', () => this.modals.showCardModal());

    // Reports
    this.setupButton('create-backup-btn', () => this.exportBackup());
    this.setupButton('import-backup-btn', () => this.importBackup());
    this.setupButton('export-json-btn', () => this.exportTransactionsJSON());
    this.setupButton('export-excel-btn', () => this.exportToExcel());
    this.setupButton('clear-data-btn', () => this.clearAllData());

    // Dashboard - Selector de período
    const dashboardPeriod = document.getElementById('dashboard-period');
    if (dashboardPeriod) {
      dashboardPeriod.addEventListener('change', (e) => {
        const value = e.target.value;

        // Ocultar todos los selectores adicionales
        document.getElementById('month-year-selector').style.display = 'none';
        document.getElementById('year-only-selector').style.display = 'none';
        document.getElementById('custom-range-selector').style.display = 'none';
        document.getElementById('apply-custom-filter').style.display = 'none';

        // Mostrar el selector correspondiente
        if (value === 'specific-month') {
          document.getElementById('month-year-selector').style.display = 'flex';
          document.getElementById('apply-custom-filter').style.display = 'block';

          // Establecer valores por defecto (mes y año actual)
          const now = new Date();
          document.getElementById('specific-month').value = now.getMonth();
          document.getElementById('specific-year-input').value = now.getFullYear();

        } else if (value === 'specific-year') {
          document.getElementById('year-only-selector').style.display = 'block';
          document.getElementById('apply-custom-filter').style.display = 'block';

          // Establecer año actual por defecto
          const now = new Date();
          document.getElementById('year-only-input').value = now.getFullYear();

        } else if (value === 'custom-range') {
          document.getElementById('custom-range-selector').style.display = 'flex';
          document.getElementById('apply-custom-filter').style.display = 'block';

          // Establecer fechas por defecto (mes actual)
          const now = new Date();
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
          const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

          document.getElementById('custom-start-date').value = firstDay.toISOString().split('T')[0];
          document.getElementById('custom-end-date').value = lastDay.toISOString().split('T')[0];

        } else {
          // Períodos predefinidos (week, month, quarter, year)
          this.loadDashboard(value);
        }
      });
    }

    // Botón aplicar filtro personalizado
    const applyCustomFilter = document.getElementById('apply-custom-filter');
    if (applyCustomFilter) {
      applyCustomFilter.addEventListener('click', () => {
        const periodType = document.getElementById('dashboard-period').value;

        if (periodType === 'specific-month') {
          const month = parseInt(document.getElementById('specific-month').value);
          const year = parseInt(document.getElementById('specific-year-input').value);

          if (!year || year < 2020 || year > 2099) {
            this.showToast('Por favor ingresa un año válido', 'error');
            return;
          }

          this.loadDashboard({ type: 'specific-month', month, year });

        } else if (periodType === 'specific-year') {
          const year = parseInt(document.getElementById('year-only-input').value);

          if (!year || year < 2020 || year > 2099) {
            this.showToast('Por favor ingresa un año válido', 'error');
            return;
          }

          this.loadDashboard({ type: 'specific-year', year });

        } else if (periodType === 'custom-range') {
          const startDate = document.getElementById('custom-start-date').value;
          const endDate = document.getElementById('custom-end-date').value;

          if (!startDate || !endDate) {
            this.showToast('Por favor selecciona ambas fechas', 'error');
            return;
          }

          if (new Date(startDate) > new Date(endDate)) {
            this.showToast('La fecha inicial debe ser anterior a la fecha final', 'error');
            return;
          }

          this.loadDashboard({ type: 'custom-range', startDate, endDate });
        }
      });
    }

    // Botón nuevo préstamo
    const newLoanBtn = document.getElementById('new-loan-btn');
    if (newLoanBtn) {
      newLoanBtn.addEventListener('click', () => this.showLoanModal());
    }

    // Tabs de préstamos
    const loanTabs = document.querySelectorAll('[id^="loans-tab-"]');
    loanTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabType = e.target.dataset.tab;
        this.filterLoans(tabType);

        // Actualizar estado activo de tabs
        loanTabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    // Checkboxes de gráficos
    ['show-income', 'show-expenses', 'show-balance'].forEach(id => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          this.chartManager.updateMetricsChart(this.currentDashboardPeriod);
        });
      }
    });

    // Filtros de transacciones - Tipo
    const txTypeFilter = document.getElementById('tx-filter-type');
    if (txTypeFilter) {
      txTypeFilter.addEventListener('change', async (e) => {
        const type = e.target.value;

        if (type) {
          const categories = await this.app.storage.getCategories();
          const select = document.getElementById('tx-filter-category');

          if (select) {
            const cats = type === 'income' ? categories.income : categories.expense;
            const currentValue = select.value;

            select.innerHTML = '<option value="">Todas las categorías</option>' +
              cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

            if (currentValue && cats.find(c => c.name === currentValue)) {
              select.value = currentValue;
            }
          }
        } else {
          await this.loadCategoriesFilter();
        }

        // Limpiar subcategorías
        document.getElementById('tx-filter-subcategory').innerHTML = '<option value="">Todas las subcategorías</option>';

        this.currentPage = 1;
        this.filterTransactions();
      });
    }

    // Filtros de transacciones - Categoría
    const txCategoryFilter = document.getElementById('tx-filter-category');
    if (txCategoryFilter) {
      txCategoryFilter.addEventListener('change', async (e) => {
        const category = e.target.value;
        const subcategorySelect = document.getElementById('tx-filter-subcategory');

        if (category) {
          try {
            const categories = await this.app.storage.getCategories();
            const allCategories = [...(categories.income || []), ...(categories.expense || [])];

            // Buscar TODAS las categorías que coincidan con el nombre (puede haber en Ingresos y Gastos)
            const matchingCategories = allCategories.filter(c => c.name.trim() === category.trim());

            // Combinar todas las subcategorías de las coincidencias (soportar 'subcategories' y 'subs')
            const allSubcategories = matchingCategories.flatMap(c => c.subcategories || c.subs || []);
            const uniqueSubcategories = [...new Set(allSubcategories)].sort();

            if (uniqueSubcategories.length > 0) {
              const options = uniqueSubcategories
                .map(sub => `<option value="${sub}">${sub}</option>`)
                .join('');

              subcategorySelect.innerHTML = '<option value="">Todas las subcategorías</option>' + options;
              subcategorySelect.disabled = false;
            } else {
              subcategorySelect.innerHTML = '<option value="">Sin subcategorías</option>';
              subcategorySelect.disabled = true;
            }
          } catch (err) {
            console.error('Error cargando subcategorías:', err);
            subcategorySelect.innerHTML = '<option value="">Error carga</option>';
          }
        } else {
          subcategorySelect.innerHTML = '<option value="">Todas las subcategorías</option>';
          subcategorySelect.disabled = false; // Permitir seleccionar "Todas" aunque no haya categoría
        }

        this.currentPage = 1;
        this.filterTransactions();
      });
    }

    // Filtros de transacciones - Período
    const txPeriodFilter = document.getElementById('tx-filter-period');
    if (txPeriodFilter) {
      txPeriodFilter.addEventListener('change', (e) => {
        const customRange = document.getElementById('tx-custom-date-range');

        if (e.target.value === 'custom') {
          customRange.style.display = 'grid';

          // Establecer fechas por defecto (mes actual)
          const now = new Date();
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
          const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

          document.getElementById('tx-filter-start-date').value = firstDay.toISOString().split('T')[0];
          document.getElementById('tx-filter-end-date').value = lastDay.toISOString().split('T')[0];
        } else {
          customRange.style.display = 'none';
        }

        // ✅ RECALCULAR ALTURA DEL ACORDEÓN
        const accordionContent = customRange.closest('.accordion-content');
        if (accordionContent && accordionContent.parentElement.classList.contains('active')) {
          accordionContent.style.maxHeight = accordionContent.scrollHeight + 'px';
        }

        this.currentPage = 1;
        this.filterTransactions();
      });
    }

    // Filtros de transacciones - Otros
    let filterTimeout;
    const filterIds = [
      'tx-search',
      'tx-filter-subcategory',
      'tx-filter-user',
      'tx-filter-payment',
      'tx-filter-start-date',
      'tx-filter-end-date'
    ];

    filterIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener(element.tagName === 'SELECT' ? 'change' : 'input', () => {
          clearTimeout(filterTimeout);
          filterTimeout = setTimeout(() => {
            this.currentPage = 1;
            this.filterTransactions();
          }, 300);
        });
      }
    });

    // Botón limpiar filtros
    const clearFiltersBtn = document.getElementById('tx-clear-filters');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        this.clearTransactionFilters();
      });
    }

    // Paginación - Tamaño de página (ambos selectores)
    const pageSizeControls = document.querySelectorAll('.tx-page-size-control');
    pageSizeControls.forEach(select => {
      select.addEventListener('change', (e) => {
        const newSize = parseInt(e.target.value);
        this.pageSize = newSize;
        this.currentPage = 1;

        // Sincronizar ambos selectores
        pageSizeControls.forEach(ctrl => {
          ctrl.value = newSize;
        });

        this.renderTransactionList(this.filteredTransactions);
      });
    });

    // Paginación - Botones Primera Página
    const firstPageBtns = document.querySelectorAll('.tx-first-page');
    firstPageBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentPage = 1;
        this.renderTransactionList(this.filteredTransactions);
      });
    });

    // Paginación - Botones Página Anterior
    const prevPageBtns = document.querySelectorAll('.tx-prev-page');
    prevPageBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.renderTransactionList(this.filteredTransactions);
        }
      });
    });

    // Paginación - Botones Página Siguiente
    const nextPageBtns = document.querySelectorAll('.tx-next-page');
    nextPageBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const totalPages = Math.ceil(this.filteredTransactions.length / this.pageSize);
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.renderTransactionList(this.filteredTransactions);
        }
      });
    });

    // Paginación - Botones Última Página
    const lastPageBtns = document.querySelectorAll('.tx-last-page');
    lastPageBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const totalPages = Math.ceil(this.filteredTransactions.length / this.pageSize);
        this.currentPage = totalPages || 1;
        this.renderTransactionList(this.filteredTransactions);
      });
    });

    // Gráfico de tendencias - Checkboxes
    const txChartCheckboxes = ['tx-chart-show-income', 'tx-chart-show-expenses', 'tx-chart-show-balance'];
    txChartCheckboxes.forEach(id => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          this.renderTransactionsTrendChart(this.filteredTransactions);
        });
      }
    });

    // Acordeones
    document.querySelectorAll('[data-accordion]').forEach(header => {
      header.addEventListener('click', (e) => {
        this.toggleAccordion(e.target.closest('.accordion-header'));
      });
    });


    // ✅ NUEVO: Preview de archivo seleccionado en importación
    const importFileInput = document.getElementById('import-file');
    if (importFileInput) {
      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const preview = document.getElementById('file-preview');

        if (file) {
          document.getElementById('file-name').textContent = file.name;
          document.getElementById('file-size').textContent = (file.size / 1024).toFixed(2) + ' KB';
          preview.style.display = 'block';
        } else {
          preview.style.display = 'none';
        }
      });
    }

  }

  setupButton(id, handler) {
    const button = document.getElementById(id);
    if (button) {
      button.addEventListener('click', handler);
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const username = formData.get('username');
    const password = formData.get('password');

    try {
      const result = await this.app.auth.login(username, password);

      if (result.success) {
        document.getElementById('login-screen').classList.remove('active');
        await this.init();
        this.showToast('Bienvenido ' + this.app.auth.getCurrentUser().name, 'success');
      } else {
        this.showToast(result.message || 'Usuario o contraseña incorrectos', 'error');
      }
    } catch (error) {
      this.showToast('Error al iniciar sesión: ' + error.message, 'error');
    }
  }

  navigateTo(view) {
    this.currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    const viewElement = document.getElementById(`${view}-view`);
    if (viewElement) {
      viewElement.classList.add('active');
    }

    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === view);
    });

    // ✅ SOLUCIÓN: Scroll al inicio del contenedor principal
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }

    this.loadView(view);
  }

  async loadView(view) {
    try {
      switch (view) {
        case 'dashboard':
          await this.loadDashboard();
          break;
        case 'transactions':
          await this.loadTransactions();
          break;
        case 'budgets':
          await this.loadBudgets();
          break;
        case 'savings':
          await this.loadSavings();
          break;
        case 'loans':
          await this.loadLoans();
          break;
        case 'wallets':
          await this.loadWallets();
          break;
        case 'settings':
          await this.loadSettings();
          break;
        case 'reports':
          await this.updateSystemStats();
          break;
        case 'pending-payments':
          await this.loadPendingPayments();
          break;
      }
    } catch (error) {
      console.error(`Error loading view ${view}:`, error);
      this.showToast(`Error cargando ${view}: ${error.message}`, 'error');
    }
  }

  async loadDashboard(period = 'month') {
    try {
      this.currentDashboardPeriod = period;

      const dates = this.app.getPeriodDates(period);

      const [report, savings, wallets, rates] = await Promise.all([
        this.app.analytics.generateReport(dates.start, dates.end),
        this.app.savings.getAll(),
        this.app.walletManager.getAll(),
        this.app.currencyManager.getExchangeRates()
      ]);

      // Actualizar cotizaciones
      document.getElementById('usd-rate').textContent = rates.USD?.toFixed(2) || '---';
      document.getElementById('eur-rate').textContent = rates.EUR?.toFixed(2) || '---';

      // Card 1: Finanzas
      document.getElementById('total-income').textContent = this.formatCurrency(report.summary.totalIncome);
      document.getElementById('total-expenses').textContent = this.formatCurrency(report.summary.totalExpenses);

      const balanceElement = document.getElementById('net-balance');
      balanceElement.textContent = this.formatCurrency(report.summary.netBalance);

      balanceElement.classList.remove('positive', 'negative');
      if (report.summary.netBalance >= 0) {
        balanceElement.classList.add('positive');
      } else {
        balanceElement.classList.add('negative');
      }

      // Comparativa mes anterior
      try {
        const comparison = await this.app.analytics.getPreviousMonthComparison();

        if (comparison) {
          this.updateComparisonBadge('income-comparison', comparison.income.change, false);
          this.updateComparisonBadge('expenses-comparison', comparison.expenses.change, true);
          this.updateComparisonBadge('balance-comparison', comparison.balance.change, false);
        }
      } catch (error) {
        this.clearComparisonBadges();
      }

      // Card 2: Resumen de Cajas
      await this.renderWalletsSummaryCard(wallets);

      // Card 3: Alertas de Presupuestos
      const utilizations = await this.app.budgets.getAllUtilizations();
      this.renderBudgetAlerts(utilizations);

      // Alertas de tarjetas (se agregan a la card de alertas)
      try {
        const paymentReminders = await this.app.installmentsManager.getPaymentReminders();

        const remindersContainer = document.getElementById('budget-alerts-summary');
        if (remindersContainer) {
          // Eliminar alertas de tarjetas previas antes de insertar nuevas
          const existingReminders = remindersContainer.querySelectorAll('[data-reminder-alert]');
          existingReminders.forEach(el => el.remove());

          if (paymentReminders.length > 0) {
            const remindersHTML = paymentReminders.map(reminder => `
              <div data-reminder-alert style="display: flex; flex-direction: column; gap: 4px; padding: 12px; background: ${reminder.priority === 'high' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; border-radius: 8px; border-left: 3px solid ${reminder.priority === 'high' ? 'var(--danger)' : 'var(--warning)'}; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 13px; color: ${reminder.priority === 'high' ? 'var(--danger)' : 'var(--warning)'}; font-weight: 600;">
                    ${reminder.priority === 'high' ? '🔴' : '🟡'} ${reminder.message}
                  </span>
                </div>
              </div>
            `).join('');

            remindersContainer.insertAdjacentHTML('afterbegin', remindersHTML);
          }
        }
      } catch (error) {
        console.error('Error cargando recordatorios de pago:', error);
      }

      // Card 4: Préstamos
      try {
        const loansSummary = await this.app.loansManager.getSummary();
        document.getElementById('dashboard-loans-lent').textContent = this.formatCurrency(loansSummary.lent.totalPending);
        document.getElementById('dashboard-loans-lent-count').textContent = loansSummary.lent.count;
        document.getElementById('dashboard-loans-borrowed').textContent = this.formatCurrency(loansSummary.borrowed.totalPending);
        document.getElementById('dashboard-loans-borrowed-count').textContent = loansSummary.borrowed.count;
        document.getElementById('dashboard-loans-net').textContent = this.formatCurrency(loansSummary.netBalance);
      } catch (error) {
        console.warn('Error cargando resumen de préstamos:', error);
      }

      // Card 5: Ahorros
      try {
        const totalSavings = savings.reduce((sum, s) => sum + s.currentAmount, 0);
        const avgProgress = savings.length > 0
          ? (savings.reduce((sum, s) => sum + (s.currentAmount / s.goalAmount * 100), 0) / savings.length).toFixed(1)
          : 0;

        document.getElementById('dashboard-savings-total').textContent = this.formatCurrency(totalSavings);
        document.getElementById('dashboard-savings-count').textContent = savings.length;
        document.getElementById('dashboard-savings-progress').textContent = avgProgress + '%';
      } catch (error) {
        console.warn('Error cargando resumen de ahorros:', error);
      }

      // Card 6: Transacciones Recientes (últimas 5)
      try {
        const allTransactions = await this.app.transactions.getAll();

        const recentTx = allTransactions
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 5);

        const recentContainer = document.getElementById('recent-transactions-card');

        if (!recentContainer) {
          console.error('❌ No se encontró el contenedor recent-transactions-card');
          return;
        }

        if (recentTx.length === 0) {
          recentContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary); font-size: 13px;">Sin transacciones</div>';
        } else {
          recentContainer.innerHTML = recentTx.map(tx => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid var(--border-color);">
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${tx.category}</div>
                <div style="font-size: 10px; color: var(--text-secondary);">${this.formatDate(tx.date)}</div>
              </div>
              <div style="font-size: 13px; font-weight: 700; color: var(--${tx.type === 'income' ? 'success' : 'danger'}); white-space: nowrap; margin-left: 8px;">
                ${tx.type === 'income' ? '+' : '-'}${this.formatCurrency(tx.amount)}
              </div>
            </div>
          `).join('');
        }
      } catch (error) {
        console.error('❌ Error cargando transacciones recientes:', error);
      }

      // Indicadores Clave
      this.renderRankingGastos(report.categories);

      try {
        const burnRate = await this.app.analytics.calculateBurnRate();
        this.renderBurnRate(burnRate);
      } catch (error) {
        console.warn('Error calculando burn rate:', error);
      }

      try {
        const prediction = await this.app.analytics.predictEndOfMonth();
        this.renderPrediction(prediction);
      } catch (error) {
        console.warn('Error calculando predicción:', error);
      }

      // Gráficos
      this.chartManager.renderIncomeChart(report.categories);
      this.chartManager.renderCategoryChart(report.categories);
      await this.chartManager.renderMetricsChart(period);

    } catch (error) {
      console.error('Error loading dashboard:', error);
      this.showToast('Error cargando dashboard: ' + error.message, 'error');
    }
  }

  updateComparisonBadge(elementId, change, inverse = false) {
    const element = document.getElementById(elementId);
    if (!element) return;

    let className;
    if (inverse) {
      className = change < -5 ? 'positive' : change > 5 ? 'negative' : 'neutral';
    } else {
      className = change > 5 ? 'positive' : change < -5 ? 'negative' : 'neutral';
    }

    element.className = `comparison-badge ${className}`;
    element.textContent = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  }

  clearComparisonBadges() {
    ['income-comparison', 'expenses-comparison', 'balance-comparison'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = '';
    });
  }

  async renderWalletsSummaryCard(wallets) {
    const container = document.getElementById('wallets-summary-card');
    if (!container) return;

    if (wallets.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Sin cajas configuradas</p>';
      return;
    }

    const byCurrency = {};
    const byType = {};

    // ✅ NUEVO: Calcular efectivo total en ARS con conversión
    let totalEfectivoARS = 0;

    for (const wallet of wallets) {
      const currency = wallet.currency || 'ARS';

      // Agrupar por moneda
      if (!byCurrency[currency]) byCurrency[currency] = 0;
      byCurrency[currency] += wallet.currentBalance;

      // Agrupar por tipo (sin conversión)
      if (!byType[wallet.type]) byType[wallet.type] = 0;
      byType[wallet.type] += wallet.currentBalance;

      // ✅ Si es tipo "Efectivo", convertir a ARS y sumar
      if (wallet.type === 'Efectivo') {
        let amountInARS = wallet.currentBalance;

        if (currency !== 'ARS') {
          amountInARS = await this.app.currencyManager.convertAmount(
            wallet.currentBalance,
            currency,
            'ARS'
          );
        }

        totalEfectivoARS += amountInARS;
      }
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        
        <div>
          <div class="stats-label" style="margin-bottom: 8px;">POR MONEDA</div>
          ${Object.entries(byCurrency).map(([currency, amount]) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
              <span style="font-weight: 600; color: var(--text-secondary);">${currency}</span>
              <strong>${this.formatCurrency(amount)}</strong>
            </div>
          `).join('')}
        </div>
        
        <div>
          <div class="stats-label" style="margin-bottom: 8px;">RESUMEN EFECTIVO</div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0;">
            <span style="font-size: 13px; color: var(--text-secondary);">Total (ARS Equiv.)</span>
            <span style="font-size: 13px; font-weight: 600;">${this.formatCurrency(totalEfectivoARS)}</span>
          </div>
          <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px; opacity: 0.7;">
            Suma de cajas de tipo "Efectivo" convertidas a pesos locales
          </div>
        </div>
        
        <div style="border-top: 2px solid var(--border-color); padding-top: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; color: var(--text-secondary);">TOTAL CAJAS</span>
            <strong style="font-size: 18px; color: var(--primary);">${wallets.length}</strong>
          </div>
        </div>
      </div>
    `;
  }

  renderBudgetAlerts(utilizations) {
    const okList = [];
    const warningList = [];
    const dangerList = [];

    utilizations.forEach(util => {
      const budgetName = util.subcategory ?
        `${util.category} - ${util.subcategory}` :
        util.category;

      if (util.alertLevel === 'ok') {
        okList.push(budgetName);
      } else if (util.alertLevel === 'warning') {
        warningList.push(budgetName);
      } else if (util.alertLevel === 'danger' || util.alertLevel === 'exceeded') {
        dangerList.push(budgetName);
      }
    });

    document.getElementById('alerts-ok-count').textContent = okList.length;
    document.getElementById('alerts-warning-count').textContent = warningList.length;
    document.getElementById('alerts-danger-count').textContent = dangerList.length;

    document.getElementById('alerts-ok-list').innerHTML = okList.length > 0 ?
      okList.map(name => `• ${name}`).join('<br>') :
      'Sin presupuestos en esta categoría';

    document.getElementById('alerts-warning-list').innerHTML = warningList.length > 0 ?
      warningList.map(name => `• ${name}`).join('<br>') :
      'Sin presupuestos en esta categoría';

    document.getElementById('alerts-danger-list').innerHTML = dangerList.length > 0 ?
      dangerList.map(name => `• ${name}`).join('<br>') :
      'Sin presupuestos en esta categoría';
  }

  async updateSystemStats() {
    try {
      const stats = await this.app.getQuickStats();
      if (!stats) return;

      // Total Balance Chart (si existe el canvas)
      if (this.chartManager && typeof this.chartManager.renderMetricsChart === 'function') {
        await this.chartManager.renderMetricsChart('year');
      }

      // Actualizar contadores si existen en la vista reportes
      const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      if (stats.counts) {
        setText('system-tx-count', stats.counts.transactions);
        setText('system-budgets-count', stats.counts.budgets);
        setText('system-wallets-count', stats.counts.wallets);
      }

      // Actualizar fecha del último backup
      const lastBackupDate = localStorage.getItem('lastBackupDate');
      const lastBackupEl = document.getElementById('last-backup-date');

      if (lastBackupEl) {
        if (lastBackupDate) {
          const date = new Date(lastBackupDate);
          lastBackupEl.textContent = `${date.toLocaleDateString('es-AR')} a las ${date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
          lastBackupEl.textContent = 'Nunca';
        }
      }

      // ✅ NUEVO: Actualizar indicador de almacenamiento
      try {
        const size = await this.app.storage.getStorageSize();
        const percentageEl = document.getElementById('storage-percentage');
        const usedEl = document.getElementById('storage-used');
        const limitEl = document.getElementById('storage-limit');
        const progressBar = document.getElementById('storage-progress');

        if (percentageEl) percentageEl.textContent = size.percentage + '%';
        if (usedEl) usedEl.textContent = size.usedFormatted;
        if (limitEl) limitEl.textContent = size.limitFormatted;

        if (progressBar) {
          progressBar.style.width = Math.min(100, size.percentage) + '%';

          // Cambiar color según nivel
          if (size.percentage > 90) {
            progressBar.style.background = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
            document.getElementById('storage-indicator').style.borderLeftColor = 'var(--danger)';
          } else if (size.percentage > 80) {
            progressBar.style.background = 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
            document.getElementById('storage-indicator').style.borderLeftColor = 'var(--warning)';
          } else {
            progressBar.style.background = 'linear-gradient(90deg, #10b981 0%, #059669 100%)';
            document.getElementById('storage-indicator').style.borderLeftColor = 'var(--primary)';
          }
        }
      } catch (error) {
        console.error('Error actualizando indicador de storage:', error);
      }

    } catch (error) {
      console.error('Error updating system stats:', error);
    }
  }

  renderRankingGastos(categories) {
    const container = document.getElementById('ranking-container');
    if (!container) return;

    // ✅ FILTRAR transferencias y ahorros (no son gastos/ingresos reales)
    const topExpenses = categories
      .filter(cat =>
        cat.type === 'expense' &&
        cat.category !== 'Transferencia' &&
        cat.category !== 'Ahorro'
      )
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    const topIncomes = categories
      .filter(cat =>
        cat.type === 'income' &&
        cat.category !== 'Transferencia' &&
        cat.category !== 'Ahorro'
      )
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    if (topExpenses.length === 0 && topIncomes.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Sin datos en el período</p>';
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${topExpenses.length > 0 ? `
          <div>
            <div style="font-size: 11px; font-weight: 600; color: var(--danger); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
              📉 Mayores Gastos
            </div>
            ${topExpenses.map((cat, index) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(239, 68, 68, 0.1);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 16px;">${['🥇', '🥈', '🥉'][index]}</span>
                  <span style="font-size: 13px; font-weight: 500;">${cat.category}</span>
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 700; font-size: 13px; color: var(--danger);">${this.formatCurrency(cat.total)}</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">${cat.percentage}%</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        ${topIncomes.length > 0 ? `
          <div>
            <div style="font-size: 11px; font-weight: 600; color: var(--success); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
              📈 Mayores Ingresos
            </div>
            ${topIncomes.map((cat, index) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(16, 185, 129, 0.1);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 16px;">${['🥇', '🥈', '🥉'][index]}</span>
                  <span style="font-size: 13px; font-weight: 500;">${cat.category}</span>
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 700; font-size: 13px; color: var(--success);">${this.formatCurrency(cat.total)}</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">${cat.percentage}%</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  renderBurnRate(burnRate) {
    const container = document.getElementById('burn-rate-container');
    if (!container) return;

    if (!burnRate) {
      container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No disponible</p>';
      return;
    }

    const statusEmoji = {
      'ok': '🟢',
      'warning': '🟡',
      'danger': '🔴'
    };

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; color: var(--text-secondary);">Promedio diario:</span>
          <strong>${this.formatCurrency(burnRate.avgDailyExpense)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; color: var(--text-secondary);">Balance actual:</span>
          <strong style="color: ${burnRate.netBalance >= 0 ? 'var(--success)' : 'var(--danger)'}">${this.formatCurrency(burnRate.netBalance)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--border-color);">
          <span style="font-weight: 600; color: var(--text-secondary);">Días que dura tu dinero:</span>
          <strong style="display: flex; align-items: center; gap: 6px;">
            ${burnRate.daysUntilZero > 90 ? '90+' : burnRate.daysUntilZero} días
            <span style="font-size: 16px;">${statusEmoji[burnRate.status]}</span>
          </strong>
        </div>
        
        <div style="margin-top: 8px; margin-bottom: 8px; padding: 8px; background: rgba(79, 70, 229, 0.05); border-radius: 6px; font-size: 10px; color: var(--text-secondary); line-height: 1.4;">
          📊 <strong>Cálculo:</strong><br>
          • Promedio diario = Total gastado (${this.formatCurrency(burnRate.totalExpenses)}) ÷ ${burnRate.daysElapsed} días<br>
          • Balance = Ingresos (${this.formatCurrency(burnRate.totalIncome)}) - Gastos<br>
          • Días restantes = Balance ÷ Promedio diario<br>
          <em>Indica cuántos días durarás con el dinero actual al ritmo de gasto promedio.</em>
        
          <strong>Indicadores:</strong><br>
          🟢 <strong>OK:</strong> +15 días de autonomía<br>
          🟡 <strong>Precaución:</strong> 8-15 días restantes<br>
          🔴 <strong>Crítico:</strong> Menos de 7 días o balance negativo
              
        </div>
      </div>
    `;

    const card = container.closest('.indicator-card');
    if (card) {
      card.classList.remove('status-ok', 'status-warning', 'status-danger');
      card.classList.add(`status-${burnRate.status}`);
    }
  }

  renderPrediction(prediction) {
    const container = document.getElementById('prediction-container');
    if (!container) return;

    if (!prediction) {
      container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No disponible</p>';
      return;
    }

    const statusEmoji = {
      'ok': '✅',
      'warning': '⚠️',
      'danger': '🔴'
    };

    const confidenceText = {
      'high': 'Alta confianza',
      'medium': 'Confianza media',
      'low': 'Confianza baja'
    };

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; color: var(--text-secondary);">Ingresos proyectados:</span>
          <strong>${this.formatCurrency(prediction.projectedIncome)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; color: var(--text-secondary);">Gastos proyectados:</span>
          <strong>${this.formatCurrency(prediction.projectedExpenses)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--border-color);">
          <span style="font-weight: 600; color: var(--text-secondary);">Balance proyectado:</span>
          <strong style="display: flex; align-items: center; gap: 6px; color: ${prediction.projectedBalance >= 0 ? 'var(--success)' : 'var(--danger)'}">
            ${this.formatCurrency(prediction.projectedBalance)}
            <span style="font-size: 16px;">${statusEmoji[prediction.status]}</span>
          </strong>
        </div>
        <div style="text-align: center; font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
          ${confidenceText[prediction.confidence]} (${prediction.daysElapsed}/${prediction.daysInMonth} días)
        </div>
        
        <div style="margin-top: 8px; margin-bottom: 8px; padding: 8px; background: rgba(79, 70, 229, 0.05); border-radius: 6px; font-size: 10px; color: var(--text-secondary); line-height: 1.4;">
          📊 <strong>Cálculo:</strong><br>
          • Actual: ${this.formatCurrency(prediction.currentIncome)} ingresos - ${this.formatCurrency(prediction.currentExpenses)} gastos<br>
          • Promedio diario: ${this.formatCurrency(prediction.avgDailyIncome)}/día (ingreso) | ${this.formatCurrency(prediction.avgDailyExpense)}/día (gasto)<br>
          • Proyección: Actual + (Promedio × ${prediction.daysRemaining} días restantes)<br>
          <em>Estima cómo terminarás el mes si sigues al mismo ritmo.</em>

          <strong>Indicadores:</strong><br>
          ✅ <strong>OK:</strong> Balance proyectado positivo (>10% ingresos)<br>
          ⚠️ <strong>Ajustado:</strong> Balance bajo (0-10% ingresos)<br>
          🔴 <strong>Déficit:</strong> Balance proyectado negativo

        </div>
      </div>
    `;

    const card = container.closest('.indicator-card');
    if (card) {
      card.classList.remove('status-ok', 'status-warning', 'status-danger');
      card.classList.add(`status-${prediction.status}`);
    }
  }

  // ========================================
  // REPORTS - VERSIÓN MEJORADA
  // ========================================

  async exportBackup() {
    try {
      this.showToast('⏳ Creando backup completo...', 'info');

      const result = await this.app.exportManager.exportCompleteBackup();

      // Guardar fecha del último backup
      localStorage.setItem('lastBackupDate', new Date().toISOString());
      this.updateSystemStats();

      const message = `✅ Backup creado exitosamente\n\n` +
        `📊 Elementos incluidos:\n` +
        `• Transacciones: ${result.itemsCount.transactions}\n` +
        `• Presupuestos: ${result.itemsCount.budgets}\n` +
        `• Ahorros: ${result.itemsCount.savings}\n` +
        `• Wallets: ${result.itemsCount.wallets}\n` +
        `• Usuarios: ${result.itemsCount.users} (con contraseñas)\n` +
        `• Tarjetas: ${result.itemsCount.cards}\n\n` +
        `📁 Archivo: ${result.fileName}`;

      this.modals.showAlert('Backup Exitoso', message);

    } catch (error) {
      console.error('Error exportando backup:', error);

      let errorMessage = '❌ No se pudo crear el backup\n\n';

      if (error.message.includes('storage')) {
        errorMessage += '💾 Problema: Error de almacenamiento\n' +
          '💡 Solución: Verifica que tengas espacio disponible en tu dispositivo.';
      } else if (error.message.includes('permission')) {
        errorMessage += '🔒 Problema: Permisos insuficientes\n' +
          '💡 Solución: Permite que el navegador descargue archivos.';
      } else {
        errorMessage += `🔍 Detalle técnico: ${error.message}\n\n` +
          '💡 Solución: Intenta cerrar y abrir la aplicación, o contacta soporte.';
      }

      this.modals.showAlert('Error en Backup', errorMessage);
    }
  }

  async importBackup() {
    try {
      const fileInput = document.getElementById('import-file');

      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        this.modals.showAlert(
          'Archivo no seleccionado',
          '⚠️ Por favor selecciona un archivo de backup antes de continuar.\n\n' +
          '📁 Formatos aceptados: .json\n' +
          '📊 Origen: FinanzApp'
        );
        return;
      }

      const file = fileInput.files[0];

      if (!file.name.endsWith('.json')) {
        this.modals.showAlert(
          'Formato inválido',
          `❌ El archivo "${file.name}" no es compatible.\n\n` +
          '📁 Formato requerido: .json\n' +
          '💡 Asegúrate de seleccionar un backup exportado desde FinanzApp.'
        );
        return;
      }

      // Validar tamaño (máximo 50MB)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        this.modals.showAlert(
          'Archivo muy grande',
          `⚠️ El archivo es demasiado grande: ${(file.size / 1024 / 1024).toFixed(2)} MB\n\n` +
          `📊 Tamaño máximo: 50 MB\n` +
          `💡 Verifica que sea un backup válido de FinanzApp.`
        );
        return;
      }

      const confirmed = await this.modals.showConfirm(
        'Confirmar Importación',
        `⚠️ ADVERTENCIA IMPORTANTE\n\n` +
        `Esta acción REEMPLAZARÁ todos los datos actuales del sistema.\n\n` +
        `📁 Archivo: ${file.name}\n` +
        `📊 Tamaño: ${(file.size / 1024).toFixed(2)} KB\n\n` +
        `✅ Recomendación: Haz un backup de tus datos actuales antes de continuar.\n\n` +
        `¿Deseas proceder con la importación?`
      );

      if (!confirmed) {
        this.showToast('ℹ️ Importación cancelada', 'info');
        return;
      }

      this.showToast('⏳ Validando e importando backup...', 'info');

      const result = await this.app.exportManager.importCompleteBackup(file);

      const summary = `✅ Backup importado y validado correctamente\n\n` +
        `📊 Elementos restaurados:\n` +
        `• Transacciones: ${result.imported.transactions || 0}\n` +
        `• Presupuestos: ${result.imported.budgets || 0}\n` +
        `• Ahorros: ${result.imported.savings || 0}\n` +
        `• Wallets: ${result.imported.wallets || 0}\n` +
        `• Usuarios: ${result.imported.users || 0}\n` +
        `• Tarjetas: ${result.imported.cards || 0}\n\n` +
        `✅ Validación: Todos los datos son consistentes\n\n` +
        `🔄 La aplicación se recargará en 3 segundos...`;

      this.modals.showAlert('Importación Exitosa', summary);

      setTimeout(() => {
        location.reload();
      }, 3000);

    } catch (error) {
      console.error('Error importando backup:', error);

      let errorMessage = '❌ No se pudo importar el backup\n\n';

      if (error.message.includes('JSON')) {
        errorMessage += '📁 Problema: El archivo no es un JSON válido\n' +
          '💡 Solución: Verifica que el archivo no esté corrupto. Intenta exportar un nuevo backup.';
      } else if (error.message.includes('FinanzApp')) {
        errorMessage += '🔍 Problema: El archivo no es un backup de FinanzApp\n' +
          '💡 Solución: Asegúrate de usar un archivo exportado desde esta aplicación.';
      } else if (error.message.includes('validación')) {
        errorMessage += `🔍 Problema: Errores de validación encontrados\n\n` +
          `${error.message}\n\n` +
          `💡 Solución: El backup tiene datos inconsistentes. Usa un backup más reciente.`;
      } else if (error.message.includes('storage') || error.message.includes('almacenamiento')) {
        errorMessage += '💾 Problema: Error de almacenamiento\n' +
          '💡 Solución: Libera espacio en tu navegador o dispositivo.';
      } else {
        errorMessage += `🔍 Detalle técnico:\n${error.message}\n\n` +
          `💡 Soluciones:\n` +
          `1. Verifica que el archivo no esté corrupto\n` +
          `2. Intenta con un backup más reciente\n` +
          `3. Contacta soporte si el problema persiste`;
      }

      this.modals.showAlert('Error en Importación', errorMessage);

      const fileInput = document.getElementById('import-file');
      if (fileInput) fileInput.value = '';
    }
  }

  async exportTransactionsJSON() {
    try {
      const startDate = document.getElementById('export-start')?.value || null;
      const endDate = document.getElementById('export-end')?.value || null;

      // Validar fechas
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        this.modals.showAlert(
          'Fechas inválidas',
          '⚠️ La fecha inicial no puede ser posterior a la fecha final.\n\n' +
          '💡 Ajusta las fechas e intenta nuevamente.'
        );
        return;
      }

      this.showToast('⏳ Exportando transacciones...', 'info');

      const result = await this.app.exportManager.exportTransactionsJSON(startDate, endDate);

      const periodText = startDate && endDate
        ? `del ${this.formatDate(startDate)} al ${this.formatDate(endDate)}`
        : 'de todo el período';

      this.showToast(
        `✅ ${result.count} transacciones exportadas ${periodText}`,
        'success'
      );

    } catch (error) {
      console.error('Error exportando JSON:', error);

      let errorMessage = '❌ No se pudo exportar\n\n';

      if (error.message.includes('No se encontraron')) {
        errorMessage += '📊 Problema: No hay transacciones en el período seleccionado\n' +
          '💡 Solución: Ajusta el rango de fechas o verifica que tengas transacciones registradas.';
      } else {
        errorMessage += `🔍 Detalle: ${error.message}\n\n` +
          '💡 Solución: Intenta nuevamente o contacta soporte.';
      }

      this.modals.showAlert('Error en Exportación', errorMessage);
    }
  }

  async exportToExcel() {
    try {
      if (typeof XLSX === 'undefined') {
        this.modals.showAlert(
          'Biblioteca no disponible',
          '❌ La biblioteca de Excel no está cargada.\n\n' +
          '🔍 Problema: Error de dependencias\n' +
          '💡 Solución: Recarga la página. Si el problema persiste, verifica tu conexión a internet.'
        );
        return;
      }

      const startDate = document.getElementById('export-start')?.value || null;
      const endDate = document.getElementById('export-end')?.value || null;

      // Validar fechas
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        this.modals.showAlert(
          'Fechas inválidas',
          '⚠️ La fecha inicial no puede ser posterior a la fecha final.\n\n' +
          '💡 Ajusta las fechas e intenta nuevamente.'
        );
        return;
      }

      this.showToast('⏳ Generando archivo Excel...', 'info');

      const result = await this.app.exportManager.exportToExcel(startDate, endDate);

      const periodText = startDate && endDate
        ? `del ${this.formatDate(startDate)} al ${this.formatDate(endDate)}`
        : 'completo';

      this.showToast(
        `✅ Excel exportado correctamente (${periodText})`,
        'success'
      );

    } catch (error) {
      console.error('Error exportando Excel:', error);

      let errorMessage = '❌ No se pudo generar el Excel\n\n';

      if (error.message.includes('XLSX')) {
        errorMessage += '📊 Problema: Error en la biblioteca de Excel\n' +
          '💡 Solución: Recarga la página e intenta nuevamente.';
      } else if (error.message.includes('memoria') || error.message.includes('memory')) {
        errorMessage += '💾 Problema: Datos demasiado grandes\n' +
          '💡 Solución: Reduce el rango de fechas o exporta en JSON.';
      } else {
        errorMessage += `🔍 Detalle: ${error.message}\n\n` +
          '💡 Solución: Intenta con un rango de fechas más pequeño.';
      }

      this.modals.showAlert('Error en Excel', errorMessage);
    }
  }

  async update(userId, updates) {
    try {
      // Validar permisos
      if (!this.auth.isAdmin()) {
        throw new Error('Solo administradores pueden editar usuarios');
      }

      const users = await this.storage.getUsers();
      const userIndex = users.findIndex(u => u.id === userId);

      if (userIndex === -1) {
        throw new Error('Usuario no encontrado');
      }

      const user = users[userIndex];

      // No permitir cambiar role del admin principal
      if (user.id === 'admin' && updates.role && updates.role !== 'admin') {
        throw new Error('No se puede cambiar el rol del administrador principal');
      }

      // Si se actualiza el password, hashearlo
      if (updates.password) {
        updates.passwordHash = await bcrypt.hash(updates.password, 10);
        delete updates.password; // No guardar password en texto plano
      }

      // Si se actualiza la respuesta de seguridad, hashearla
      if (updates.securityAnswer) {
        updates.securityAnswerHash = await this.hashSecurityAnswer(updates.securityAnswer);
        delete updates.securityAnswer;
      }

      // Actualizar usuario
      users[userIndex] = {
        ...user,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await this.storage.saveUsers(users);

      // Registrar en audit log
      await this.auditLog.log('update', 'user', userId, {
        updatedFields: Object.keys(updates)
      });

      return this.sanitizeUser(users[userIndex]);

    } catch (error) {
      console.error('Error al actualizar usuario:', error);
      throw error;
    }
  }

  setExportPeriod(period) {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      case 'all':
        document.getElementById('export-start').value = '';
        document.getElementById('export-end').value = '';
        return;
    }

    document.getElementById('export-start').value = startDate.toISOString().split('T')[0];
    document.getElementById('export-end').value = endDate.toISOString().split('T')[0];
  }

  // ========================================
  // BACKUP REMINDER SYSTEM - CON NIVELES DE URGENCIA
  // ========================================

  async checkBackupReminder() {
    try {
      // Obtener fecha del último backup
      const lastBackupDate = localStorage.getItem('lastBackupDate');
      const lastBackupTxCount = parseInt(localStorage.getItem('lastBackupTxCount') || '0');

      // Obtener transacciones actuales
      const transactions = await this.app.storage.getTransactions();
      const currentTxCount = transactions.length;

      // Calcular días desde el último backup
      let daysSinceBackup = 999; // Valor alto si nunca se hizo backup
      if (lastBackupDate) {
        daysSinceBackup = Math.floor(
          (Date.now() - new Date(lastBackupDate).getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      // Calcular transacciones nuevas
      const newTransactions = currentTxCount - lastBackupTxCount;

      // Determinar nivel de urgencia
      let urgencyLevel = 'none';
      let reminderReason = '';

      if (!lastBackupDate || daysSinceBackup >= 14 || newTransactions >= 100) {
        // 🔴 CRÍTICO: Nunca hizo backup, +14 días, o +100 transacciones
        urgencyLevel = 'critical';
        if (!lastBackupDate) {
          reminderReason = 'Aún no has creado ningún backup de tus datos';
        } else if (daysSinceBackup >= 14) {
          reminderReason = `Han pasado ${daysSinceBackup} días sin hacer backup`;
        } else {
          reminderReason = `Tienes ${newTransactions} transacciones nuevas sin respaldar`;
        }
      } else if (daysSinceBackup >= 7 || newTransactions >= 50) {
        // 🟡 ADVERTENCIA: 7-13 días o 50-99 transacciones
        urgencyLevel = 'warning';
        if (daysSinceBackup >= 7) {
          reminderReason = `Han pasado ${daysSinceBackup} días desde tu último backup`;
        } else {
          reminderReason = `Tienes ${newTransactions} transacciones nuevas sin respaldar`;
        }
      } else if (daysSinceBackup >= 3 || newTransactions >= 25) {
        // 🟢 INFO: 3-6 días o 25-49 transacciones
        urgencyLevel = 'info';
        reminderReason = `Llevas ${daysSinceBackup} días sin hacer backup`;
      }

      // Verificar si debe mostrar según el nivel de urgencia
      const shouldShow = this.shouldShowBackupReminder(urgencyLevel);

      if (shouldShow && urgencyLevel !== 'none') {
        this.showBackupReminder(urgencyLevel, reminderReason, daysSinceBackup, newTransactions);
      }

    } catch (error) {
      console.error('Error verificando recordatorio de backup:', error);
    }
  }

  shouldShowBackupReminder(urgencyLevel) {
    const now = Date.now();
    const lastShown = parseInt(localStorage.getItem('lastBackupReminderTime') || '0');
    const hoursSinceLastShown = (now - lastShown) / (1000 * 60 * 60);

    switch (urgencyLevel) {
      case 'critical':
        // 🔴 CRÍTICO: Siempre mostrar (persistente)
        return true;

      case 'warning':
        // 🟡 ADVERTENCIA: Mostrar cada 4 horas
        if (hoursSinceLastShown >= 4) {
          localStorage.setItem('lastBackupReminderTime', now.toString());
          return true;
        }
        return false;

      case 'info':
        // 🟢 INFO: Mostrar una vez al día
        const today = new Date().toDateString();
        const lastReminderDate = localStorage.getItem('lastBackupReminderDate');

        if (lastReminderDate !== today) {
          localStorage.setItem('lastBackupReminderDate', today);
          localStorage.setItem('lastBackupReminderTime', now.toString());
          return true;
        }
        return false;

      default:
        return false;
    }
  }

  showBackupReminder(urgencyLevel, reason, daysSince, newTx) {
    if (urgencyLevel === 'critical') {
      // 🔴 CRÍTICO: Modal bloqueante
      this.showCriticalBackupModal(reason, daysSince, newTx);
    } else {
      // 🟡🟢 ADVERTENCIA/INFO: Toast con botones
      this.showBackupToast(urgencyLevel, reason);
    }
  }

  showCriticalBackupModal(reason, daysSince, newTx) {
    // Crear modal bloqueante personalizado
    const modalId = 'critical-backup-modal';

    // Remover modal anterior si existe
    const existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal active';
    modal.style.zIndex = '10000';

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px; border: 3px solid var(--danger);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 64px; margin-bottom: 12px;">⚠️</div>
          <h2 style="color: var(--danger); margin-bottom: 8px;">Backup Crítico Requerido</h2>
          <p style="color: var(--text-secondary); font-size: 14px;">
            ${reason}
          </p>
        </div>

        <div style="background: rgba(239, 68, 68, 0.1); border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 4px solid var(--danger);">
          <div style="font-size: 13px; line-height: 1.6; color: var(--text-primary);">
            <strong>⚠️ Riesgo de pérdida de datos:</strong><br>
            ${!daysSince || daysSince >= 14
        ? '• Sin respaldo reciente, tus datos pueden perderse en cualquier momento'
        : ''}
            ${newTx >= 100
        ? `• Tienes ${newTx} transacciones sin respaldar`
        : ''}
            <br><br>
            <strong>💡 Recomendación:</strong><br>
            Crea un backup ahora para proteger tu información financiera.
          </div>
        </div>

        <div style="display: flex; gap: 12px;">
          <button 
            class="btn btn-danger" 
            style="flex: 2;"
            onclick="window.uiManager.navigateTo('reports'); document.getElementById('${modalId}').remove();"
          >
            🔴 Ir a Crear Backup Ahora
          </button>
          <button 
            class="btn btn-secondary" 
            style="flex: 1;"
            onclick="window.uiManager.postponeCriticalBackup(); document.getElementById('${modalId}').remove();"
          >
            Posponer 1 hora
          </button>
        </div>

        <div style="text-align: center; margin-top: 16px;">
          <small style="color: var(--text-secondary); font-size: 11px;">
            Este recordatorio se mostrará hasta que crees un backup
          </small>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  postponeCriticalBackup() {
    // Posponer por 1 hora
    const oneHourLater = Date.now() + (60 * 60 * 1000);
    localStorage.setItem('lastBackupReminderTime', oneHourLater.toString());
    this.showToast('⏰ Recordatorio pospuesto por 1 hora', 'info');
  }

  showBackupToast(urgencyLevel, reason) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toastId = `backup-reminder-${Date.now()}`;
    const type = urgencyLevel === 'warning' ? 'warning' : 'info';
    const icon = urgencyLevel === 'warning' ? '⚠️' : 'ℹ️';
    const title = urgencyLevel === 'warning' ? 'Backup Recomendado' : 'Recordatorio de Backup';
    const autoCloseTime = urgencyLevel === 'warning' ? 15000 : 10000;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.id = toastId;

    toast.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">${icon}</span>
          <strong style="flex: 1;">${title}</strong>
          <button class="toast-close" onclick="uiManager.hideToast(this.closest('.toast'))">&times;</button>
        </div>
        <div style="font-size: 13px; line-height: 1.4; color: var(--text-secondary);">
          ${reason}
        </div>
        <div style="display: flex; gap: 8px; margin-top: 4px;">
          <button 
            class="btn btn-primary btn-sm" 
            style="flex: 1;"
            onclick="uiManager.navigateTo('reports'); uiManager.hideToast(this.closest('.toast'));"
          >
            Ir a Reportes
          </button>
          <button 
            class="btn btn-secondary btn-sm" 
            onclick="uiManager.hideToast(this.closest('.toast'));"
          >
            Más tarde
          </button>
        </div>
      </div>
    `;

    container.appendChild(toast);

    // Auto-ocultar
    setTimeout(() => this.hideToast(toast), autoCloseTime);
  }

  async importBackup() {
    try {
      const fileInput = document.getElementById('import-file');

      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        this.showToast('⚠️ Por favor selecciona un archivo primero', 'error');
        return;
      }

      const file = fileInput.files[0];

      if (!file.name.endsWith('.json')) {
        this.showToast('❌ Solo se permiten archivos JSON', 'error');
        return;
      }

      const confirmed = await this.modals.showConfirm(
        'Importar Backup',
        `⚠️ ADVERTENCIA: Esta acción reemplazará TODOS los datos actuales.\n\nArchivo: ${file.name}\nTamaño: ${(file.size / 1024).toFixed(2)} KB\n\n¿Deseas continuar?`
      );

      if (!confirmed) return;

      this.showToast('⏳ Importando backup...', 'info');

      const result = await this.app.exportManager.importCompleteBackup(file);

      const summary = `✅ Backup importado correctamente\n\nElementos restaurados:\n• Transacciones: ${result.imported.transactions || 0}\n• Usuarios y Cuentas: ${result.imported.users || 0}\n• Presupuestos: ${result.imported.budgets || 0}\n• Ahorros: ${result.imported.savings || 0}\n• Wallets: ${result.imported.wallets || 0}\n• Categorías: ${result.imported.categories.income + result.imported.categories.expense || 0}\n• Tarjetas: ${result.imported.cards || 0}\n\nLa aplicación se recargará en 3 segundos...`;

      this.modals.showAlert('Importación Exitosa', summary);

      setTimeout(() => {
        location.reload();
      }, 3000);

    } catch (error) {
      console.error('Error importando backup:', error);
      this.showToast('❌ Error: ' + error.message, 'error');

      const fileInput = document.getElementById('import-file');
      if (fileInput) fileInput.value = '';
    }
  }

  async exportTransactionsJSON() {
    try {
      const startDate = document.getElementById('export-start')?.value || null;
      const endDate = document.getElementById('export-end')?.value || null;

      this.showToast('⏳ Exportando...', 'info');

      const result = await this.app.exportManager.exportTransactionsJSON(startDate, endDate);
      this.showToast(`✅ ${result.count} transacciones exportadas`, 'success');

    } catch (error) {
      console.error('Error exportando JSON:', error);
      this.showToast('❌ Error: ' + error.message, 'error');
    }
  }

  async exportToExcel() {
    try {
      if (typeof XLSX === 'undefined') {
        this.showToast('❌ Error: Biblioteca Excel no disponible', 'error');
        return;
      }

      const startDate = document.getElementById('export-start')?.value || null;
      const endDate = document.getElementById('export-end')?.value || null;

      this.showToast('⏳ Generando Excel...', 'info');

      const result = await this.app.exportManager.exportToExcel(startDate, endDate);
      this.showToast('✅ Excel exportado correctamente', 'success');

    } catch (error) {
      console.error('Error exportando Excel:', error);
      this.showToast('❌ Error: ' + error.message, 'error');
    }
  }

  async clearAllData() {
    try {
      const confirmed = await this.modals.showConfirm(
        '⚠️ ZONA DE PELIGRO',
        '¿Estás seguro de que quieres BORRAR TODOS LOS DATOS?\n\n🛑 Esta acción NO se puede deshacer.\n\n✅ Se recomienda crear un backup antes de continuar.'
      );

      if (!confirmed) return;

      const secondaryConfirmed = await this.modals.showConfirm(
        '⚠️ CONFIRMACIÓN FINAL',
        '¿REALMENTE estás seguro? Esta acción borrará permanentemente TODAS tus transacciones, cuentas y usuarios.\n\nEsta es la última oportunidad para cancelar.'
      );

      if (!secondaryConfirmed) {
        this.showToast('❌ Operación cancelada', 'info');
        return;
      }

      await this.app.clearAllData();

      this.showToast('✅ Datos borrados. Recargando...', 'success');

      setTimeout(() => {
        location.reload();
      }, 1500);

    } catch (error) {
      console.error('Error borrando datos:', error);
      this.showToast('❌ Error: ' + error.message, 'error');
    }
  }

  // ========================================
  // TRANSACTIONS
  // ========================================
  async loadTransactions() {
    try {
      await this.loadCategoriesFilter();
      await this.loadUsersFilter();

      // Establecer período por defecto
      const periodSelect = document.getElementById('tx-filter-period');
      if (periodSelect) {
        periodSelect.value = 'month';
      }

      // Inicializar paginación
      this.currentPage = 1;
      this.pageSize = 30;

      await this.filterTransactions();
    } catch (error) {
      console.error('Error loading transactions:', error);
      this.showToast('Error cargando transacciones', 'error');
    }
  }

  async loadCategoriesFilter() {
    try {
      const categories = await this.app.storage.getCategories();
      const select = document.getElementById('tx-filter-category');

      if (!select) return;

      const allCategories = [
        ...categories.income.map(c => c.name),
        ...categories.expense.map(c => c.name)
      ];

      const uniqueCategories = [...new Set(allCategories)].sort();
      const currentValue = select.value;

      select.innerHTML = '<option value="">Todas las categorías</option>' +
        uniqueCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

      if (currentValue && uniqueCategories.includes(currentValue)) {
        select.value = currentValue;
      }

    } catch (error) {
      console.error('Error loading categories filter:', error);
    }
  }

  async filterTransactions() {
    try {
      const search = document.getElementById('tx-search')?.value.toLowerCase() || '';
      const type = document.getElementById('tx-filter-type')?.value || '';
      const category = document.getElementById('tx-filter-category')?.value || '';
      const subcategory = document.getElementById('tx-filter-subcategory')?.value || '';
      const user = document.getElementById('tx-filter-user')?.value || '';
      const paymentMethod = document.getElementById('tx-filter-payment')?.value || '';
      const period = document.getElementById('tx-filter-period')?.value || 'month';

      const filters = {};

      // Filtros de período
      if (period !== 'all') {
        if (period === 'custom') {
          const startDateInput = document.getElementById('tx-filter-start-date')?.value || '';
          const endDateInput = document.getElementById('tx-filter-end-date')?.value || '';

          if (startDateInput) {
            filters.startDate = `${startDateInput}T00:00:00.000Z`;
          }
          if (endDateInput) {
            filters.endDate = `${endDateInput}T23:59:59.999Z`;
          }
        } else {
          const dates = this.app.getPeriodDates(period);
          filters.startDate = dates.start;
          filters.endDate = dates.end;
        }
      }

      if (type) filters.type = type;
      if (category) filters.category = category;
      if (subcategory) filters.subcategory = subcategory;
      if (paymentMethod) filters.paymentMethod = paymentMethod;

      let transactions = await this.app.transactions.getAll(filters);

      // Filtrar por búsqueda de texto
      if (search) {
        transactions = transactions.filter(t => {
          return t.description.toLowerCase().includes(search) ||
                 t.category.toLowerCase().includes(search) ||
                 (t.subcategory || '').toLowerCase().includes(search) ||
                 t.paymentMethod.toLowerCase().includes(search) ||
                 t.userName.toLowerCase().includes(search) ||
                 t.amount.toString().includes(search);
        });
      }

      // Filtrar por usuario
      if (user) {
        transactions = transactions.filter(t => t.userName === user);
      }

      // ✅ ELIMINADO SORT REDUNDANTE (TransactionManager.getAll ya ordena por fecha)
      
      // Guardar las transacciones filtradas para uso global en el manager
      this.filteredTransactions = transactions;

      // ✅ CRÍTICO: Renderizar con las transacciones filtradas
      this.renderTransactionList(this.filteredTransactions);
      // Actualizar gráfico de tendencias
      this.renderTransactionsTrendChart(this.filteredTransactions);

    } catch (error) {
      console.error('Error filtering transactions:', error);
      this.showToast('Error filtrando transacciones', 'error');
    }
  }

  renderTransactionList(transactions) {
    const container = document.getElementById('transaction-list');

    // Calcular paginación
    const totalPages = Math.ceil(transactions.length / this.pageSize) || 1;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, transactions.length);
    const paginatedTransactions = transactions.slice(startIndex, endIndex);

    // Actualizar TODOS los elementos de info de paginación
    const paginationInfos = document.querySelectorAll('.tx-pagination-info');
    paginationInfos.forEach(info => {
      if (transactions.length === 0) {
        info.textContent = '0 - 0 de 0';
      } else {
        info.textContent = `${startIndex + 1} - ${endIndex} de ${transactions.length}`;
      }
    });

    // Actualizar estado de TODOS los botones
    const firstPageBtns = document.querySelectorAll('.tx-first-page');
    const prevPageBtns = document.querySelectorAll('.tx-prev-page');
    const nextPageBtns = document.querySelectorAll('.tx-next-page');
    const lastPageBtns = document.querySelectorAll('.tx-last-page');

    const isFirstPage = this.currentPage === 1;
    const isLastPage = this.currentPage >= totalPages;

    firstPageBtns.forEach(btn => btn.disabled = isFirstPage);
    prevPageBtns.forEach(btn => btn.disabled = isFirstPage);
    nextPageBtns.forEach(btn => btn.disabled = isLastPage);
    lastPageBtns.forEach(btn => btn.disabled = isLastPage);

    // Renderizar transacciones
    if (paginatedTransactions.length === 0) {
      container.innerHTML = `
        <div class="card">
          <p style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">
            No se encontraron transacciones con los filtros aplicados
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = paginatedTransactions.map(transaction => {
      const currencySymbol = this.getCurrencySymbol(transaction.currency);
      const dateStr = this.formatDate(transaction.date);

      const isSavingTransaction = transaction.savingId || transaction.category === 'Ahorro';
      const isTransfer = transaction.category === 'Transferencia';

      return `
    <div class="card list-item" data-transaction-id="${transaction.id}">
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span class="badge badge-${transaction.category === 'Transferencia'
          ? 'transfer'
          : transaction.type === 'income' ? 'income' : 'expense'
        }">
            ${transaction.category === 'Transferencia'
          ? 'TRANSFERENCIA'
          : transaction.type === 'income' ? 'INGRESO' : 'GASTO'
        }
          </span>
          <span class="badge" style="background: var(--bg-tertiary);">${transaction.paymentMethod}</span>
          ${transaction.isInstallment ? `
            <span class="badge" style="background: var(--info); color: white;">
              Cuota ${transaction.installmentInfo.current}/${transaction.installmentInfo.total}
            </span>
          ` : ''}
          ${transaction.paymentMethod === 'Crédito' && (transaction.autoCharged || transaction.paymentStatus === 'paid') ? `
            <span class="badge" style="background: var(--success); color: white; display: flex; align-items: center; gap: 4px;">
              ✓ PAGADA
            </span>
          ` : transaction.paymentMethod === 'Crédito' && (!transaction.autoCharged && transaction.paymentStatus !== 'paid') ? `
            <span class="badge" style="background: var(--warning); color: white; display: flex; align-items: center; gap: 4px;">
              ⏳ PENDIENTE
            </span>
          ` : ''}
        </div>
        <h3 class="tx-desc" style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;"></h3>
        <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--text-secondary);">
          <span>📅 ${dateStr}</span>
          <span>📂 ${transaction.category}${transaction.subcategory ? ` › ${transaction.subcategory}` : ''}</span>
          <span>👤 ${transaction.userName}</span>
          ${isTransfer && transaction.transferInfo ? `
            <span style="color: var(--primary); font-weight: 600; display: flex; align-items: center; gap: 4px;">
              🏦 ${transaction.transferInfo.fromWallet} <span style="font-size: 10px;">➜</span> ${transaction.transferInfo.toWallet}
            </span>
          ` : `
            ${transaction.walletName ? `<span>💰 ${transaction.walletName}</span>` : ''}
          `}
          ${transaction.card ? `<span>💳 ${transaction.card}</span>` : ''}
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 18px; font-weight: bold; color: var(--${transaction.type === 'income' ? 'success' : 'danger'}); margin-bottom: 8px;">
          ${currencySymbol} ${transaction.amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
          ${transaction.paymentMethod === 'Crédito' ? `
            ${(transaction.autoCharged || transaction.paymentStatus === 'paid') ? `
              ${this.app.auth.isAdmin() ? `
                <button class="btn btn-sm" style="background: var(--warning); color: white;" onclick="window.uiManager.undoInstallmentPayment('${transaction.id}')">
                  ↩️ Deshacer Pago
                </button>
              ` : ''}
            ` : `
              <button class="btn btn-sm" style="background: var(--success); color: white;" onclick="window.uiManager.payInstallmentManually('${transaction.id}')">
                💳 Pagar Ahora
              </button>
            `}
          ` : ''}
          ${!isSavingTransaction && !isTransfer ? `
            <button class="btn btn-sm btn-secondary" onclick="window.uiManager.editTransaction('${transaction.id}')">
              ✏️ Editar
            </button>
            <button class="btn btn-sm btn-danger" onclick="window.uiManager.deleteTransaction('${transaction.id}')">
              🗑️ Eliminar
            </button>
          ` : `
            <span style="font-size: 11px; color: var(--text-secondary); font-style: italic;">
              ${isSavingTransaction ? 'Gestionar desde Ahorros' : 'No editable'}
            </span>
          `}
        </div>
      </div>
    </div>
  `;
    }).join('');

    // ✅ SANITIZAR descripciones para prevenir XSS
    const descElements = container.querySelectorAll('.tx-desc');
    paginatedTransactions.forEach((tx, index) => {
      if (descElements[index]) {
        descElements[index].textContent = tx.description;
      }
    });

    // Scroll al inicio de la lista al cambiar de página
    if (this.currentPage > 1) {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async loadUsersFilter() {
    try {
      const users = await this.app.users.getAll();
      const select = document.getElementById('tx-filter-user');

      if (!select) return;

      const currentValue = select.value;

      select.innerHTML = '<option value="">Todos los usuarios</option>' +
        users
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(user => `<option value="${user.name}">${user.name}</option>`).join('');

      if (currentValue && users.find(u => u.name === currentValue)) {
        select.value = currentValue;
      }

    } catch (error) {
      console.error('Error loading users filter:', error);
    }
  }


  async editTransaction(id) {
    try {
      const transaction = await this.app.transactions.getById(id);

      // ✅ BLOQUEO: No editar transacciones de ahorro
      if (transaction.savingId || transaction.category === 'Ahorro') {
        this.showToast('❌ Las transacciones de ahorro solo se gestionan desde la sección Ahorros', 'error');
        return;
      }

      // ✅ BLOQUEO: No editar transferencias
      if (transaction.category === 'Transferencia') {
        this.showToast('❌ Las transferencias no se pueden editar directamente', 'error');
        return;
      }

      this.modals.showTransactionModal(transaction);
    } catch (error) {
      console.error('Edit transaction error:', error);
      this.showToast('Error editando transacción: ' + error.message, 'error');
    }
  }

  async deleteTransaction(id) {
    try {
      const transaction = await this.app.transactions.getById(id);

      // ✅ BLOQUEO: No eliminar transacciones de ahorro
      if (transaction.savingId || transaction.category === 'Ahorro') {
        this.showToast('❌ Las transacciones de ahorro solo se gestionan desde la sección Ahorros', 'error');
        return;
      }

      // ✅ BLOQUEO: No eliminar transferencias
      if (transaction.category === 'Transferencia') {
        this.showToast('❌ Las transferencias no se pueden eliminar directamente', 'error');
        return;
      }

      const confirmed = await this.modals.showConfirm(
        'Eliminar transacción',
        `¿Eliminar transacción "${transaction.description}" por ${this.formatCurrency(transaction.amount)}?\n\nEsta acción no se puede deshacer.`
      );

      if (!confirmed) return;

      await this.app.transactions.delete(id);
      this.showToast('Transacción eliminada', 'success');
      await this.filterTransactions();
      await this.loadDashboard();
    } catch (error) {
      this.showToast('Error eliminando transacción: ' + error.message, 'error');
    }
  }


  // ========================================
  // BUDGETS
  // ========================================
  async loadBudgets() {
    try {
      const utilizations = await this.app.budgets.getAllUtilizations();
      this.renderBudgetList(utilizations);
    } catch (error) {
      console.error('Error loading budgets:', error);
      this.showToast('Error cargando presupuestos: ' + error.message, 'error');
    }
  }

  renderBudgetList(utilizations) {
    const container = document.getElementById('budget-list');

    if (utilizations.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <p>No hay presupuestos configurados</p>
            <p style="font-size: 14px; margin-top: 8px;">Crea tu primer presupuesto para comenzar a controlar tus gastos</p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = utilizations.map(util => `
      <div class="card budget-card alert-${util.alertLevel}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <h3 style="margin: 0 0 4px 0;">${util.category}</h3>
            ${util.subcategory ? `<p style="font-size: 12px; color: var(--text-secondary); margin: 0;">Subcategoría: ${util.subcategory}</p>` : ''}
            <span style="font-size: 12px; color: var(--text-secondary);">
              ${this.PERIOD_LABELS[util.period] || util.period} • Límite: ${this.formatCurrency(util.limit)}
            </span>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="btn-icon" onclick="app.ui.editBudget('${util.id}')" title="Editar">✎</button>
            <button class="btn-icon" onclick="app.ui.deleteBudget('${util.id}')" title="Eliminar">×</button>
          </div>
        </div>
        
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${Math.min(util.percentage, 100)}%;"></div>
        </div>
        
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); margin: 8px 0;">
          <span>Gastado: ${this.formatCurrency(util.spent)}</span>
          <span>Restante: ${this.formatCurrency(util.remaining)}</span>
        </div>
        
        <div style="text-align: center; font-size: 14px; font-weight: 600; color: var(--${util.alertLevel === 'exceeded' ? 'danger' : util.alertLevel === 'danger' ? 'danger' : util.alertLevel === 'warning' ? 'warning' : 'success'});">
          ${util.percentage}% utilizado
          ${util.alertLevel === 'exceeded' ? ' • Excedido' : ''}
        </div>
      </div>
    `).join('');
  }

  async editBudget(id) {
    try {
      const budget = await this.app.budgets.getById(id);
      this.modals.showBudgetModal(budget);
    } catch (error) {
      this.showToast('Error editando presupuesto: ' + error.message, 'error');
    }
  }

  async deleteBudget(id) {
    try {
      const confirmed = await this.modals.showConfirm(
        'Eliminar presupuesto',
        '¿Estás seguro de que quieres eliminar este presupuesto?\n\nEsta acción no se puede deshacer.'
      );

      if (!confirmed) return;

      await this.app.budgets.delete(id);
      this.showToast('Presupuesto eliminado', 'success');
      await this.loadBudgets();
      await this.loadDashboard();

    } catch (error) {
      this.showToast('Error eliminando presupuesto: ' + error.message, 'error');
    }
  }

  // ========================================
  // SAVINGS
  // ========================================
  async loadSavings() {
    try {
      const savings = await this.app.savings.getAll();
      
      // ✅ PRE-CÁLCULO de montos dinámicos (Fuera del render para mayor eficiencia)
      const preparedSavings = await Promise.all(
        savings.map(async (saving) => {
          try {
            const currentAmountDynamic = await this.app.savings.getCurrentAmountDynamic(
              saving.id,
              this.app.currencyManager
            );
            return { ...saving, currentAmountDynamic };
          } catch (error) {
            return { ...saving, currentAmountDynamic: saving.currentAmount };
          }
        })
      );

      this.renderSavingsList(preparedSavings);
    } catch (error) {
      console.error('Error loading savings:', error);
      this.showToast('Error cargando ahorros: ' + error.message, 'error');
    }
  }

  renderSavingsList(savings) {
    const container = document.getElementById('savings-list');

    if (!savings || savings.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <p>No hay objetivos de ahorro</p>
            <p style="font-size: 14px; margin-top: 8px;">Crea tu primer objetivo para comenzar a ahorrar</p>
          </div>
        </div>
      `;
      return;
    }

    const today = new Date(); // Reutilizar fecha actual
    
    container.innerHTML = savings.map(saving => {
      const currentAmount = saving.currentAmountDynamic || saving.currentAmount;
      const progress = parseFloat((currentAmount / saving.goalAmount * 100).toFixed(1));
      const remaining = Math.max(0, saving.goalAmount - currentAmount);
      const hasChanged = Math.abs(currentAmount - saving.currentAmount) > 0.01;

      let deadlineHtml = '';
      if (saving.deadline) {
        const deadline = new Date(saving.deadline);
        const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

        let deadlineClass = 'color: var(--success)';
        if (daysLeft < 0) deadlineClass = 'color: var(--danger)';
        else if (daysLeft < 30) deadlineClass = 'color: var(--warning)';

        deadlineHtml = `
          <div style="font-size: 12px; ${deadlineClass}; margin-top: 6px;">
            📅 Límite: ${deadline.toLocaleDateString('es-AR')} 
            ${daysLeft >= 0 ? `(${daysLeft} días)` : '(vencido)'}
          </div>
        `;
      }

      return `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div style="flex: 1;">
              <h3 style="margin: 0 0 4px 0;">${saving.name}</h3>
              <div style="font-size: 12px; color: var(--text-secondary);">
                Meta: ${this.formatCurrency(saving.goalAmount)} ${saving.currency || 'ARS'} • ${saving.userName}
                ${hasChanged ? ' <span style="color: var(--primary);">💱</span>' : ''}
              </div>
              ${deadlineHtml}
              ${saving.description ? `<p style="font-size: 13px; color: var(--text-secondary); margin-top: 8px;">${saving.description}</p>` : ''}
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="btn-icon" onclick="app.ui.editSaving('${saving.id}')" title="Editar">✎</button>
              <button class="btn-icon" onclick="app.ui.deleteSaving('${saving.id}')" title="Eliminar">×</button>
            </div>
          </div>
          
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(progress, 100)}%; background: var(--primary);"></div>
          </div>
          
          <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); margin: 8px 0;">
            <span>Ahorrado: ${this.formatCurrency(currentAmount)} ${hasChanged ? '(actual)' : ''}</span>
            <span>Falta: ${this.formatCurrency(remaining)}</span>
          </div>
          
          <div style="text-align: center; font-size: 14px; font-weight: 600; color: var(--primary); margin-bottom: 8px;">
            ${progress}% completado
          </div>
          
          ${remaining > 0 ? `
            <button class="btn btn-sm btn-primary" onclick="app.ui.addToSaving('${saving.id}')" style="width: 100%;">
              💰 Agregar Monto
            </button>
          ` : `
            <div class="alert alert-success" style="text-align: center; margin: 0;">
              🎉 ¡Meta alcanzada!
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  async editSaving(id) {
    try {
      const saving = await this.app.savings.getById(id);
      this.modals.showSavingsModal(saving);
    } catch (error) {
      this.showToast('Error editando objetivo: ' + error.message, 'error');
    }
  }

  async deleteSaving(id) {
    try {
      const confirmed = await this.modals.showConfirm(
        'Eliminar objetivo',
        '¿Estás seguro de que quieres eliminar este objetivo de ahorro?\n\nEsta acción no se puede deshacer.'
      );

      if (!confirmed) return;

      await this.app.savings.delete(id);
      this.showToast('Objetivo eliminado', 'success');
      await this.loadSavings();
      await this.loadDashboard();

    } catch (error) {
      this.showToast('Error eliminando objetivo: ' + error.message, 'error');
    }
  }

  // ========================================
  // LOANS
  // ========================================

  async loadLoans() {
    try {
      const loans = await this.app.loansManager.getAll();
      const summary = await this.app.loansManager.getSummary();

      // Helper para actualizar texto de elementos
      const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setText('loans-lent-pending', this.formatCurrency(summary.lent.totalPending));
      setText('loans-lent-count', summary.lent.count);
      setText('loans-borrowed-pending', this.formatCurrency(summary.borrowed.totalPending));
      setText('loans-borrowed-count', summary.borrowed.count);
      setText('loans-net-balance', this.formatCurrency(summary.netBalance));

      // Renderizar lista
      this.renderLoansList(loans);

    } catch (error) {
      this.showToast('Error cargando préstamos', 'error');
    }
  }

  async filterLoans(type) {
    const loans = await this.app.loansManager.getAll();
    let filtered = loans;

    if (type === 'lent') {
      filtered = loans.filter(l => l.type === 'lent' && l.status !== 'completed');
    } else if (type === 'borrowed') {
      filtered = loans.filter(l => l.type === 'borrowed' && l.status !== 'completed');
    } else if (type === 'overdue') {
      filtered = loans.filter(l => l.status === 'overdue');
    }

    this.renderLoansList(filtered);
  }

  renderLoansList(loans) {
    const container = document.getElementById('loans-list');
    if (!loans || loans.length === 0) {
      container.innerHTML = `
        <div class="card" style="padding: 40px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">💳</div>
          <h3 style="margin-bottom: 8px; color: var(--text-secondary);">No hay préstamos registrados</h3>
          <p style="color: var(--text-secondary); font-size: 14px;">Crea tu primer préstamo usando el botón "+ Nuevo Préstamo"</p>
        </div>
      `;
      return;
    }
    // Renderizar lista directamente sin variables intermedias redundantes
    container.innerHTML = loans.map(loan => {
      const progress = ((loan.totalAmount - loan.currentBalance) / loan.totalAmount * 100).toFixed(1);
      const statusBadge = loan.status === 'completed' ? 'success' : loan.status === 'overdue' ? 'danger' : 'warning';
      const statusText = loan.status === 'completed' ? 'COMPLETADO' : loan.status === 'overdue' ? 'VENCIDO' : 'ACTIVO';
      const typeBadge = loan.type === 'lent' ? 'income' : 'expense';
      const typeText = loan.type === 'lent' ? 'PRESTADO' : 'RECIBIDO';
      
      return `
        <div class="card" style="padding: 20px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
            <div>
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <span class="badge badge-${typeBadge}">${typeText}</span>
                <span class="badge badge-${statusBadge}">${statusText}</span>
              </div>
              <h3 style="margin: 0 0 4px 0;">${loan.title}</h3>
              <p style="margin: 0; color: var(--text-secondary); font-size: 13px;">${loan.counterparty}</p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 24px; font-weight: 700; color: var(--${typeBadge});">
                ${this.formatCurrency(loan.currentBalance || 0)}
              </div>
              <div style="font-size: 11px; color: var(--text-secondary);">
                de ${this.formatCurrency(loan.totalAmount)}
              </div>
            </div>
          </div>
          ${loan.description ? `<p style="margin: 0 0 12px 0; font-size: 13px; color: var(--text-secondary);">${loan.description}</p>` : ''}
          <div class="progress-bar" style="height: 8px; background: var(--bg-primary); border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
            <div style="height: 100%; width: ${Math.min(progress, 100)}%; background: ${loan.type === 'lent' ? 'var(--success)' : 'var(--danger)'}; transition: width 0.3s;"></div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; font-size: 12px;">
            <div>
              <div style="color: var(--text-secondary);">Original</div>
              <div style="font-weight: 600;">${this.formatCurrency(loan.originalAmount)}</div>
            </div>
            <div>
              <div style="color: var(--text-secondary);">${loan.type === 'lent' ? 'Cobrado' : 'Pagado'}</div>
              <div style="font-weight: 600; color: var(--success);">${this.formatCurrency(loan.totalAmount - loan.currentBalance)}</div>
            </div>
            <div>
              <div style="color: var(--text-secondary);">Progreso</div>
              <div style="font-weight: 600;">${progress}%</div>
            </div>
          </div>
          ${loan.interestRate > 0 ? `
            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">
              Interés: ${loan.interestRate}% • Total con interés: ${this.formatCurrency(loan.totalAmount)}
            </div>
          ` : ''}
          ${loan.dueDate ? `
            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 12px;">
              📅 Vence: ${this.formatDate(loan.dueDate)}
            </div>
          ` : ''}
          ${loan.payments && loan.payments.length > 0 ? `
            <details style="margin: 12px 0; background: var(--bg-secondary); border-radius: 8px; padding: 8px;">
              <summary style="cursor: pointer; font-weight: 600; padding: 8px; user-select: none; list-style: none; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">📜</span>
                <span>Historial de Pagos (${loan.payments.length})</span>
                <span style="margin-left: auto; font-size: 12px; color: var(--text-secondary);">▼</span>
              </summary>
              <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                ${loan.payments.map(payment => `
                  <div class="payment-item" style="padding: 12px; background: var(--bg-primary); border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color);">
                    <div style="flex: 1;">
                      <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                        ${this.formatCurrency(payment.amount)}
                      </div>
                      <div style="font-size: 11px; color: var(--text-secondary); display: flex; gap: 12px; flex-wrap: wrap;">
                        <span>📅 ${this.formatDate(payment.date)}</span>
                        <span>💳 ${payment.paymentMethod}</span>
                      </div>
                      ${payment.note ? `<div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; font-style: italic;">"${payment.note}"</div>` : ''}
                    </div>
                    <button 
                      class="btn btn-danger btn-sm" 
                      onclick="window.uiManager.deleteLoanPayment('${loan.id}', '${payment.id}')"
                      title="Eliminar pago"
                      style="min-width: 80px;">
                      🗑️ Eliminar
                    </button>
                  </div>
                `).join('')}
              </div>
            </details>
          ` : ''}
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${loan.status !== 'completed' ? `
              <button class="btn btn-success btn-sm" onclick="window.uiManager.showPaymentModal('${loan.id}')">
                Registrar Pago
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" onclick="window.uiManager.editLoan('${loan.id}')">
              Editar
            </button>
            <button class="btn btn-danger btn-sm" onclick="window.uiManager.deleteLoan('${loan.id}')">
              Eliminar
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  async showLoanModal(loan = null) {
    const isEdit = !!loan;
    const modalTitle = isEdit ? 'Editar Préstamo' : 'Nuevo Préstamo';

    // Obtener wallets para el select
    const wallets = await this.app.walletManager.getAll();
    const walletsOptions = wallets.map(w =>
      `<option value="${w.id}" ${loan?.walletId === w.id ? 'selected' : ''}>${w.name} (${w.currency}) - ${this.formatCurrency(w.currentBalance)}</option>`
    ).join('');

    const modalHTML = `
          <div class="modal active" id="loan-modal">
            <div class="modal-content" style="max-width: 600px;">
              <div class="modal-header">
                <h2>${modalTitle}</h2>
              </div>
              
              <form id="loan-form" class="modal-body">
                <!-- Tipo de préstamo -->
                <div class="form-group">
                  <label class="form-label">Tipo de Préstamo *</label>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <label class="radio-card" style="cursor: pointer; padding: 16px; border: 2px solid var(--border-color); border-radius: 8px; text-align: center; transition: all 0.2s;">
                      <input type="radio" name="type" value="lent" ${!isEdit || loan?.type === 'lent' ? 'checked' : ''} style="margin-bottom: 8px;">
                      <div style="font-size: 24px; margin-bottom: 4px;">💸</div>
                      <div style="font-weight: 600;">Presté Dinero</div>
                      <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Le presté a alguien</div>
                    </label>
                    <label class="radio-card" style="cursor: pointer; padding: 16px; border: 2px solid var(--border-color); border-radius: 8px; text-align: center; transition: all 0.2s;">
                      <input type="radio" name="type" value="borrowed" ${loan?.type === 'borrowed' ? 'checked' : ''} style="margin-bottom: 8px;">
                      <div style="font-size: 24px; margin-bottom: 4px;">💰</div>
                      <div style="font-weight: 600;">Me Prestaron</div>
                      <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Recibí un préstamo</div>
                    </label>
                  </div>
                </div>

                <!-- Título y Contraparte -->
                <div class="grid grid-2" style="gap: 12px;">
                  <div class="form-group">
                    <label class="form-label">Título *</label>
                    <input type="text" name="title" class="form-input" placeholder="Ej: Préstamo para auto" value="${loan?.title || ''}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Persona/Entidad *</label>
                    <input type="text" name="counterparty" class="form-input" placeholder="Ej: Juan Pérez" value="${loan?.counterparty || ''}" required>
                  </div>
                </div>

                <!-- Monto Original -->
                <div class="form-group">
                  <label class="form-label">Monto Original *</label>
                  <input type="number" name="originalAmount" id="loan-original-amount" class="form-input" placeholder="0.00" step="0.01" min="0.01" value="${loan?.originalAmount || ''}" required>
                </div>

                <!-- Wallet y Moneda -->
                <div class="grid grid-2" style="gap: 12px;">
                  <div class="form-group">
                    <label class="form-label">Caja/Billetera *</label>
                    <select name="walletId" class="form-select" required>
                      <option value="">Seleccionar...</option>
                      ${walletsOptions}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Moneda</label>
                    <select name="currency" class="form-select">
                      <option value="ARS" ${!loan || loan?.currency === 'ARS' ? 'selected' : ''}>ARS - Peso Argentino</option>
                      <option value="USD" ${loan?.currency === 'USD' ? 'selected' : ''}>USD - Dólar</option>
                      <option value="EUR" ${loan?.currency === 'EUR' ? 'selected' : ''}>EUR - Euro</option>
                    </select>
                  </div>
                </div>

                <!-- Cuotas fijas/variables (ANTES de cantidad de cuotas) -->
                <div class="form-group">
                  <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" name="isFixedInstallments" id="loan-fixed-installments" ${!loan || loan?.isFixedInstallments !== false ? 'checked' : ''}>
                    <span style="font-size: 13px; font-weight: 600;">Cuotas fijas (mismo monto cada mes)</span>
                  </label>
                  <small style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; display: block;">
                    Si no está marcado, podrás definir el monto de cada cuota manualmente
                  </small>
                </div>

                <!-- Sistema de Amortización e Interés -->
                <div class="grid grid-2" style="gap: 12px;">
                  <div class="form-group">
                    <label class="form-label">Sistema de Interés *</label>
                    <select name="amortizationType" id="loan-amortization-type" class="form-select">
                      <option value="simple" ${!loan || loan?.amortizationType === 'simple' ? 'selected' : ''}>Simple (Total directo)</option>
                      <option value="french" ${loan?.amortizationType === 'french' ? 'selected' : ''}>Francés (Cuota Fija)</option>
                      <option value="german" ${loan?.amortizationType === 'german' ? 'selected' : ''}>Alemán (Amortización Fija)</option>
                    </select>
                  </div>
                  <div class="form-group" id="loan-interest-group">
                    <label class="form-label">Interés (%) *</label>
                    <input type="number" name="interestRate" id="loan-interest-rate" class="form-input" placeholder="0" step="0.01" min="0" value="${loan?.interestRate || 0}">
                  </div>
                </div>

                <!-- Cuotas -->
                <div class="grid grid-2" style="gap: 12px;">
                  <div class="form-group">
                    <label class="form-label">Cantidad de Cuotas</label>
                    <input type="number" name="installments" id="loan-installments" class="form-input" placeholder="1" min="1" value="${loan?.installments || 1}">
                    <small style="font-size: 11px; color: var(--text-secondary);">1 = pago único</small>
                  </div>
                  <div class="form-group" id="loan-installment-amount-group" style="display: none;">
                    <label class="form-label">Monto por Cuota</label>
                    <input type="number" name="installmentAmount" id="loan-installment-amount" class="form-input" placeholder="0.00" step="0.01" min="0" value="${loan?.installmentAmount || ''}">
                    <small style="font-size: 11px; color: var(--text-secondary);">Para cuotas variables</small>
                  </div>
                </div>

                <!-- Fechas -->
                <div class="grid grid-2" style="gap: 12px;">
                  <div class="form-group">
                    <label class="form-label">Fecha de Inicio</label>
                    <input type="date" name="startDate" class="form-input" value="${loan?.startDate ? loan.startDate.split('T')[0] : new Date().toISOString().split('T')[0]}">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Fecha de Vencimiento</label>
                    <input type="date" name="dueDate" class="form-input" value="${loan?.dueDate ? loan.dueDate.split('T')[0] : ''}">
                    <small style="font-size: 11px; color: var(--text-secondary);">Opcional</small>
                  </div>
                </div>

                <!-- Descripción -->
                <div class="form-group">
                  <label class="form-label">Descripción</label>
                  <textarea name="description" class="form-input" rows="3" placeholder="Detalles adicionales...">${loan?.description || ''}</textarea>
                </div>

                ${isEdit ? `<input type="hidden" name="loanId" value="${loan.id}">` : ''}
              </form>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('loan-modal').remove()">Cancelar</button>
                <button type="button" class="btn btn-primary" id="loan-submit-btn">${isEdit ? 'Actualizar' : 'Crear'} Préstamo</button>
              </div>
            </div>
          </div>
        `;

    // Insertar modal en el DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Estilo para radio cards
    const style = document.createElement('style');
    style.textContent = `
          .radio-card:has(input:checked) {
            border-color: var(--primary) !important;
            background: rgba(99, 102, 241, 0.05);
          }
          .radio-card input[type="radio"] {
            cursor: pointer;
          }
        `;
    document.head.appendChild(style);

    // Lógica para mostrar/ocultar campos según tipo de cuota
    const fixedCheckbox = document.getElementById('loan-fixed-installments');
    const interestGroup = document.getElementById('loan-interest-group');
    const installmentAmountGroup = document.getElementById('loan-installment-amount-group');

    function toggleInstallmentFields() {
      if (!fixedCheckbox) return;
      const isFixed = fixedCheckbox.checked;

      if (isFixed) {
        // Cuotas fijas: mostrar interés, ocultar monto por cuota
        if (interestGroup) interestGroup.style.display = 'block';
        if (installmentAmountGroup) installmentAmountGroup.style.display = 'none';
        const installAmt = document.getElementById('loan-installment-amount');
        if (installAmt) installAmt.value = '';
      } else {
        // Cuotas variables: ocultar interés, mostrar monto por cuota
        if (interestGroup) interestGroup.style.display = 'none';
        if (installmentAmountGroup) installmentAmountGroup.style.display = 'block';
        const intRate = document.getElementById('loan-interest-rate');
        if (intRate) intRate.value = '0';
      }
    }

    // Inicializar estado
    toggleInstallmentFields();

    // Event listener para el checkbox
    if (fixedCheckbox) {
      fixedCheckbox.addEventListener('change', toggleInstallmentFields);
    }

    // Event listener para el botón de submit
    const submitBtn = document.getElementById('loan-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();

      const form = document.getElementById('loan-form');

      // Validar formulario
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      try {
        const formData = new FormData(form);
        const data = {
          type: formData.get('type'),
          amortizationType: formData.get('amortizationType'), // Capturar el sistema de amortización
          title: formData.get('title'),
          counterparty: formData.get('counterparty'),
          originalAmount: formData.get('originalAmount'),
          interestRate: formData.get('interestRate') || 0,
          walletId: formData.get('walletId'),
          currency: formData.get('currency'),
          installments: formData.get('installments') || 1,
          installmentAmount: formData.get('installmentAmount') || null,
          startDate: formData.get('startDate'),
          dueDate: formData.get('dueDate') || null,
          description: formData.get('description'),
          isFixedInstallments: formData.get('isFixedInstallments') === 'on'
        };

        if (isEdit) {
          await this.app.loansManager.update(formData.get('loanId'), data);
          this.showToast('Préstamo actualizado correctamente', 'success');
        } else {
          await this.app.loansManager.create(data);
          this.showToast('Préstamo creado correctamente', 'success');
        }

        document.getElementById('loan-modal').remove();
        await this.loadLoans();
        await this.loadDashboard('month'); // Refrescar dashboard

      } catch (error) {
        console.error('Error guardando préstamo:', error);

        // Mostrar mensaje de error más claro
        let errorMessage = error.message;

        // Personalizar mensajes comunes
        if (errorMessage.includes('Saldo insuficiente')) {
          errorMessage = '❌ ' + errorMessage;
        } else if (errorMessage.includes('Debe seleccionar')) {
          errorMessage = '⚠️ ' + errorMessage;
        } else if (errorMessage.includes('no encontrada')) {
          errorMessage = '❌ ' + errorMessage;
        }

        this.showToast(errorMessage, 'error');
      }
    });
    }
  }

  async editLoan(id) {
    try {
      const loan = await this.app.loansManager.getById(id);
      await this.showLoanModal(loan);
    } catch (error) {
      console.error('Error editando préstamo:', error);
      this.showToast(error.message, 'error');
    }
  }

  async deleteLoan(loanId) {
    if (!confirm('¿Estás seguro de eliminar este préstamo?')) return;

    try {
      await this.app.loansManager.delete(loanId);
      this.showToast('Préstamo eliminado', 'success');
      await this.loadLoans();
      await this.loadDashboard('month');
    } catch (error) {
      console.error('Error eliminando préstamo:', error);
      this.showToast(error.message, 'error');
    }
  }

  async deleteLoanPayment(loanId, paymentId) {
    try {
      const loan = await this.app.loansManager.getById(loanId);
      const payment = loan.payments.find(p => p.id === paymentId);

      if (!payment) {
        throw new Error('Pago no encontrado');
      }
      const confirmed = await this.modals.showConfirm(
        '¿Eliminar pago?',
        `¿Estás seguro de eliminar este pago?\n\n` +
        `💰 Monto: ${this.formatCurrency(payment.amount)}\n` +
        `📅 Fecha: ${this.formatDate(payment.date)}\n` +
        `💳 Método: ${payment.paymentMethod}\n\n` +
        `⚠️ El saldo del préstamo se restaurará y la transacción asociada se eliminará.`
      );
      if (!confirmed) return;
      await this.app.loansManager.deletePayment(loanId, paymentId);

      this.showToast('Pago eliminado correctamente', 'success');

      // Recargar vistas
      await this.loadLoans();
      await this.loadDashboard('month');

    } catch (error) {
      console.error('Error eliminando pago:', error);
      this.showToast(error.message, 'error');
    }
  }

  async showPaymentModal(loanId) {
    try {
      const loan = await this.app.loansManager.getById(loanId);
      const wallets = await this.app.walletManager.getAll();

      // Calcular número de cuota actual
      const currentInstallmentNumber = loan.payments.length + 1;
      const totalInstallments = loan.installments;

      // Calcular monto sugerido
      let suggestedAmount = loan.installmentAmount || (loan.currentBalance / (totalInstallments - loan.payments.length));
      suggestedAmount = Math.min(suggestedAmount, loan.currentBalance); // No exceder el saldo pendiente

      const walletsOptions = wallets.map(w =>
        `<option value="${w.id}" ${w.id === loan.walletId ? 'selected' : ''}>${w.name} (${w.currency}) - ${this.formatCurrency(w.currentBalance)}</option>`
      ).join('');

      const modalHTML = `
          <div class="modal active" id="payment-modal">
            <div class="modal-content" style="max-width: 500px;">
              <div class="modal-header">
                <h2>Registrar Pago - ${loan.title}</h2>
              </div>
              
              <form id="payment-form" class="modal-body">
                <!-- Información del préstamo -->
                <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: var(--text-secondary); font-size: 13px;">Contraparte:</span>
                    <strong>${loan.counterparty}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: var(--text-secondary); font-size: 13px;">Saldo pendiente:</span>
                    <strong style="color: var(--${loan.type === 'lent' ? 'income' : 'expense'}); font-size: 18px;">
                      ${this.formatCurrency(loan.currentBalance)}
                    </strong>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary); font-size: 13px;">Cuota:</span>
                    <strong>${currentInstallmentNumber} de ${totalInstallments}</strong>
                  </div>
                </div>

                <!-- Monto del pago -->
                <div class="form-group">
                  <label class="form-label">Monto del Pago *</label>
                  <input 
                    type="number" 
                    name="amount" 
                    id="payment-amount" 
                    class="form-input" 
                    placeholder="0.00" 
                    step="0.01" 
                    min="0.01" 
                    max="${loan.currentBalance}"
                    value="${suggestedAmount.toFixed(2)}"
                    required
                  >
                  <small style="font-size: 11px; color: var(--text-secondary);">
                    ${loan.isFixedInstallments
          ? `Cuota fija sugerida: ${this.formatCurrency(suggestedAmount)}`
          : `Monto sugerido: ${this.formatCurrency(suggestedAmount)} (puedes modificarlo)`
        }
                  </small>
                </div>

                <!-- Fecha del pago -->
                <div class="form-group">
                  <label class="form-label">Fecha del Pago *</label>
                  <input 
                    type="date" 
                    name="date" 
                    class="form-input" 
                    value="${new Date().toISOString().split('T')[0]}"
                    required
                  >
                </div>

                <!-- Wallet destino/origen -->
                <div class="form-group">
                  <label class="form-label">Caja/Billetera *</label>
                  <select name="walletId" class="form-select" required>
                    ${walletsOptions}
                  </select>
                  <small style="font-size: 11px; color: var(--text-secondary);">
                    ${loan.type === 'lent'
          ? 'Caja donde recibes el pago'
          : 'Caja desde donde pagas'
        }
                  </small>
                </div>

                <!-- Método de pago -->
                <div class="form-group">
                  <label class="form-label">Método de Pago</label>
                  <select name="paymentMethod" class="form-select">
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia" selected>Transferencia</option>
                    <option value="Débito">Débito</option>
                    <option value="Crédito">Crédito</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <!-- Nota opcional -->
                <div class="form-group">
                  <label class="form-label">Nota (Opcional)</label>
                  <textarea 
                    name="note" 
                    class="form-input" 
                    rows="2" 
                    placeholder="Ej: Pago de cuota ${currentInstallmentNumber}"
                  ></textarea>
                </div>

                <input type="hidden" name="loanId" value="${loanId}">
              </form>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('payment-modal').remove()">Cancelar</button>
                <button type="button" class="btn btn-success" id="payment-submit-btn">Registrar Pago</button>
              </div>
            </div>
          </div>
        `;

      // Insertar modal
      document.body.insertAdjacentHTML('beforeend', modalHTML);

      // Event listener para el botón
      const submitBtn = document.getElementById('payment-submit-btn');
      submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        const form = document.getElementById('payment-form');

        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        try {
          const formData = new FormData(form);
          const paymentData = {
            amount: parseFloat(formData.get('amount')),
            date: formData.get('date'),
            walletId: formData.get('walletId'),
            paymentMethod: formData.get('paymentMethod'),
            note: formData.get('note') || `Pago de cuota ${currentInstallmentNumber}/${totalInstallments}`
          };

          // Validar que el monto no exceda el saldo
          if (paymentData.amount > loan.currentBalance) {
            this.showToast(`El monto no puede exceder el saldo pendiente (${this.formatCurrency(loan.currentBalance)})`, 'error');
            return;
          }

          const result = await this.app.loansManager.addPayment(loanId, paymentData);

          // 🔍 DEBUG: Ver resultado del pago
          logger.log('💰 Resultado del pago:', result);
          logger.log('💰 Préstamo actualizado:', result.loan);
          logger.log('💰 Nuevo saldo:', result.loan.currentBalance);

          const isCompleted = result.loan.currentBalance <= 0;

          this.showToast(
            isCompleted
              ? `¡Préstamo completado! 🎉`
              : `Pago registrado correctamente (${currentInstallmentNumber}/${totalInstallments})`,
            'success'
          );

          document.getElementById('payment-modal').remove();
          await this.loadLoans();
          await this.loadDashboard('month');

        } catch (error) {
          console.error('Error registrando pago:', error);
          this.showToast(error.message, 'error');
        }
      });

    } catch (error) {
      console.error('Error mostrando modal de pago:', error);
      this.showToast(error.message, 'error');
    }
  }

  async addToSaving(id) {
    try {
      const saving = await this.app.savings.getById(id);
      const wallets = await this.app.walletManager.getAll();

      if (wallets.length === 0) {
        this.showToast('No tienes billeteras configuradas', 'error');
        return;
      }

      const remainingToGoal = saving.goalAmount - saving.currentAmount;

      if (remainingToGoal <= 0) {
        this.showToast('Este objetivo ya alcanzó su meta', 'success');
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
                  Meta: ${this.formatCurrency(saving.goalAmount)} ${saving.currency || 'ARS'}<br>
                  Ahorrado: ${this.formatCurrency(saving.currentAmount)}<br>
                  Falta: ${this.formatCurrency(remainingToGoal)}
                </span>
              </p>
              
              <div class="form-group">
                <label class="form-label">Desde Billetera</label>
                <select class="form-select" name="walletId" id="saving-wallet" required>
                  <option value="">Seleccionar billetera</option>
                  ${wallets.map(w => `
                    <option value="${w.id}" data-balance="${w.currentBalance}" data-currency="${w.currency || 'ARS'}">
                      ${w.name} - ${this.formatCurrency(w.currentBalance)} ${w.currency || 'ARS'}
                    </option>
                  `).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label class="form-label">Monto a Agregar (en moneda de la billetera)</label>
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

      // ✅ Listener para mostrar saldo disponible
      document.getElementById('saving-wallet').addEventListener('change', (e) => {
        const selected = e.target.options[e.target.selectedIndex];
        const balance = parseFloat(selected.dataset.balance) || 0;
        const currency = selected.dataset.currency || 'ARS';
        document.getElementById('wallet-balance-info').textContent =
          `Saldo disponible: ${this.formatCurrency(balance)} ${currency}`;
      });

      // ✅ SUBMIT DEFINITIVO
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
          const walletCurrency = wallet.currency || 'ARS';
          const savingCurrency = saving.currency || 'ARS';

          logger.log('💰 Iniciando aporte:', {
            amount,
            walletCurrency,
            savingCurrency,
            walletBalance: wallet.currentBalance
          });

          // ✅ Validar saldo en moneda de wallet ANTES de convertir
          if (wallet.currentBalance < amount) {
            throw new Error(`Saldo insuficiente. Disponible: ${this.formatCurrency(wallet.currentBalance)} ${walletCurrency}`);
          }

          // ✅ CRÍTICO: addContribution recibe el monto en moneda de wallet
          // y hace la conversión internamente guardando ambos valores
          const result = await this.app.savings.addContribution(
            id,
            amount,  // Monto en moneda de wallet
            walletId,
            description,
            this.app.currencyManager
          );

          logger.log('✅ Contribution guardada:', result);

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
            savingId: id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          await this.app.storage.saveTransactions(transactions);

          document.getElementById('add-saving-modal').remove();

          // ✅ Toast con info de conversión si aplica
          if (walletCurrency !== savingCurrency) {
            this.showToast(
              `✅ ${this.formatCurrency(amount)} ${walletCurrency} ` +
              `→ ${this.formatCurrency(result.contribution.amountInSavingCurrency)} ${savingCurrency} ` +
              `agregados a "${saving.name}"`,
              'success'
            );
          } else {
            this.showToast(
              `✅ ${this.formatCurrency(amount)} ${walletCurrency} agregados a "${saving.name}"`,
              'success'
            );
          }

          await this.modals.reloadAllViews();

        } catch (error) {
          console.error('❌ Error en addToSaving:', error);
          this.showToast('Error: ' + error.message, 'error');
        } finally {
          const submitBtn = document.querySelector('#add-saving-form button[type="submit"]');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '💰 Agregar';
          }
        }
      };

    } catch (error) {
      console.error('❌ Error abriendo modal addToSaving:', error);
      this.showToast('Error: ' + error.message, 'error');
    }
  }

  // ========================================
  // WALLETS
  // ========================================
  async loadWallets() {
    try {
      const wallets = await this.app.walletManager.getAll();
      this.renderWalletsList(wallets);
      await this.updateWalletStats(wallets);
    } catch (error) {
      console.error('Error loading wallets:', error);
      this.showToast('Error cargando cajas/billeteras: ' + error.message, 'error');
    }
  }

  renderWalletsList(wallets) {
    const container = document.getElementById('wallets-list');

    if (wallets.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <p>No hay cajas/billeteras configuradas</p>
            <p style="font-size: 14px; margin-top: 8px;">Crea tu primera caja para comenzar a organizar tu dinero</p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = wallets.map(wallet => {
      const balanceClass = wallet.currentBalance >= 0 ? 'balance-positive' : 'balance-negative';
      const typeClass = (wallet.type || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');

      return `
        <div class="card wallet-card ${typeClass}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
            <div style="flex: 1;">
              <h3 style="margin: 0 0 8px 0;">${wallet.name}</h3>
              <span class="currency-badge">${wallet.currency || 'ARS'} - ${wallet.type}</span>
              ${wallet.description ? `<p style="color: var(--text-secondary); font-size: 13px; margin: 8px 0 0 0;">${wallet.description}</p>` : ''}
            </div>
            
            <div style="display: flex; gap: 6px;">
              <button class="btn-icon" onclick="app.ui.editWallet('${wallet.id}')" title="Editar">✎</button>
              <button class="btn-icon" onclick="app.ui.deleteWallet('${wallet.id}')" title="Eliminar">×</button>
            </div>
          </div>
          
          <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 13px; color: var(--text-secondary); font-weight: 600;">Saldo actual:</span>
              <span class="${balanceClass}" style="font-size: 20px; font-weight: bold;">
                ${this.formatCurrency(wallet.currentBalance, wallet.currency || 'ARS')}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async updateWalletStats(wallets) {
    let totalInARS = 0;

    for (const wallet of wallets) {
      let balance = wallet.currentBalance;

      if (wallet.currency && wallet.currency !== 'ARS') {
        balance = await this.app.currencyManager.convertAmount(
          wallet.currentBalance,
          wallet.currency,
          'ARS'
        );
      }

      totalInARS += balance;
    }

    const avg = wallets.length > 0 ? totalInARS / wallets.length : 0;

    document.getElementById('total-wallets').textContent = this.formatCurrency(totalInARS);
    document.getElementById('wallets-count').textContent = wallets.length;
    document.getElementById('avg-wallet').textContent = this.formatCurrency(avg);
  }

  async editWallet(id) {
    try {
      const wallet = await this.app.walletManager.getById(id);
      this.modals.showWalletModal(wallet);
    } catch (error) {
      this.showToast('Error editando caja: ' + error.message, 'error');
    }
  }

  async deleteWallet(id) {
    try {
      const wallet = await this.app.walletManager.getById(id);
      const confirmed = await this.modals.showConfirm(
        'Eliminar caja/billetera',
        `¿Eliminar "${wallet.name}"?\n\nSaldo actual: ${this.formatCurrency(wallet.currentBalance, wallet.currency)}\n\nEsta acción no se puede deshacer. Primero vacie la caja para poder eliminarla.`
      );

      if (!confirmed) return;

      await this.app.walletManager.delete(id);
      this.showToast('Caja/billetera eliminada', 'success');
      await this.loadWallets();
      await this.loadDashboard();

    } catch (error) {
      this.showToast('Error: ' + error.message, 'error');
    }
  }

  // ========================================
  // SETTINGS
  // ========================================
  async loadSettings() {
    try {
      await this.loadUsers();
      await this.loadCards();
      await this.loadCategories();
    } catch (error) {
      console.error('Error loading settings:', error);
      this.showToast('Error cargando configuración: ' + error.message, 'error');
    }
  }

  async loadUsers() {
    try {
      const users = await this.app.users.getAll();
      const container = document.getElementById('users-list');

      if (!container) return;

      container.innerHTML = users.map(user => `
        <div class="list-item">
          <div style="flex: 1;">
            <strong>${user.name}</strong>
            <span style="margin-left: 8px; font-size: 12px; color: var(--text-secondary);">(${user.role})</span>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
              Usuario: ${user.username} • Creado: ${new Date(user.createdAt).toLocaleDateString('es-AR')}
            </div>
          </div>
          ${user.id !== 'admin' ? `
            <div style="display: flex; gap: 4px;">
              <button class="btn-icon" onclick="app.ui.editUser('${user.id}')" title="Editar">✎</button>
              <button class="btn-icon" onclick="app.ui.deleteUser('${user.id}')" title="Eliminar">×</button>
            </div>
          ` : '<span style="font-size: 11px; color: var(--text-secondary);">Admin principal</span>'}
        </div>
      `).join('');
      await this.refreshAccordionHeights();
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async editUser(id) {
    try {
      const user = await this.app.users.getById(id);
      this.modals.showUserModal(user);
    } catch (error) {
      this.showToast('Error editando usuario: ' + error.message, 'error');
    }
  }

  async deleteUser(id) {
    try {
      const user = await this.app.users.getById(id);

      const confirmed = await this.modals.showConfirm(
        'Eliminar usuario',
        `¿Eliminar usuario "${user.name}"?\n\nEsta acción no se puede deshacer.`
      );

      if (!confirmed) return;

      await this.app.users.delete(id);
      this.showToast('Usuario eliminado', 'success');
      await this.loadUsers();

    } catch (error) {
      this.showToast('Error eliminando usuario: ' + error.message, 'error');
    }
  }

  async loadCards() {
    try {
      const cards = await this.app.storage.getCards();
      const wallets = await this.app.walletManager.getAll();
      const container = document.getElementById('cards-list');

      if (!container) return;

      if (cards.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No hay tarjetas configuradas</p>';
        return;
      }

      container.innerHTML = cards.map(card => {
        const wallet = card.walletId ? wallets.find(w => w.id === card.walletId) : null;

        return `
          <div class="list-item">
            <div style="flex: 1;">
              <strong>${card.name}</strong>
              <span style="margin-left: 8px; font-size: 12px; color: var(--text-secondary);">
                ${card.type} • ${card.currency || 'ARS'}
                ${card.type === 'Crédito' && card.dueDay ? ` • Vto: día ${card.dueDay}` : ''}
              </span>
              ${wallet ? `
                <div style="font-size: 11px; color: var(--success); margin-top: 4px;">
                  Asociada a: ${wallet.name}
                </div>
              ` : ''}
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="btn-icon" onclick="app.ui.editCard('${card.id}')" title="Editar">✎</button>
              <button class="btn-icon" onclick="app.ui.deleteCard('${card.id}')" title="Eliminar">×</button>
            </div>
          </div>
        `;
      }).join('');
      await this.refreshAccordionHeights();
    } catch (error) {
      console.error('Error loading cards:', error);
    }
  }

  async editCard(id) {
    try {
      const cards = await this.app.storage.getCards();
      const card = cards.find(c => c.id === id);

      if (!card) {
        throw new Error('Tarjeta no encontrada');
      }

      this.modals.showCardModal(card);
    } catch (error) {
      this.showToast('Error editando tarjeta: ' + error.message, 'error');
    }
  }

  async deleteCard(id) {
    try {
      const confirmed = await this.modals.showConfirm(
        'Eliminar tarjeta',
        '¿Estás seguro de que quieres eliminar esta tarjeta?\n\nEsta acción no se puede deshacer.'
      );

      if (!confirmed) return;

      const cards = await this.app.storage.getCards();
      const updatedCards = cards.filter(c => c.id !== id);
      await this.app.storage.saveCards(updatedCards);

      this.showToast('Tarjeta eliminada', 'success');
      await this.loadCards();

    } catch (error) {
      this.showToast('Error eliminando tarjeta: ' + error.message, 'error');
    }
  }

  async loadCategories() {
    try {
      const categories = await this.app.storage.getCategories();
      const container = document.getElementById('categories-config');

      if (!container) return;

      container.innerHTML = `
        <div style="margin-bottom: 16px;">
          <h4 style="margin-bottom: 12px;">Categorías de Ingresos</h4>
          ${categories.income.map(cat => `
            <div class="list-item">
              <div style="flex: 1;">
                <strong>${cat.name}</strong>
                ${cat.subs?.length > 0 ? `
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    Subcategorías: ${cat.subs.join(', ')}
                  </div>
                ` : ''}
              </div>
              <div style="display: flex; gap: 4px;">
                <button class="btn-icon" onclick="app.ui.modals.showEditCategoryModal('income', '${cat.name}')" title="Editar">✎</button>
                <button class="btn-icon" onclick="app.ui.deleteCategory('income', '${cat.name}')" title="Eliminar">×</button>
              </div>
            </div>
          `).join('')}
          <button class="btn btn-sm btn-primary" onclick="app.ui.modals.showAddCategoryModal('income')" style="margin-top: 8px;">
            + Agregar Categoría de Ingreso
          </button>
        </div>
        
        <div>
          <h4 style="margin-bottom: 12px;">Categorías de Gastos</h4>
          ${categories.expense.map(cat => `
            <div class="list-item">
              <div style="flex: 1;">
                <strong>${cat.name}</strong>
                ${cat.subs?.length > 0 ? `
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    Subcategorías: ${cat.subs.join(', ')}
                  </div>
                ` : ''}
              </div>
              <div style="display: flex; gap: 4px;">
                <button class="btn-icon" onclick="app.ui.modals.showEditCategoryModal('expense', '${cat.name}')" title="Editar">✎</button>
                <button class="btn-icon" onclick="app.ui.deleteCategory('expense', '${cat.name}')" title="Eliminar">×</button>
              </div>
            </div>
          `).join('')}
          <button class="btn btn-sm btn-primary" onclick="app.ui.modals.showAddCategoryModal('expense')" style="margin-top: 8px; margin-bottom: 20px;">
            + Agregar Categoría de Gasto
          </button>
        </div>
      `;
      await this.refreshAccordionHeights();
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }

  async deleteCategory(type, name) {
    const confirmed = await this.modals.showConfirm(
      'Eliminar categoría',
      `¿Eliminar la categoría "${name}"?\n\nLas transacciones con esta categoría no se eliminarán.`
    );

    if (!confirmed) return;

    try {
      const categories = await this.app.storage.getCategories();
      categories[type] = categories[type].filter(c => c.name !== name);
      await this.app.storage.saveCategories(categories);
      this.showToast('Categoría eliminada', 'success');
      await this.loadCategories();
    } catch (error) {
      this.showToast('Error: ' + error.message, 'error');
    }
  }

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================
  getCurrencySymbol(currency) {
    const symbols = {
      'ARS': '$',
      'USD': 'US$',
      'EUR': '€'
    };
    return symbols[currency] || '$';
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  formatDate(dateString) {
    if (!dateString) return 'Sin fecha';
    try {
      // Usar UTC siempre para evitar el desfase de un día por zona horaria local
      const date = new Date(dateString);
      
      // Si la fecha es inválida, retornar el string tal cual
      if (isNaN(date.getTime())) return dateString;

      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const year = date.getUTCFullYear();
      
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Determinar íconos según tipo
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    // Determinar duración (mínimo 3.5 segundos para que se alcance a leer)
    let duration = type === 'error' ? 6000 : 3500;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Contenido del toast (ya no usamos estilos en línea aquí)
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 18px;">${icons[type] || ''}</span>
        <span>${message}</span>
      </div>
      <button class="toast-close">&times;</button>
    `;

    // Botón de cerrar manual
    toast.querySelector('.toast-close').onclick = () => this.hideToast(toast);

    container.appendChild(toast);

    // Auto-ocultar después de la duración
    setTimeout(() => this.hideToast(toast), duration);
  }

  hideToast(toast) {
    if (!toast || toast.classList.contains('hiding')) return;
    
    toast.classList.add('hiding');
    // Esperar a que termine la animación de salida (definida en CSS como 0.3s)
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 300);
  }

  toggleSidebar() {
    const container = document.querySelector('.app-container');
    container.classList.toggle('sidebar-collapsed');

    const isCollapsed = container.classList.contains('sidebar-collapsed');
    localStorage.setItem('sidebar-collapsed', isCollapsed);
  }

  toggleAccordion(header) {
    const accordion = header.closest('.accordion-item');
    const content = accordion.querySelector('.accordion-content');
    const isActive = accordion.classList.contains('active');

    if (isActive) {
      // Necesitamos pasar de 'none' a un valor en px para que el navegador pueda animar el cierre
      if (content.style.maxHeight === 'none' || !content.style.maxHeight) {
        content.style.maxHeight = content.scrollHeight + 'px';
        content.offsetHeight; // Forzar reflow
      }
      
      accordion.classList.remove('active');
      setTimeout(() => {
        content.style.maxHeight = '0';
        content.style.overflow = 'hidden';
      }, 10);
    } else {
      accordion.classList.add('active');
      content.style.maxHeight = content.scrollHeight + 'px';
      content.style.overflow = 'hidden';
      
      // Al terminar la animación, permitimos que crezca solo
      setTimeout(() => {
        if (accordion.classList.contains('active')) {
          content.style.maxHeight = 'none';
          content.style.overflow = 'visible';
        }
      }, 450); // Un poco más del tiempo de la transición CSS (0.4s)
    }
  }

  async refreshAccordionHeights() {
    const activeAccordions = document.querySelectorAll('.accordion-item.active');
    activeAccordions.forEach(acc => {
      const content = acc.querySelector('.accordion-content');
      if (content && content.style.maxHeight !== 'none') {
        content.style.maxHeight = content.scrollHeight + 'px';
      }
    });
  }

  // ============================================
  // SISTEMA DE LOGIN Y RECUPERACIÓN
  // ============================================

  setupLoginListener() {
    // Verificar si ya hay sesión activa
    const currentUser = this.app.auth.getCurrentUser();
    if (currentUser) {
      logger.log('✅ Sesión activa detectada:', currentUser.username);
      document.getElementById('login-screen').classList.remove('active');
      return;
    }

    // Setup de vistas
    this.setupLoginView();
    this.setupRecoveryViews();
  }

  setupLoginView() {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit-btn');
    const rememberMeCheckbox = document.getElementById('remember-me');
    const showRecoveryBtn = document.getElementById('show-recovery-btn');

    if (!loginForm) {
      console.error('❌ Formulario de login no encontrado');
      return;
    }

    // Validación en tiempo real
    usernameInput?.addEventListener('input', () => {
      this.validateLoginField(usernameInput, 'username');
    });

    passwordInput?.addEventListener('input', () => {
      this.validateLoginField(passwordInput, 'password');
    });

    // Submit del formulario
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      const rememberMe = rememberMeCheckbox?.checked || false;

      // Validar campos
      const usernameValid = this.validateLoginField(usernameInput, 'username');
      const passwordValid = this.validateLoginField(passwordInput, 'password');

      if (!usernameValid || !passwordValid) {
        return;
      }

      // Mostrar loader
      this.toggleLoginLoader(submitBtn, true);

      try {
        const result = await this.app.auth.login(username, password, rememberMe);

        if (result.success) {
          await this.app.auditLog.log('login', 'user', result.user.id, {
            timestamp: new Date().toISOString(),
            rememberMe
          });

          document.getElementById('login-screen').classList.remove('active');
          await this.app.initialize();
          await this.init();

          this.showToast('¡Bienvenido a FinanzApp!', 'success');
        } else {
          passwordInput.classList.add('invalid');
          document.getElementById('password-error').textContent = result.message || 'Credenciales incorrectas';
          this.showToast(result.message || 'Error al iniciar sesión', 'error');
        }
      } catch (error) {
        console.error('Error en login:', error);
        this.showToast('Error al iniciar sesión', 'error');
      } finally {
        this.toggleLoginLoader(submitBtn, false);
      }
    });

    // Mostrar recuperación
    showRecoveryBtn?.addEventListener('click', () => {
      this.switchLoginView('recovery-view-1');
    });
  }

  setupRecoveryViews() {
    // Paso 1: Solicitar username
    const recoveryForm1 = document.getElementById('recovery-form-1');
    const backBtn1 = document.getElementById('back-to-login-1');

    if (recoveryForm1) {
      // Remover listeners anteriores
      const newForm1 = recoveryForm1.cloneNode(true);
      recoveryForm1.parentNode.replaceChild(newForm1, recoveryForm1);

      newForm1.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleRecoveryStep1();
      });
    }

    if (backBtn1) {
      backBtn1.addEventListener('click', () => {
        this.switchLoginView('login-view');
        this.clearRecoveryAttempts();
      });
    }

    // Paso 2: Pregunta de seguridad
    // En setupEventListeners(), buscar el listener de recovery-form-2
    document.getElementById('recovery-form-2')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('recovery-username-stored').value;
      const answer = document.getElementById('security-answer').value;
      const errorSpan = document.getElementById('security-answer-error');
      const attemptsInfo = document.getElementById('recovery-attempts-info');

      errorSpan.textContent = '';

      if (!answer) {
        errorSpan.textContent = 'Por favor ingresa tu respuesta';
        return;
      }

      try {
        // Verificar respuesta usando el método del UserManager
        const isValid = await this.app.users.verifySecurityAnswer(username, answer);

        if (isValid) {
          // Respuesta correcta - ir a paso 3
          document.getElementById('recovery-username-final').value = username;

          // Ocultar vista 2, mostrar vista 3
          document.getElementById('recovery-view-2').classList.remove('active');
          document.getElementById('recovery-view-3').classList.add('active');

          // Limpiar formulario
          document.getElementById('recovery-form-2').reset();

        } else {
          // Respuesta incorrecta
          errorSpan.textContent = 'Respuesta incorrecta';
          document.getElementById('security-answer').value = '';
          document.getElementById('security-answer').focus();
        }

      } catch (error) {
        console.error('Error al verificar respuesta:', error);
        errorSpan.textContent = 'Error al verificar la respuesta';
      }
    });

    const backBtn2 = document.getElementById('back-to-recovery-1');
    if (backBtn2) {
      backBtn2.addEventListener('click', () => {
        this.switchLoginView('recovery-view-1');
        this.clearRecoveryAttempts();
      });
    }

    // Paso 3: Nueva contraseña
    const recoveryForm3 = document.getElementById('recovery-form-3');

    if (backBtn2) {
      backBtn2.addEventListener('click', () => {
        this.switchLoginView('recovery-view-1');
        this.clearRecoveryAttempts();
      });
    }

    if (recoveryForm3) {
      // Remover listeners anteriores
      const newForm3 = recoveryForm3.cloneNode(true);
      recoveryForm3.parentNode.replaceChild(newForm3, recoveryForm3);

      newForm3.addEventListener('submit', async (e) => {
        e.preventDefault();
        logger.log('✅ Formulario 3 submit capturado');
        await this.handleRecoveryStep3();
      });

      logger.log('✅ Listener agregado al formulario recovery-form-3');
    } else {
      console.error('❌ Formulario recovery-form-3 no encontrado');
    }
  }

  switchLoginView(viewId) {
    // Ocultar todas las vistas
    document.querySelectorAll('.login-view').forEach(view => {
      view.classList.remove('active');
    });

    // Mostrar vista solicitada
    const targetView = document.getElementById(viewId);
    if (targetView) {
      targetView.classList.add('active');

      // Limpiar errores
      this.clearLoginErrors();

      // Focus en primer input
      const firstInput = targetView.querySelector('.form-input');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    }
  }

  clearLoginErrors() {
    const errorIds = [
      'username-error',
      'password-error',
      'recovery-username-error',
      'security-answer-error',
      'new-password-error',
      'confirm-password-error'
    ];

    errorIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });

    document.querySelectorAll('.form-input').forEach(input => {
      input.classList.remove('valid', 'invalid');
    });
  }

  async handleRecoveryStep1() {
    const usernameInput = document.getElementById('recovery-username');
    const username = usernameInput.value.trim();
    const errorEl = document.getElementById('recovery-username-error');

    // Validar
    if (!username) {
      usernameInput.classList.add('invalid');
      errorEl.textContent = 'El usuario es requerido';
      return;
    }

    if (username.length < 3) {
      usernameInput.classList.add('invalid');
      errorEl.textContent = 'Usuario inválido';
      return;
    }

    try {
      // Obtener pregunta de seguridad
      const result = await this.app.users.getSecurityQuestion(username);

      if (!result.found) {
        usernameInput.classList.add('invalid');
        errorEl.textContent = result.message || 'Usuario no encontrado o sin pregunta configurada';
        return;
      }

      // Guardar username y mostrar pregunta
      document.getElementById('recovery-username-stored').value = username;
      document.getElementById('security-question-text').textContent = result.question;

      // Cambiar a paso 2
      this.switchLoginView('recovery-view-2');
      this.initRecoveryAttempts(username);

    } catch (error) {
      console.error('Error en recuperación:', error);
      this.showToast('Error al procesar solicitud', 'error');
    }
  }

  initRecoveryAttempts(username) {
    const key = `recovery_attempts_${username.toLowerCase()}`;
    const stored = localStorage.getItem(key);

    if (!stored) {
      localStorage.setItem(key, JSON.stringify({
        count: 0,
        lockedUntil: null
      }));
    }

    // Ocultar el cuadro si no hay intentos
    const attemptsInfo = document.getElementById('recovery-attempts-info');
    if (attemptsInfo) {
      const data = JSON.parse(localStorage.getItem(key) || '{"count":0,"lockedUntil":null}');

      if (data.count === 0 && !data.lockedUntil) {
        attemptsInfo.style.display = 'none'; // ✅ Ocultar inicialmente
      } else {
        attemptsInfo.style.display = 'block';
        this.updateRecoveryAttemptsDisplay(username);
      }
    }
  }

  updateRecoveryAttemptsDisplay(username) {
    const key = `recovery_attempts_${username.toLowerCase()}`;
    const stored = localStorage.getItem(key);
    const attemptsInfo = document.getElementById('recovery-attempts-info');

    if (!stored || !attemptsInfo) return;

    const data = JSON.parse(stored);
    const remaining = 3 - data.count;

    if (data.lockedUntil && Date.now() < data.lockedUntil) {
      const minutes = Math.ceil((data.lockedUntil - Date.now()) / 60000);
      attemptsInfo.innerHTML = `⚠️ Cuenta bloqueada. Intenta en ${minutes} minutos`;
      attemptsInfo.classList.add('danger');
    } else if (remaining < 3) {
      attemptsInfo.innerHTML = `⚠️ ${remaining} ${remaining === 1 ? 'intento restante' : 'intentos restantes'}`;
      attemptsInfo.classList.remove('danger');
      if (remaining === 1) attemptsInfo.classList.add('danger');
    } else {
      attemptsInfo.innerHTML = '';
    }
  }

  async handleRecoveryStep2() {
    const username = document.getElementById('recovery-username-stored').value;
    const answerInput = document.getElementById('security-answer');
    const answer = answerInput.value.trim();
    const errorEl = document.getElementById('security-answer-error');
    const submitBtn = document.getElementById('verify-answer-btn');
    const attemptsInfo = document.getElementById('recovery-attempts-info');

    // Validar
    if (!answer) {
      answerInput.classList.add('invalid');
      errorEl.textContent = 'La respuesta es requerida';
      return;
    }

    if (answer.length < 2) {
      answerInput.classList.add('invalid');
      errorEl.textContent = 'Respuesta muy corta';
      return;
    }

    // Verificar si está bloqueado
    const key = `recovery_attempts_${username.toLowerCase()}`;
    const stored = JSON.parse(localStorage.getItem(key) || '{"count":0,"lockedUntil":null}');

    if (stored.lockedUntil && Date.now() < stored.lockedUntil) {
      const minutes = Math.ceil((stored.lockedUntil - Date.now()) / 60000);
      this.showToast(`Cuenta bloqueada. Intenta en ${minutes} minutos`, 'error');
      return;
    }

    this.toggleLoginLoader(submitBtn, true);

    try {
      const result = await this.app.users.verifySecurityAnswer(username, answer);

      if (result.valid) {
        // Limpiar intentos
        localStorage.removeItem(key);

        // Guardar username para paso 3
        document.getElementById('recovery-username-final').value = username;

        // Cambiar a paso 3
        this.switchLoginView('recovery-view-3');
        this.showToast('Respuesta correcta', 'success');

      } else {
        // Registrar intento fallido
        stored.count = (stored.count || 0) + 1;

        if (stored.count >= 3) {
          stored.lockedUntil = Date.now() + (15 * 60 * 1000); // 15 minutos
          localStorage.setItem(key, JSON.stringify(stored));

          answerInput.classList.add('invalid');
          errorEl.textContent = 'Cuenta bloqueada por múltiples intentos';
          this.showToast('Cuenta bloqueada por 15 minutos', 'error');

          // Mostrar y actualizar display
          if (attemptsInfo) {
            attemptsInfo.style.display = 'block';
            attemptsInfo.innerHTML = `⚠️ Cuenta bloqueada. Intenta en 15 minutos`;
            attemptsInfo.classList.add('danger');
          }

        } else {
          localStorage.setItem(key, JSON.stringify(stored));

          const remaining = 3 - stored.count;
          answerInput.classList.add('invalid');
          errorEl.textContent = `Respuesta incorrecta. ${remaining} ${remaining === 1 ? 'intento restante' : 'intentos restantes'}`;
          this.showToast(errorEl.textContent, 'error');

          // Mostrar y actualizar display
          if (attemptsInfo) {
            attemptsInfo.style.display = 'block';
            attemptsInfo.innerHTML = `⚠️ ${remaining} ${remaining === 1 ? 'intento restante' : 'intentos restantes'}`;
            attemptsInfo.classList.remove('danger');
            if (remaining === 1) attemptsInfo.classList.add('danger');
          }
        }
      }

    } catch (error) {
      console.error('Error verificando respuesta:', error);
      this.showToast('Error al verificar respuesta', 'error');
    } finally {
      this.toggleLoginLoader(submitBtn, false);
    }
  }

  async handleRecoveryStep3() {
    logger.log('🔐 Iniciando cambio de contraseña...');

    const username = document.getElementById('recovery-username-final').value;
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');

    if (!username) {
      console.error('❌ Username no encontrado');
      this.showToast('Error: Usuario no identificado', 'error');
      return;
    }

    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    logger.log('📝 Validando contraseñas...');

    // Limpiar errores
    this.clearLoginErrors();

    // Validaciones
    let hasErrors = false;

    if (!newPassword || newPassword.length < 6) {
      newPasswordInput.classList.add('invalid');
      document.getElementById('new-password-error').textContent = 'Mínimo 6 caracteres';
      hasErrors = true;
    }

    if (newPassword !== confirmPassword) {
      confirmPasswordInput.classList.add('invalid');
      document.getElementById('confirm-password-error').textContent = 'Las contraseñas no coinciden';
      hasErrors = true;
    }

    if (hasErrors) {
      logger.log('❌ Validación fallida');
      return;
    }

    try {
      logger.log('🔄 Obteniendo usuarios...');
      const users = await this.app.storage.getUsers();
      const userIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());

      if (userIndex === -1) {
        throw new Error('Usuario no encontrado');
      }

      logger.log('✅ Usuario encontrado:', users[userIndex].username);
      logger.log('🔐 Hasheando nueva contraseña...');

      // Importar CryptoUtils
      const { CryptoUtils } = await import('../utils/crypto.js');
      const passwordHash = await CryptoUtils.hashPassword(newPassword);

      logger.log('💾 Guardando nueva contraseña...');
      users[userIndex].passwordHash = passwordHash;
      users[userIndex].updatedAt = new Date().toISOString();

      await this.app.storage.saveUsers(users);

      logger.log('✅ Contraseña actualizada correctamente');
      this.showToast('Contraseña actualizada correctamente', 'success');

      // Volver al login
      this.switchLoginView('login-view');
      this.clearRecoveryAttempts();

      // Limpiar formularios
      const loginForm = document.getElementById('login-form');
      if (loginForm) {
        loginForm.reset();
      }

    } catch (error) {
      console.error('❌ Error actualizando contraseña:', error);
      this.showToast(error.message || 'Error al actualizar contraseña', 'error');
    }
  }

  clearRecoveryAttempts() {
    // Limpiar intentos de recuperación al volver al login
    const username = document.getElementById('recovery-username-stored')?.value;
    if (username) {
      const key = `recovery_attempts_${username.toLowerCase()}`;
      localStorage.removeItem(key);
    }
  }

  validateLoginField(input, type) {
    const value = input.value.trim();
    const errorEl = document.getElementById(`${type}-error`);

    input.classList.remove('valid', 'invalid');
    if (errorEl) errorEl.textContent = '';

    if (!value) {
      input.classList.add('invalid');
      if (errorEl) errorEl.textContent = 'Campo requerido';
      return false;
    }

    if (type === 'username' && value.length < 3) {
      input.classList.add('invalid');
      if (errorEl) errorEl.textContent = 'Mínimo 3 caracteres';
      return false;
    }

    if (type === 'password' && value.length < 6) {
      input.classList.add('invalid');
      if (errorEl) errorEl.textContent = 'Mínimo 6 caracteres';
      return false;
    }

    input.classList.add('valid');
    return true;
  }

  toggleLoginLoader(button, show) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');

    if (show) {
      btnText.style.display = 'none';
      btnLoader.style.display = 'flex';
      button.disabled = true;
    } else {
      btnText.style.display = 'flex';
      btnLoader.style.display = 'none';
      button.disabled = false;
    }
  }

  setupRecoveryModal() {
    const recoveryForm = document.getElementById('recovery-form');
    const resetForm = document.getElementById('reset-form');
    const cancelRecoveryBtn = document.getElementById('cancel-recovery-btn');
    const cancelResetBtn = document.getElementById('cancel-reset-btn');

    // Paso 1: Solicitar token
    recoveryForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleRecoveryRequest();
    });

    // Paso 2: Resetear contraseña
    resetForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handlePasswordReset();
    });

    // Botones de cancelar
    cancelRecoveryBtn?.addEventListener('click', () => this.closeRecoveryModal());
    cancelResetBtn?.addEventListener('click', () => this.closeRecoveryModal());
  }

  showRecoveryModal() {
    const modal = document.getElementById('recovery-modal');
    const step1 = document.getElementById('recovery-step-1');
    const step2 = document.getElementById('recovery-step-2');

    // Resetear formularios
    document.getElementById('recovery-form')?.reset();
    document.getElementById('reset-form')?.reset();
    this.clearRecoveryErrors();

    // Mostrar paso 1
    step1.style.display = 'block';
    step2.style.display = 'none';

    modal.classList.add('active');
  }

  closeRecoveryModal() {
    const modal = document.getElementById('recovery-modal');
    modal.classList.remove('active');
    this.clearRecoveryErrors();
  }

  clearRecoveryErrors() {
    const errorIds = [
      'recovery-email-error',
      'recovery-token-error',
      'new-password-error',
      'confirm-password-error'
    ];

    errorIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });

    const inputs = document.querySelectorAll('#recovery-modal .form-input');
    inputs.forEach(input => input.classList.remove('valid', 'invalid'));
  }

  async handlePasswordReset() {
    try {
      logger.log('🔐 Iniciando cambio de contraseña...');

      const username = document.getElementById('recovery-username-final').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      // Limpiar errores previos
      document.getElementById('new-password-error').textContent = '';
      document.getElementById('confirm-password-error').textContent = '';

      logger.log('📝 Validando contraseñas...');

      // Validaciones
      const errors = [];

      if (!newPassword) {
        errors.push({ field: 'new-password-error', message: 'La contraseña es requerida' });
      } else if (newPassword.length < 6) {
        errors.push({ field: 'new-password-error', message: 'Mínimo 6 caracteres' });
      }

      if (!confirmPassword) {
        errors.push({ field: 'confirm-password-error', message: 'Confirma tu contraseña' });
      } else if (newPassword !== confirmPassword) {
        errors.push({ field: 'confirm-password-error', message: 'Las contraseñas no coinciden' });
      }

      if (errors.length > 0) {
        logger.log('❌ Validación fallida');
        errors.forEach(err => {
          document.getElementById(err.field).textContent = err.message;
        });
        return;
      }

      try {
        logger.log('🔄 Obteniendo usuarios...');
        const users = await this.app.storage.getUsers();
        const userIndex = users.findIndex(u => u.username === username);

        if (userIndex === -1) {
          throw new Error('Usuario no encontrado');
        }

        logger.log('✅ Usuario encontrado:', users[userIndex].username);
        logger.log('🔐 Hasheando nueva contraseña...');

        // Hashear nueva contraseña
        const passwordHash = await dcodeIO.bcrypt.hash(newPassword, 10);

        // Actualizar usuario
        logger.log('💾 Guardando nueva contraseña...');
        users[userIndex].passwordHash = passwordHash;
        users[userIndex].updatedAt = new Date().toISOString();

        // Eliminar campo 'password' si existe (migración)
        delete users[userIndex].password;

        await this.app.storage.saveUsers(users);

        logger.log('✅ Contraseña actualizada correctamente');

        // Cerrar modal de recuperación
        this.closeRecoveryModal();

        // Mostrar éxito
        this.showToast('✅ Contraseña actualizada correctamente. Ahora puedes iniciar sesión.', 'success');

        // Limpiar formularios
        document.getElementById('recovery-form-3').reset();

      } catch (error) {
        console.error('Error al actualizar contraseña:', error);
        this.showToast('Error al actualizar la contraseña', 'error');
      }

    } catch (error) {
      console.error('Error en handlePasswordReset:', error);
      this.showToast('Error inesperado', 'error');
    }
  }

  renderTransactionsTrendChart(transactions) {
    const canvas = document.getElementById('transactions-trend-chart');
    if (!canvas) return;

    const showIncome = document.getElementById('tx-chart-show-income')?.checked ?? true;
    const showExpenses = document.getElementById('tx-chart-show-expenses')?.checked ?? true;
    const showBalance = document.getElementById('tx-chart-show-balance')?.checked ?? false;

    // Determinar el período de agrupación según el filtro activo
    const periodFilter = document.getElementById('tx-filter-period')?.value || 'month';

    // Decidir granularidad: día para períodos cortos, mes para períodos largos
    const useDaily = ['week', 'month', 'custom'].includes(periodFilter);

    const groupedData = {};

    // Agrupar transacciones existentes (excluir transferencias)
    transactions.forEach(tx => {
      // ✅ EXCLUIR transferencias entre cajas propias
      if (tx.category === 'Transferencia') {
        return; // Saltar esta transacción
      }

      const date = new Date(tx.date);
      let key;

      // ✅ USAR UTC para evitar problemas de zona horaria (UTC-3 vs UTC)
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();

      if (useDaily) {
        key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      } else {
        key = `${year}-${String(month).padStart(2, '0')}`;
      }

      if (!groupedData[key]) {
        groupedData[key] = { income: 0, expenses: 0, count: 0 };
      }

      if (tx.type === 'income') {
        groupedData[key].income += tx.amount;
      } else {
        groupedData[key].expenses += tx.amount;
      }
      groupedData[key].count++;
    });

    // ✅ RELLENAR PERÍODOS FALTANTES CON CEROS
    let allKeys = [];

    if (useDaily && periodFilter === 'month') {
      // Rellenar todos los días del mes actual
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (!groupedData[key]) {
          groupedData[key] = { income: 0, expenses: 0, count: 0 };
        }
        allKeys.push(key);
      }
    } else if (!useDaily && ['quarter', 'year'].includes(periodFilter)) {
      // Rellenar meses según el período
      const now = new Date();
      const year = now.getFullYear();

      let startMonth, endMonth;

      if (periodFilter === 'quarter') {
        // Determinar trimestre actual (Q1: 1-3, Q2: 4-6, Q3: 7-9, Q4: 10-12)
        const currentMonth = now.getMonth() + 1; // 1-12
        const currentQuarter = Math.ceil(currentMonth / 3);
        startMonth = (currentQuarter - 1) * 3 + 1;
        endMonth = currentQuarter * 3;
      } else {
        // Año completo
        startMonth = 1;
        endMonth = 12;
      }

      for (let month = startMonth; month <= endMonth; month++) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        if (!groupedData[key]) {
          groupedData[key] = { income: 0, expenses: 0, count: 0 };
        }
        allKeys.push(key);
      }
    } else {
      // Para otros casos, usar solo las claves existentes
      allKeys = Object.keys(groupedData);
    }

    // Ordenar por fecha
    const sortedKeys = allKeys.sort();

    // Preparar datos para el gráfico
    const labels = sortedKeys.map(key => {
      if (useDaily) {
        const [year, month, day] = key.split('-');
        const date = new Date(year, parseInt(month) - 1, parseInt(day));
        return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
      } else {
        const [year, month] = key.split('-');
        const date = new Date(year, parseInt(month) - 1);
        return date.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
      }
    });

    const incomeData = sortedKeys.map(key => groupedData[key]?.income || 0);
    const expensesData = sortedKeys.map(key => groupedData[key]?.expenses || 0);
    const balanceData = sortedKeys.map(key => (groupedData[key]?.income || 0) - (groupedData[key]?.expenses || 0));

    // Calcular totales
    const totalIncome = incomeData.reduce((sum, val) => sum + val, 0);
    const totalExpenses = expensesData.reduce((sum, val) => sum + val, 0);
    const totalBalance = totalIncome - totalExpenses;
    const totalTransactions = transactions.length;

    // Actualizar resumen
    const summaryEl = document.getElementById('tx-chart-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
          <div>
            <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">TOTAL INGRESOS</div>
            <div style="color: var(--success); font-weight: 700; font-size: 16px;">${this.formatCurrency(totalIncome)}</div>
          </div>
          <div>
            <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">TOTAL GASTOS</div>
            <div style="color: var(--danger); font-weight: 700; font-size: 16px;">${this.formatCurrency(totalExpenses)}</div>
          </div>
          <div>
            <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">BALANCE</div>
            <div style="color: ${totalBalance >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 700; font-size: 16px;">${this.formatCurrency(totalBalance)}</div>
          </div>
          <div>
            <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">TRANSACCIONES</div>
            <div style="color: var(--text-primary); font-weight: 700; font-size: 16px;">${totalTransactions}</div>
          </div>
        </div>
      `;
    }

    // Destruir gráfico anterior si existe
    if (this.charts.transactionsTrend) {
      this.charts.transactionsTrend.destroy();
    }

    // Crear datasets según checkboxes
    const datasets = [];

    if (showIncome) {
      datasets.push({
        label: 'Ingresos',
        data: incomeData,
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        fill: true
      });
    }

    if (showExpenses) {
      datasets.push({
        label: 'Gastos',
        data: expensesData,
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: true
      });
    }

    if (showBalance) {
      datasets.push({
        label: 'Balance',
        data: balanceData,
        borderColor: 'rgb(79, 70, 229)',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        tension: 0.4,
        fill: true
      });
    }

    // Crear gráfico
    this.charts.transactionsTrend = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: 'rgb(241, 245, 249)',
              font: { size: 12 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: 'rgb(241, 245, 249)',
            bodyColor: 'rgb(241, 245, 249)',
            borderColor: 'rgb(71, 85, 105)',
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            callbacks: {
              label: (context) => {
                return `${context.dataset.label}: ${this.formatCurrency(context.parsed.y)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: 'rgb(148, 163, 184)',
              callback: (value) => {
                return '$' + value.toLocaleString('es-AR');
              }
            },
            grid: {
              color: 'rgba(71, 85, 105, 0.3)'
            }
          },
          x: {
            ticks: {
              color: 'rgb(148, 163, 184)',
              maxRotation: 45,
              minRotation: 0
            },
            grid: {
              color: 'rgba(71, 85, 105, 0.3)'
            }
          }
        }
      }
    });
  }

  clearTransactionFilters() {
    // Limpiar todos los campos de filtro
    const searchInput = document.getElementById('tx-search');
    const typeSelect = document.getElementById('tx-filter-type');
    const categorySelect = document.getElementById('tx-filter-category');
    const subcategorySelect = document.getElementById('tx-filter-subcategory');
    const userSelect = document.getElementById('tx-filter-user');
    const paymentSelect = document.getElementById('tx-filter-payment');
    const periodSelect = document.getElementById('tx-filter-period');
    const startDateInput = document.getElementById('tx-filter-start-date');
    const endDateInput = document.getElementById('tx-filter-end-date');
    const customDateRange = document.getElementById('tx-custom-date-range');

    if (searchInput) searchInput.value = '';
    if (typeSelect) typeSelect.value = '';
    if (categorySelect) categorySelect.value = '';
    if (subcategorySelect) subcategorySelect.value = '';
    if (userSelect) userSelect.value = '';
    if (paymentSelect) paymentSelect.value = '';
    if (periodSelect) periodSelect.value = 'month';
    if (startDateInput) startDateInput.value = '';
    if (endDateInput) endDateInput.value = '';
    if (customDateRange) customDateRange.style.display = 'none';

    // Recargar categorías y subcategorías
    this.loadCategoriesFilter();

    // Habilitar subcategorías
    if (subcategorySelect) {
      subcategorySelect.disabled = false;
      subcategorySelect.innerHTML = '<option value="">Todas las subcategorías</option>';
    }

    // Resetear paginación
    this.currentPage = 1;

    // Aplicar filtros (que ahora están vacíos)
    this.filterTransactions();

    // Mostrar toast
    this.showToast('Filtros restablecidos', 'success');
  }

  async payInstallmentManually(transactionId) {
    try {
      logger.log('💳 Intentando pagar cuota:', transactionId);

      const transaction = await this.app.transactions.getById(transactionId);
      logger.log('Transacción encontrada:', transaction);

      if (!transaction.isInstallment) {
        this.showToast('Esta transacción no es una cuota', 'error');
        return;
      }

      if (transaction.autoCharged) {
        this.showToast('Esta cuota ya fue pagada', 'info');
        return;
      }

      // Buscar la tarjeta asociada
      const cards = await this.app.storage.getCards();
      logger.log('Tarjetas disponibles:', cards);
      logger.log('Buscando tarjeta:', transaction.card);

      const card = cards.find(c => c.name === transaction.card);

      if (!card) {
        this.showToast('No se encontró la tarjeta asociada a esta cuota', 'error');
        console.error('Tarjeta no encontrada. Tarjeta buscada:', transaction.card);
        return;
      }

      if (!card.walletId) {
        this.showToast('La tarjeta no tiene una wallet asociada. Configúrala en el módulo de Tarjetas.', 'error');
        return;
      }

      // Verificar saldo
      const wallet = await this.app.walletManager.getById(card.walletId);
      logger.log('Wallet encontrada:', wallet);

      const confirmed = await this.modals.showConfirm(
        'Pagar Cuota',
        `¿Descontar ${this.formatCurrency(transaction.amount)} de ${wallet.name}?\n\nCuota ${transaction.installmentInfo.current}/${transaction.installmentInfo.total}\n${transaction.description}\n\nSaldo actual: ${this.formatCurrency(wallet.currentBalance)}`
      );

      if (!confirmed) return;

      // Verificar si hay saldo suficiente
      if (wallet.currentBalance < transaction.amount) {
        const forceConfirm = await this.modals.showConfirm(
          'Saldo Insuficiente',
          `⚠️ El saldo actual (${this.formatCurrency(wallet.currentBalance)}) es menor que la cuota (${this.formatCurrency(transaction.amount)}).\n\n¿Deseas marcarla como pagada de todas formas?\n\nNOTA: Esto NO descontará dinero de la wallet.`
        );

        if (!forceConfirm) return;

        // Solo marcar como pagada sin descontar
        const transactions = await this.app.storage.getTransactions();
        const index = transactions.findIndex(t => t.id === transactionId);

        if (index !== -1) {
          transactions[index].autoCharged = true;
          transactions[index].autoChargedDate = new Date().toISOString();
          transactions[index].manualPayment = true;
          transactions[index].paidWithoutBalance = true; // Indicador especial
          transactions[index].updatedAt = new Date().toISOString();

          await this.app.storage.saveTransactions(transactions);

          this.showToast('⚠️ Cuota marcada como pagada (sin descuento)', 'warning');
          await this.filterTransactions();
          await this.loadDashboard();
        }

        return;
      }

      // Descontar de wallet
      await this.app.walletManager.updateBalance(
        card.walletId,
        transaction.amount,
        'subtract'
      );

      // Marcar como pagada
      const transactions = await this.app.storage.getTransactions();
      const index = transactions.findIndex(t => t.id === transactionId);

      if (index !== -1) {
        transactions[index].autoCharged = true;
        transactions[index].autoChargedDate = new Date().toISOString();
        transactions[index].manualPayment = true;
        transactions[index].updatedAt = new Date().toISOString();

        await this.app.storage.saveTransactions(transactions);

        this.showToast('✅ Cuota pagada exitosamente', 'success');
        await this.filterTransactions();
        await this.loadDashboard();
      }

    } catch (error) {
      console.error('Error pagando cuota:', error);
      this.showToast('Error al pagar la cuota: ' + error.message, 'error');
    }
  }

  // 🆕 NUEVA FUNCIÓN: Deshacer pago de cuota
  async undoInstallmentPayment(transactionId) {
    try {
      const confirmed = await this.modals.showConfirm(
        '⚠️ Deshacer Pago',
        '¿Deseas marcar esta cuota como PENDIENTE nuevamente?\n\n' +
        'Si la cuota fue pagada descontando dinero, se DEVOLVERÁ el monto a la caja.\n\n' +
        '¿Continuar?'
      );

      if (!confirmed) return;

      await this.app.transactions.undoInstallmentPayment(transactionId);

      this.showToast('✅ Pago deshecho correctamente', 'success');
      await this.filterTransactions();
      await this.loadDashboard();
      await this.loadPendingPayments();

    } catch (error) {
      console.error('Error deshaciendo pago:', error);
      this.showToast('Error: ' + error.message, 'error');
    }
  }

  // 🆕 NUEVA FUNCIÓN: Cargar vista de cuotas pendientes
  async loadPendingPayments() {
    try {
      const pendingInstallments = await this.app.transactions.getPendingInstallments();
      const wallets = await this.app.walletManager.getAll();
      const cards = await this.app.storage.getCards();
      const cardsMap = cards.reduce((map, c) => { map[c.name] = c; return map; }, {});
      const container = document.getElementById('pending-payments-list');

      if (!container) return;

      if (pendingInstallments.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <h3 style="color: var(--text-secondary); font-weight: 400;">No hay cuotas pendientes</h3>
            <p style="color: var(--text-tertiary); margin-top: 8px;">Todas tus cuotas están al día</p>
          </div>
        `;
        return;
      }

      // Obtener tarjetas únicas
      const uniqueCards = [...new Set(pendingInstallments.map(p => p.card || 'Sin tarjeta'))];

      // Agrupar por nivel de alerta
      const overdue = pendingInstallments.filter(p => p.alertLevel === 'overdue');
      const urgent = pendingInstallments.filter(p => p.alertLevel === 'urgent');
      const warning = pendingInstallments.filter(p => p.alertLevel === 'warning');
      const ok = pendingInstallments.filter(p => p.alertLevel === 'ok');

      let html = '';

      // 🆕 FILTROS
      html += `
        <div class="card" style="margin-bottom: 24px; padding: 16px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
            <div>
              <label class="form-label" style="margin-bottom: 4px;">Filtrar por tarjeta</label>
              <select id="filter-card" class="form-select" onchange="app.ui.filterPendingPayments()">
                <option value="">Todas las tarjetas</option>
                ${uniqueCards.map(card => `<option value="${card}">${card}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="form-label" style="margin-bottom: 4px;">Filtrar por estado</label>
              <select id="filter-alert" class="form-select" onchange="app.ui.filterPendingPayments()">
                <option value="">Todas</option>
                <option value="overdue">🔴 Vencidas (${overdue.length})</option>
                <option value="urgent">🟠 Urgentes (${urgent.length})</option>
                <option value="warning">🟡 Próximas (${warning.length})</option>
                <option value="ok">🟢 OK (${ok.length})</option>
              </select>
            </div>
          </div>
        </div>
      `;

      // Mostrar alertas de cuotas vencidas
      if (overdue.length > 0) {
        html += `
          <div class="alert-card alert-danger" style="margin-bottom: 24px;">
            <h3 style="margin: 0 0 12px 0; font-size: 18px;">⚠️ Cuotas Vencidas (${overdue.length})</h3>
            <p style="margin: 0;">Tienes cuotas que ya pasaron su fecha de vencimiento</p>
          </div>
        `;
      }

      if (urgent.length > 0) {
        html += `
          <div class="alert-card alert-warning" style="margin-bottom: 24px;">
            <h3 style="margin: 0 0 12px 0; font-size: 18px;">🔔 Cuotas Próximas a Vencer (${urgent.length})</h3>
            <p style="margin: 0;">Vencen en los próximos 3 días</p>
          </div>
        `;
      }

      // 🆕 AGRUPAR POR TARJETA Y CALCULAR DEUDAS (En la moneda de la tarjeta)
      const groupedByCard = {};
      const cardTotals = {};

      for (const installment of pendingInstallments) {
        const cardName = installment.card || 'Sin tarjeta';
        if (!groupedByCard[cardName]) {
          groupedByCard[cardName] = [];
          cardTotals[cardName] = 0;
        }
        groupedByCard[cardName].push(installment);

        // Sumar al total (idealmente en la moneda de la tarjeta)
        const amount = installment.amount || 0;
        const installmentCurrency = installment.currency || 'ARS';
        const cardCurrency = cardsMap[cardName]?.currency || 'ARS';

        if (installmentCurrency === cardCurrency) {
          cardTotals[cardName] += amount;
        } else {
          // Si por alguna razón la moneda de la cuota es distinta, convertir a la moneda de la tarjeta
          const converted = await this.app.currencyManager.convertAmount(amount, installmentCurrency, cardCurrency);
          cardTotals[cardName] += (typeof converted === 'object' ? converted.amount : converted);
        }
      }

      // Definiciones de alertas para evitar redundancia
      const ALERT_MAP = {
        'overdue': { class: 'overdue', badge: 'Vencida' },
        'urgent': { class: 'urgent', badge: 'Urgente' },
        'warning': { class: 'warning', badge: 'Próxima' },
        'ok': { class: 'ok', badge: 'OK' }
      };

      // Renderizar por tarjeta
      for (const cardName of Object.keys(groupedByCard).sort()) {
        const cardInstallments = groupedByCard[cardName];
        const totalDebt = cardTotals[cardName];
        const cardCurrency = cardsMap[cardName]?.currency || 'ARS';

        html += `
          <div class="card" style="margin-bottom: 24px;" data-card-group="${cardName}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid var(--border-color);">
              <div>
                <h3 style="margin: 0; font-size: 18px; color: var(--primary);">💳 ${cardName}</h3>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">${cardInstallments.length} cuota${cardInstallments.length > 1 ? 's' : ''} pendiente${cardInstallments.length > 1 ? 's' : ''}</p>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 12px; color: var(--text-secondary);">Deuda total de tarjeta</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--danger);">
                  ${this.formatCurrency(totalDebt, cardCurrency)}
                </div>
              </div>
            </div>

            <div class="pending-installments-grid">
        `;

        cardInstallments.forEach(installment => {
          const alert = ALERT_MAP[installment.alertLevel] || ALERT_MAP.ok;
          const currency = installment.currency || 'ARS';

          html += `
            <div class="pending-installment-card ${alert.class}" data-alert-level="${installment.alertLevel}">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                <div style="flex: 1;">
                  <h4 style="margin: 0 0 4px 0; font-size: 16px;">${installment.description}</h4>
                  <div style="font-size: 12px; color: var(--text-secondary);">
                    ${installment.category}
                  </div>
                </div>
                <div class="alert-badge alert-badge-${alert.class}">${alert.badge}</div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Monto</div>
                  <div style="font-size: 18px; font-weight: 700; color: var(--primary);">
                    ${this.formatCurrency(installment.amount, currency)}
                  </div>
                </div>
                <div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Vence</div>
                  <div style="font-size: 14px; font-weight: 600;">
                    ${installment.dueDateFormatted}
                    <span style="font-size: 11px; color: var(--text-tertiary); display: block;">
                      ${installment.daysUntilDue >= 0
              ? `(${installment.daysUntilDue} días)`
              : `(${Math.abs(installment.daysUntilDue)} días atrasada)`}
                    </span>
                  </div>
                </div>
              </div>

              <div style="display: flex; gap: 8px; align-items: center;">
                <select class="form-select" id="wallet-${installment.id}" style="flex: 1;">
                  <option value="">Seleccionar caja</option>
                  ${wallets.map(w => `
                    <option value="${w.id}">
                      ${w.name} (${this.formatCurrency(w.currentBalance)} ${w.currency})
                    </option>
                  `).join('')}
                </select>
                <button class="btn btn-success" onclick="app.ui.payInstallmentAction('${installment.id}')" 
                        style="white-space: nowrap; padding: 8px 12px;">
                  💳 Pagar
                </button>
                ${this.app.auth.isAdmin() ? `
                  <button class="btn btn-secondary" onclick="app.ui.markAsPaidWithoutCharge('${installment.id}')" 
                          title="Marcar como paga sin cobrar"
                          style="white-space: nowrap; padding: 8px 12px;">
                    ✓
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      }

      container.innerHTML = html;

    } catch (error) {
      console.error('Error loading pending payments:', error);
      this.showToast('Error al cargar cuotas pendientes', 'error');
    }
  }

  // 🆕 NUEVA FUNCIÓN: Filtrar cuotas pendientes
  filterPendingPayments() {
    const selectedCard = document.getElementById('filter-card')?.value || '';
    const selectedAlert = document.getElementById('filter-alert')?.value || '';

    // Filtrar grupos de tarjetas
    document.querySelectorAll('[data-card-group]').forEach(cardGroup => {
      const cardName = cardGroup.getAttribute('data-card-group');
      let showGroup = true;

      if (selectedCard && cardName !== selectedCard) {
        showGroup = false;
      }

      cardGroup.style.display = showGroup ? 'block' : 'none';
    });

    // Filtrar cuotas individuales por alert level
    document.querySelectorAll('[data-alert-level]').forEach(card => {
      const alertLevel = card.getAttribute('data-alert-level');

      if (!selectedAlert || alertLevel === selectedAlert) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // 🆕 NUEVA FUNCIÓN: Marcar como paga sin cobrar (solo admin)
  async markAsPaidWithoutCharge(installmentId) {
    try {
      const confirmed = await this.modals.showConfirm(
        '⚠️ Marcar como Paga (Sin Cobro)',
        '¿Deseas marcar esta cuota como PAGA sin descontar dinero?\n\n' +
        '⚠️ ATENCIÓN: Esta acción es solo para ajustes administrativos.\n' +
        'No se descontará dinero de ninguna caja.\n\n' +
        '¿Continuar?'
      );

      if (!confirmed) return;

      await this.app.transactions.markInstallmentAsPaidWithoutCharge(installmentId);

      this.showToast('✅ Cuota marcada como paga (sin cobro)', 'success');
      await this.loadPendingPayments();

    } catch (error) {
      console.error('Error marking as paid:', error);
      this.showToast('Error: ' + error.message, 'error');
    }
  }

  // 🆕 NUEVA FUNCIÓN: Acción de pagar cuota
  async payInstallmentAction(installmentId) {
    try {
      const walletId = document.getElementById(`wallet-${installmentId}`).value;

      if (!walletId) {
        this.showToast('Debes seleccionar una caja para pagar', 'error');
        return;
      }

      const confirmed = await this.modals.showConfirm(
        'Confirmar Pago de Cuota',
        '¿Deseas pagar esta cuota?\nSe descontará el monto de la caja seleccionada.'
      );

      if (!confirmed) return;

      await this.app.transactions.payInstallment(installmentId, walletId);

      this.showToast('✅ Cuota pagada correctamente', 'success');
      await this.loadPendingPayments();
      await this.loadWallets();  // Actualizar wallets

    } catch (error) {
      console.error('Error paying installment:', error);
      this.showToast('Error: ' + error.message, 'error');
    }
  }

  // ✅ NUEVO: Helper para estado de carga en botones
  setButtonLoading(buttonId, isLoading) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    if (isLoading) {
      btn.disabled = true;
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Procesando...';
      btn.classList.add('btn-loading');
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
      btn.classList.remove('btn-loading');
    }
  }

}