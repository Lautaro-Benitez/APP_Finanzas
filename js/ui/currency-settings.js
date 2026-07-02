// js/ui/currency-settings.js - VERSIÓN CORREGIDA
export class CurrencySettingsManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.app = uiManager.app;
  }

  async showCurrencySettings() {
    const rates = await this.app.storage.getExchangeRates();
    const settings = await this.app.storage.getSettings();
    const updateInfo = await this.app.currencyManager.getUpdateInfo();
    
    const html = `
      <div class="modal active" id="currency-settings-modal">
        <div class="modal-content">
          <h2 style="margin-bottom: 20px;">Configuración de Monedas</h2>
          
          ${updateInfo.lastUpdated ? `
            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
              <strong>📊 Última actualización:</strong><br>
              <span style="color: var(--text-secondary);">
                ${new Date(updateInfo.lastUpdated).toLocaleString('es-AR')} 
                (${updateInfo.hoursAgo}h atrás)
              </span><br>
              <span style="color: var(--text-secondary);">
                Fuente: ${updateInfo.source || 'manual'}
              </span>
            </div>
          ` : ''}
          
          <form id="currency-settings-form">
            <div class="form-group">
              <label class="form-label">Moneda por Defecto</label>
              <select class="form-select" name="defaultCurrency" required>
                <option value="ARS" ${settings.currency === 'ARS' ? 'selected' : ''}>Peso Argentino (ARS)</option>
                <option value="USD" ${settings.currency === 'USD' ? 'selected' : ''}>Dólar Americano (USD)</option>
                <option value="EUR" ${settings.currency === 'EUR' ? 'selected' : ''}>Euro (EUR)</option>
              </select>
            </div>
            
            <h4 style="margin: 24px 0 16px 0;">Tasas de Cambio (1 unidad = X ARS)</h4>
            
            <div class="form-group">
              <label class="form-label">Dólar Americano (USD)</label>
              <input type="number" class="form-input" name="USD" 
                    value="${rates.USD}" step="0.01" min="0.01" required>
            </div>
            
            <div class="form-group">
              <label class="form-label">Euro (EUR)</label>
              <input type="number" class="form-input" name="EUR" 
                    value="${rates.EUR}" step="0.01" min="0.01" required>
            </div>
            
            <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="font-size: 12px; color: var(--text-secondary); margin: 0;">
                💡 <strong>Actualización:</strong> Usa el botón "Actualizar desde API" para obtener las cotizaciones oficiales argentinas desde dolarapi.com o bluelytics.com.ar. También puedes editarlas manualmente aquí.
              </p>
            </div>
            
            <div style="display: flex; gap: 12px;">
              <button type="submit" class="btn btn-primary" style="flex: 1;">Guardar Configuración</button>
              <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            </div>
          </form>
          
          <div style="margin-top: 16px;">
            <button type="button" class="btn btn-success" id="force-update-rates-modal" style="width: 100%;">
              🔄 Actualizar desde API ahora
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
    
    // ✅ CORREGIDO: Event listener único para actualización forzada
    const updateBtn = document.getElementById('force-update-rates-modal');
    updateBtn.onclick = async () => {
      const originalText = updateBtn.textContent;
      
      try {
        updateBtn.disabled = true;
        updateBtn.textContent = '⏳ Actualizando...';
        
        const result = await this.app.currencyManager.forceUpdateRates();
        
        if (result.success) {
          this.ui.showToast(`✅ ${result.message}`, 'success');
          
          // Cerrar y reabrir modal con nuevos valores
          document.getElementById('currency-settings-modal').remove();
          
          // Esperar un poco antes de reabrir
          setTimeout(() => {
            this.showCurrencySettings();
          }, 500);
          
        } else {
          this.ui.showToast(`⚠️ ${result.message}`, 'error');
        }
        
      } catch (error) {
        this.ui.showToast('Error al actualizar: ' + error.message, 'error');
      } finally {
        updateBtn.disabled = false;
        updateBtn.textContent = originalText;
      }
    };
    
    // ✅ Submit del formulario (guardar manual)
    document.getElementById('currency-settings-form').onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      
      try {
        const newRates = {
          USD: parseFloat(formData.get('USD')),
          EUR: parseFloat(formData.get('EUR')),
          ARS: 1
        };
        
        await this.app.storage.saveExchangeRates(newRates);
        
        const newSettings = await this.app.storage.getSettings();
        newSettings.currency = formData.get('defaultCurrency');
        await this.app.storage.saveSettings(newSettings);
        
        document.getElementById('currency-settings-modal').remove();
        this.ui.showToast('Configuración de monedas actualizada', 'success');
        
        await this.ui.loadDashboard(); // Actualizar dashboard
        
      } catch (error) {
        this.ui.showToast('Error actualizando configuración: ' + error.message, 'error');
      }
    };
  }
}