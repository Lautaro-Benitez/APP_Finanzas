// js/ui/charts.js - VERSIÓN LIMPIA Y OPTIMIZADA
import { logger } from '../utils/logger.js';

export class ChartManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.app = uiManager.app;
    this.charts = {};
    this.updateTimers = {}; // ✅ NUEVO: Para debounce


    this.colors = {
      textPrimary: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#f1f5f9',
      textSecondary: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#94a3b8',
      bgSecondary: getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#1e293b',
      borderColor: getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#475569'
    };

    this.commonOptions = {
      fontFamily: "'Segoe UI', Roboto, sans-serif",
      tooltipConfig: {
        backgroundColor: this.colors.bgSecondary,
        titleColor: this.colors.textPrimary,
        bodyColor: this.colors.textPrimary,
        borderColor: this.colors.borderColor,
        borderWidth: 1,
        titleFont: {
          family: "'Segoe UI', Roboto, sans-serif"
        },
        bodyFont: {
          family: "'Segoe UI', Roboto, sans-serif"
        }
      },
      legendConfig: {
        labels: {
          color: this.colors.textPrimary,
          font: {
            size: 11,
            family: "'Segoe UI', Roboto, sans-serif"
          },
          padding: 15,
          usePointStyle: true
        }
      }
    };
  }

  renderCategoryChart(categories) {
    const ctx = document.getElementById('category-chart');
    if (!ctx) return;

    if (this.charts.category) {
      this.charts.category.destroy();
    }

    // ✅ FILTRAR transferencias y solo gastos reales
    const expenseCategories = categories.filter(c =>
      c.type === 'expense' &&
      c.category !== 'Transferencia' &&
      c.category !== 'Ahorro'
    );

    if (expenseCategories.length === 0) {
      this.showNoDataMessage(ctx, 'No hay datos de gastos para mostrar en este período');
      return;
    }

    this.charts.category = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: expenseCategories.map(c => c.category),
        datasets: [{
          data: expenseCategories.map(c => c.total),
          backgroundColor: [
            '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899',
            '#06b6d4', '#d97706', '#6366f1', '#14b8a6'
          ],
          borderWidth: 2,
          borderColor: this.colors.bgSecondary
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: this.commonOptions.legendConfig.labels
          },
          tooltip: {
            ...this.commonOptions.tooltipConfig,
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.raw || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${this.ui.formatCurrency(value)} (${percentage}%)`;
              }
            }
          }
        },
        cutout: '60%'
      }
    });
  }

  renderIncomeChart(categories) {
    const ctx = document.getElementById('income-chart');
    if (!ctx) return;

    if (this.charts.income) {
      this.charts.income.destroy();
    }

    // ✅ FILTRAR transferencias y ahorros, solo ingresos reales
    const incomeCategories = categories.filter(c =>
      c.type === 'income' &&
      c.category !== 'Transferencia' &&
      c.category !== 'Ahorro'
    );

    if (incomeCategories.length === 0) {
      this.showNoDataMessage(ctx, 'No hay datos de ingresos para mostrar en este período');
      return;
    }

    this.charts.income = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: incomeCategories.map(c => c.category),
        datasets: [{
          data: incomeCategories.map(c => c.total),
          backgroundColor: [
            '#10b981', // Verde
            '#3b82f6', // Azul
            '#8b5cf6', // Púrpura
            '#06b6d4', // Cyan
            '#f59e0b', // Ámbar
            '#ec4899', // Rosa
            '#14b8a6', // Teal
            '#6366f1'  // Índigo
          ],
          borderWidth: 2,
          borderColor: this.colors.bgSecondary
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: this.commonOptions.legendConfig.labels
          },
          tooltip: {
            ...this.commonOptions.tooltipConfig,
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.raw || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${this.ui.formatCurrency(value)} (${percentage}%)`;
              }
            }
          }
        },
        cutout: '60%'
      }
    });
  }

  async renderMetricsChart(period) {
    const ctx = document.getElementById('metrics-chart');
    if (!ctx) return;

    // ✅ OPTIMIZACIÓN: Solo actualizar datos si el gráfico ya existe
    if (this.charts.metrics) {
      await this.updateMetricsChartData(period);
      return;
    }

    try {
      const dates = this.getPeriodDates(period);

      const transactions = await this.app.transactions.getAll({
        startDate: dates.start,
        endDate: dates.end
      });

      if (transactions.length === 0) {
        this.showNoDataMessage(ctx, 'No hay transacciones en este período');
        return;
      }

      const data = await this.app.analytics.calculateMetricsOverTime(transactions, period, {
        startDate: dates.start,
        endDate: dates.end
      });

      if (data.labels.length === 0) {
        this.showNoDataMessage(ctx, 'No hay suficientes datos para este período');
        return;
      }

      const datasets = this.buildChartDatasets(data);

      if (datasets.length === 0) {
        this.showNoDataMessage(ctx, 'Selecciona al menos una métrica para mostrar');
        return;
      }

      this.charts.metrics = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.labels,
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
                color: this.colors.textPrimary,
                font: {
                  size: 12,
                  family: this.commonOptions.fontFamily,
                  weight: 600
                },
                padding: 15,
                usePointStyle: true,
                boxWidth: 8,
                boxHeight: 8
              }
            },
            tooltip: {
              enabled: true,
              mode: 'index',
              intersect: false,
              backgroundColor: this.colors.bgSecondary,
              titleColor: this.colors.textPrimary,
              bodyColor: this.colors.textPrimary,
              borderColor: this.colors.borderColor,
              borderWidth: 1,
              padding: 12,
              titleFont: {
                size: 13,
                family: this.commonOptions.fontFamily,
                weight: 'bold'
              },
              bodyFont: {
                size: 12,
                family: this.commonOptions.fontFamily
              },
              callbacks: {
                title: (items) => {
                  return items[0].label;
                },
                label: (context) => {
                  const label = context.dataset.label || '';
                  const value = context.parsed.y;
                  return ` ${label}: ${this.ui.formatCurrency(value)}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: this.colors.textPrimary,
                font: {
                  size: 11,
                  family: this.commonOptions.fontFamily
                },
                callback: (value) => {
                  if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                  if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
                  return value.toFixed(0);
                }
              },
              grid: {
                color: 'rgba(148, 163, 184, 0.1)',
                drawBorder: false
              }
            },
            x: {
              ticks: {
                color: this.colors.textPrimary,
                font: {
                  size: 11,
                  family: this.commonOptions.fontFamily
                },
                maxRotation: 45,
                minRotation: 0,
                autoSkip: true,
                maxTicksLimit: 12
              },
              grid: {
                color: 'rgba(148, 163, 184, 0.05)',
                drawBorder: false
              }
            }
          }
        }
      });

    } catch (error) {
      console.error('Error en renderMetricsChart:', error);
      this.showErrorMessage(ctx, 'Error cargando datos: ' + error.message);
    }
  }

  buildChartDatasets(data) {
    const datasets = [];

    const showIncome = document.getElementById('show-income')?.checked ?? true;
    const showExpenses = document.getElementById('show-expenses')?.checked ?? true;
    const showBalance = document.getElementById('show-balance')?.checked ?? true;

    if (showIncome) {
      datasets.push({
        label: 'Ingresos',
        data: data.income,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      });
    }

    if (showExpenses) {
      datasets.push({
        label: 'Gastos',
        data: data.expenses,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      });
    }

    if (showBalance) {
      datasets.push({
        label: 'Balance',
        data: data.balance,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#4f46e5',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      });
    }

    return datasets;
  }

  getPeriodDates(period) {
    const now = new Date();
    let start, end;

    if (typeof period === 'object') {
      if (period.type === 'specific-month') {
        start = new Date(period.year, period.month, 1);
        end = new Date(period.year, period.month + 1, 0);
      } else if (period.type === 'specific-year') {
        start = new Date(period.year, 0, 1);
        end = new Date(period.year, 11, 31);
      } else if (period.type === 'custom-range') {
        start = new Date(period.startDate);
        end = new Date(period.endDate);
      }
    } else {
      switch (period) {
        case 'week':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 6);
          break;

        case 'month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          break;

        case 'quarter':
          const quarter = Math.floor(now.getMonth() / 3);
          start = new Date(now.getFullYear(), quarter * 3, 1);
          end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
          break;

        case 'year':
          start = new Date(now.getFullYear(), 0, 1);
          end = new Date(now.getFullYear(), 11, 31);
          break;

        default:
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }
    }

    const startISO = start.toISOString().split('T')[0] + 'T00:00:00.000Z';
    const endISO = end.toISOString().split('T')[0] + 'T23:59:59.999Z';

    return { start: startISO, end: endISO };
  }

  showNoDataMessage(element, message) {
    const parent = element.parentElement;
    if (!parent) return;

    parent.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 280px; color: var(--text-secondary); text-align: center; padding: 20px;">
        <div>
          <div style="font-size: 48px; margin-bottom: 12px; opacity: 0.5;">📊</div>
          <p style="margin: 0;">${message}</p>
        </div>
      </div>
    `;
  }

  showErrorMessage(element, message) {
    const parent = element.parentElement;
    if (!parent) return;

    parent.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 280px; color: var(--danger); text-align: center; padding: 20px;">
        <div>
          <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
          <p style="margin: 0; font-weight: 600;">${message}</p>
          <p style="margin-top: 8px; font-size: 12px; opacity: 0.7;">Revisa la consola para más detalles</p>
        </div>
      </div>
    `;
  }

  updateMetricsChart(currentPeriod) {
    const period = currentPeriod || document.getElementById('dashboard-period')?.value || 'month';
    this.renderMetricsChart(period);
  }

  destroyAllCharts() {
    Object.values(this.charts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        try {
          chart.destroy();
        } catch (error) {
          console.error('Error destruyendo gráfico:', error);
        }
      }
    });
    this.charts = {};
  }

  async refreshDashboardCharts(period = 'month') {
    try {
      const dates = this.getPeriodDates(period);
      const report = await this.app.analytics.generateReport(dates.start, dates.end);

      this.renderIncomeChart(report.categories);
      this.renderCategoryChart(report.categories);
      await this.renderMetricsChart(period);

    } catch (error) {
      console.error('Error refrescando gráficos:', error);
    }
  }

  // ✅ NUEVO: Actualizar datos sin recrear gráfico
  async updateMetricsChartData(period) {
    try {
      if (!this.charts.metrics) return;

      const dates = this.getPeriodDates(period);
      const transactions = await this.app.transactions.getAll({
        startDate: dates.start,
        endDate: dates.end
      });

      const data = await this.app.analytics.calculateMetricsOverTime(transactions, period, {
        startDate: dates.start,
        endDate: dates.end
      });

      const chart = this.charts.metrics;

      // Actualizar datos de los datasets existentes
      chart.data.labels = data.labels;

      // Mapeo seguro de datasets por label
      const datasetMap = {
        'Ingresos': data.income,
        'Gastos': data.expenses,
        'Balance': data.balance
      };

      chart.data.datasets.forEach(dataset => {
        if (datasetMap[dataset.label]) {
          dataset.data = datasetMap[dataset.label];
        }
      });

      // Actualización optimizada sin animación completa
      chart.update('none');

    } catch (error) {
      console.error('Error actualizando datos de gráfico:', error);
    }
  }

  // ✅ NUEVO: Actualización con debounce
  updateMetricsChartDebounced(period, delay = 300) {
    if (this.updateTimers.metrics) {
      clearTimeout(this.updateTimers.metrics);
    }

    this.updateTimers.metrics = setTimeout(() => {
      this.renderMetricsChart(period);
    }, delay);
  }
}