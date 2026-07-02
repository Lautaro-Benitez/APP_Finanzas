// js/core/audit-log.js - VERSIÓN OPTIMIZADA SIN REDUNDANCIAS

import { logger } from '../utils/logger.js';

export class AuditLogManager {
  constructor(storage, auth) {
    this.storage = storage;
    this.auth = auth;
    this.maxLogs = 2000;

    // Definiciones centralizadas
    this.actionLabels = {
      'create': 'Creó',
      'update': 'Actualizó',
      'delete': 'Eliminó',
      'transfer': 'Transfirió',
      'login': 'Inició sesión',
      'logout': 'Cerró sesión',
      'export': 'Exportó',
      'import': 'Importó',
      'backup': 'Respaldó',
      'restore': 'Restauró',
      'cleanup': 'Limpió',
      'view': 'Consultó',
      'add_amount': 'Agregó monto'
    };

    this.entityLabels = {
      'transaction': 'Transacción',
      'wallet': 'Caja/Billetera',
      'budget': 'Presupuesto',
      'saving': 'Ahorro',
      'user': 'Usuario',
      'card': 'Tarjeta',
      'category': 'Categoría',
      'settings': 'Configuración',
      'audit_log': 'Historial',
      'exchange_rate': 'Tasa de Cambio',
      'system': 'Sistema'
    };
  }

  async log(action, entityType, entityId, details = {}) {
    try {
      const logs = await this.getLogs();
      const user = this.auth.getCurrentUser();

      const logEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        userId: user?.id || 'system',
        userName: user?.name || 'Sistema',
        action: action,
        entityType: entityType,
        entityId: entityId || null,
        details: this.sanitizeDetails(details),
        userAgent: navigator.userAgent.substring(0, 200)
      };

      logs.push(logEntry);

      // Mantener solo los últimos N registros
      if (logs.length > this.maxLogs) {
        logs.splice(0, logs.length - this.maxLogs);
      }

      await this.storage.set('audit_logs', logs);
      return logEntry;

    } catch (error) {
      return null;
    }
  }

  sanitizeDetails(details) {
    const sanitized = { ...details };

    // Eliminar contraseñas y datos sensibles
    ['password', 'currentPassword', 'newPassword'].forEach(field => {
      delete sanitized[field];
    });

    // Limitar tamaño de strings
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
        sanitized[key] = sanitized[key].substring(0, 500) + '...';
      }
    });

    return sanitized;
  }

  async getLogs(filters = {}) {
    try {
      let logs = await this.storage.get('audit_logs', []);

      // Aplicar filtros
      if (filters.startDate) {
        logs = logs.filter(log => new Date(log.timestamp) >= new Date(filters.startDate));
      }

      if (filters.endDate) {
        logs = logs.filter(log => new Date(log.timestamp) <= new Date(filters.endDate));
      }

      if (filters.userId) {
        logs = logs.filter(log => log.userId === filters.userId);
      }

      if (filters.action) {
        logs = logs.filter(log => log.action === filters.action);
      }

      if (filters.entityType) {
        logs = logs.filter(log => log.entityType === filters.entityType);
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        logs = logs.filter(log =>
          log.userName.toLowerCase().includes(searchLower) ||
          log.action.toLowerCase().includes(searchLower) ||
          log.entityType.toLowerCase().includes(searchLower) ||
          JSON.stringify(log.details).toLowerCase().includes(searchLower)
        );
      }

      return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    } catch (error) {
      return [];
    }
  }

  async getRecentLogs(limit = 50) {
    const logs = await this.getLogs();
    return logs.slice(0, limit);
  }

  async getLogsByEntity(entityType, entityId) {
    const logs = await this.getLogs();
    return logs.filter(log => log.entityType === entityType && log.entityId === entityId);
  }

  async getStatistics() {
    try {
      const logs = await this.getLogs();

      const stats = {
        byAction: {},
        byEntityType: {},
        byUser: {},
        byDay: {}
      };

      // Inicializar últimos 30 días
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        const key = date.toISOString().split('T')[0];
        stats.byDay[key] = 0;
      }

      // Procesar todos los logs en una sola pasada
      logs.forEach(log => {
        // Contar por acción
        stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;

        // Contar por tipo de entidad
        stats.byEntityType[log.entityType] = (stats.byEntityType[log.entityType] || 0) + 1;

        // Contar por usuario
        stats.byUser[log.userName] = (stats.byUser[log.userName] || 0) + 1;

        // Contar por día
        const day = log.timestamp.split('T')[0];
        if (stats.byDay.hasOwnProperty(day)) {
          stats.byDay[day]++;
        }
      });

      return {
        total: logs.length,
        ...stats
      };

    } catch (error) {
      return null;
    }
  }

  async exportLogs(startDate, endDate) {
    try {
      const logs = await this.getLogs({ startDate, endDate });
      const csv = this.logsToCSV(logs);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `historial-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      // Log de la exportación
      await this.log('export', 'audit_log', null, {
        startDate,
        endDate,
        count: logs.length
      });

      return true;
    } catch (error) {
      throw error;
    }
  }

  logsToCSV(logs) {
    const headers = 'Fecha,Hora,Usuario,Acción,Tipo Entidad,ID Entidad,Detalles\n';
    const rows = logs.map(log => {
      const date = new Date(log.timestamp);
      const dateStr = date.toLocaleDateString('es-AR');
      const timeStr = date.toLocaleTimeString('es-AR');
      const details = JSON.stringify(log.details).replace(/"/g, '""');

      return `"${dateStr}","${timeStr}","${log.userName}","${this.getActionLabel(log.action)}","${this.getEntityLabel(log.entityType)}","${log.entityId || 'N/A'}","${details}"`;
    }).join('\n');

    return headers + rows;
  }

  async clearOldLogs(daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const logs = await this.getLogs();
      const filteredLogs = logs.filter(log => new Date(log.timestamp) > cutoffDate);

      await this.storage.set('audit_logs', filteredLogs);

      const removed = logs.length - filteredLogs.length;

      // Log de la limpieza
      if (removed > 0) {
        await this.log('cleanup', 'audit_log', null, {
          removed,
          remaining: filteredLogs.length,
          daysToKeep
        });
      }

      return { removed, remaining: filteredLogs.length };
    } catch (error) {
      throw error;
    }
  }

  // Métodos de utilidad centralizados
  getActionLabel(action) {
    return this.actionLabels[action] || action;
  }

  getEntityLabel(entityType) {
    return this.entityLabels[entityType] || entityType;
  }

  formatLogForDisplay(log) {
    const date = new Date(log.timestamp);
    return {
      id: log.id,
      fecha: date.toLocaleDateString('es-AR'),
      hora: date.toLocaleTimeString('es-AR'),
      usuario: log.userName,
      accion: this.getActionLabel(log.action),
      tipo: this.getEntityLabel(log.entityType),
      detalles: log.details
    };
  }

  async renderAuditView(containerId) {
    try {
      const container = document.getElementById(containerId);
      if (!container) return;

      const [logs, stats] = await Promise.all([
        this.getRecentLogs(100),
        this.getStatistics()
      ]);

      container.innerHTML = this.renderAuditTemplate(stats, logs);
      this.renderLogsList(logs, 'audit-logs-list');
      this.setupAuditEventListeners();

    } catch (error) {
    }
  }

  renderAuditTemplate(stats, logs) {
    return `
      <div style="margin-bottom: 24px;">
        <h2 style="margin-bottom: 16px;">📋 Historial de Auditoría</h2>
        
        <!-- Estadísticas -->
        <div class="grid grid-4" style="margin-bottom: 20px;">
          <div class="card stats-card">
            <div class="stats-label">Total Eventos</div>
            <div class="stats-value">${stats.total}</div>
          </div>
          <div class="card stats-card">
            <div class="stats-label">Acciones Únicas</div>
            <div class="stats-value">${Object.keys(stats.byAction).length}</div>
          </div>
          <div class="card stats-card">
            <div class="stats-label">Usuarios Activos</div>
            <div class="stats-value">${Object.keys(stats.byUser).length}</div>
          </div>
          <div class="card stats-card">
            <div class="stats-label">Última Actividad</div>
            <div class="stats-value" style="font-size: 14px;">
              ${logs.length > 0 ? new Date(logs[0].timestamp).toLocaleDateString('es-AR') : 'N/A'}
            </div>
          </div>
        </div>

        <!-- Filtros -->
        <div class="card" style="margin-bottom: 20px;">
          <div class="grid grid-3">
            <input type="text" id="audit-search" class="form-input" placeholder="🔍 Buscar...">
            <select id="audit-filter-action" class="form-select">
              <option value="">Todas las acciones</option>
              ${Object.keys(stats.byAction).map(action =>
      `<option value="${action}">${this.getActionLabel(action)}</option>`
    ).join('')}
            </select>
            <select id="audit-filter-entity" class="form-select">
              <option value="">Todos los tipos</option>
              ${Object.keys(stats.byEntityType).map(type =>
      `<option value="${type}">${this.getEntityLabel(type)}</option>`
    ).join('')}
            </select>
          </div>
          <div class="grid grid-2" style="margin-top: 12px;">
            <div class="form-group" style="margin: 0;">
              <label class="form-label">Desde</label>
              <input type="date" id="audit-filter-start" class="form-input">
            </div>
            <div class="form-group" style="margin: 0;">
              <label class="form-label">Hasta</label>
              <input type="date" id="audit-filter-end" class="form-input">
            </div>
          </div>
          <div style="margin-top: 12px;">
            <button class="btn btn-primary" id="audit-export-btn">⬇ Exportar CSV</button>
            <button class="btn btn-secondary" id="audit-clear-old-btn">🗑️ Limpiar Antiguos (90 días)</button>
          </div>
        </div>

        <!-- Lista de logs -->
        <div id="audit-logs-list"></div>
      </div>
    `;
  }

  setupAuditEventListeners() {
    // Filtros
    ['audit-search', 'audit-filter-action', 'audit-filter-entity', 'audit-filter-start', 'audit-filter-end'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('input', () => this.filterAuditLogs());
        element.addEventListener('change', () => this.filterAuditLogs());
      }
    });

    // Exportar
    document.getElementById('audit-export-btn')?.addEventListener('click', async () => {
      try {
        const startDate = document.getElementById('audit-filter-start')?.value || null;
        const endDate = document.getElementById('audit-filter-end')?.value || null;
        await this.exportLogs(startDate, endDate);
        alert('✅ Historial exportado correctamente');
      } catch (error) {
        alert('❌ Error exportando: ' + error.message);
      }
    });

    // Limpiar antiguos
    document.getElementById('audit-clear-old-btn')?.addEventListener('click', async () => {
      if (confirm('¿Eliminar logs anteriores a 90 días?')) {
        try {
          const result = await this.clearOldLogs(90);
          alert(`✅ Eliminados: ${result.removed}, Restantes: ${result.remaining}`);
          this.renderAuditView('audit-container');
        } catch (error) {
          alert('❌ Error: ' + error.message);
        }
      }
    });
  }

  async filterAuditLogs() {
    try {
      const search = document.getElementById('audit-search')?.value || '';
      const action = document.getElementById('audit-filter-action')?.value || '';
      const entityType = document.getElementById('audit-filter-entity')?.value || '';
      const startDate = document.getElementById('audit-filter-start')?.value || '';
      const endDate = document.getElementById('audit-filter-end')?.value || '';

      const filters = { search, action, entityType };
      if (startDate) filters.startDate = startDate + 'T00:00:00.000Z';
      if (endDate) filters.endDate = endDate + 'T23:59:59.999Z';

      const logs = await this.getLogs(filters);
      this.renderLogsList(logs, 'audit-logs-list');
    } catch (error) {
    }
  }

  renderLogsList(logs, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (logs.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <p>No se encontraron registros</p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = logs.map(log => {
      const formatted = this.formatLogForDisplay(log);
      const detailsStr = JSON.stringify(log.details, null, 2);

      return `
        <div class="card list-item" style="margin-bottom: 10px;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
              <strong>${formatted.accion}</strong>
              <span class="badge badge-income">${formatted.tipo}</span>
              <span style="font-size: 12px; color: var(--text-secondary);">${formatted.fecha} ${formatted.hora}</span>
            </div>
            <div style="font-size: 13px; color: var(--text-secondary);">
              <strong>Usuario:</strong> ${formatted.usuario}
              ${log.entityId ? ` • <strong>ID:</strong> ${log.entityId}` : ''}
            </div>
            ${Object.keys(log.details).length > 0 ? `
              <details style="margin-top: 8px;">
                <summary style="cursor: pointer; font-size: 12px; color: var(--primary);">Ver detalles</summary>
                <pre style="margin-top: 8px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px; font-size: 11px; overflow-x: auto;">${detailsStr}</pre>
              </details>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }
}