// js/core/auth.js
import { CryptoUtils } from '../utils/crypto.js';

export class AuthManager {
  constructor(storage) {
    this.storage = storage;
    this.currentUser = null;
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutos
    this.maxLoginAttempts = 5;
    this.lockoutDuration = 15 * 60 * 1000; // 15 minutos

    // ✅ NUEVO: Sistema de timeout por inactividad
    this.inactivityTimeout = 30 * 60 * 1000; // 30 minutos
    this.warningTimeout = 28 * 60 * 1000; // Advertir 2 min antes
    this.timeoutId = null;
    this.warningId = null;
    this.lastActivity = Date.now();

    // Restaurar sesión si existe
    this.restoreSession();
  }

  /**
   * Intenta autenticar al usuario
   * @param {string} username - Nombre de usuario
   * @param {string} password - Contraseña en texto plano
   * @param {boolean} rememberMe - Mantener sesión activa
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async login(username, password, rememberMe = false) {
    try {
      const users = await this.storage.getUsers();
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

      if (!user) {
        return { success: false, message: 'Usuario no encontrado' };
      }

      // Verificar password
      let isValidPassword = false;

      if (user.passwordHash) {
        // Usar CryptoUtils para verificar el hash (SHA-256)
        isValidPassword = await CryptoUtils.verifyPassword(password, user.passwordHash);

        // Fallback para Bcrypt si el anterior falla (compatibilidad con backups anteriores)
        const bcrypt = (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt) ? dcodeIO.bcrypt : (typeof window !== 'undefined' ? window.bcrypt : null);

        if (!isValidPassword && bcrypt) {
          try {
            isValidPassword = await bcrypt.compare(password, user.passwordHash);
          } catch (e) {
            console.warn('Bcrypt compare failed, likely not a bcrypt hash');
          }
        }
      } else if (user.password) {
        // Legacy: password en texto plano
        isValidPassword = (password === user.password);
      }

      if (!isValidPassword) {
        return { success: false, message: 'Contraseña incorrecta' };
      }

      const sessionUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name
      };

      // Si elige recordarme, guardamos en localStorage, si no solo en sessionStorage
      const storage = rememberMe ? localStorage : sessionStorage;
      
      // Duración: 30 min para sesión normal, 30 días para recordarme
      const duration = rememberMe ? (30 * 24 * 60 * 60 * 1000) : this.sessionTimeout;
      const expiry = Date.now() + duration;

      storage.setItem('currentUser', JSON.stringify(sessionUser));
      storage.setItem('sessionExpiry', expiry.toString());

      this.currentUser = sessionUser;

      // Iniciar monitoreo de inactividad solo para sesiones cortas (no persistentes)
      if (!rememberMe) {
        this.startInactivityMonitor();
      }

      return { success: true, user: sessionUser };

    } catch (error) {
      console.error('Error en login:', error);
      return { success: false, message: 'Error al iniciar sesión' };
    }
  }

  /**
   * Cierra la sesión actual
   */
  logout() {
    if (this.currentUser) {
      this.logSecurityEvent('logout', this.currentUser.username);
    }

    this.currentUser = null;
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('sessionExpiry');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionExpiry');

    location.reload();
  }

  /**
   * Obtiene el usuario actual
   * @returns {Object|null}
   */
  getCurrentUser() {
    if (this.currentUser) {
      return this.currentUser;
    }

    // Intentar recuperar de sessionStorage
    const sessionData = sessionStorage.getItem('currentUser');
    if (sessionData) {
      try {
        this.currentUser = JSON.parse(sessionData);
        return this.currentUser;
      } catch (error) {
        console.error('Error parsing session data:', error);
        return null;
      }
    }

    return null;
  }

  /**
   * Verifica si el usuario es administrador
   * @returns {boolean}
   */
  isAdmin() {
    return this.currentUser?.role === 'admin';
  }

  /**
   * Verifica si puede ver una transacción
   * @param {Object} transaction
   * @returns {boolean}
   */
  canViewTransaction(transaction) {
    if (!this.currentUser) return false;
    if (this.isAdmin()) return true;
    return transaction.userId === this.currentUser.id;
  }

  /**
   * Verifica si puede editar una transacción
   * @param {Object} transaction
   * @returns {boolean}
   */
  canEditTransaction(transaction) {
    if (!this.currentUser) return false;
    if (this.isAdmin()) return true;
    return transaction.userId === this.currentUser.id;
  }

  /**
   * Verifica si puede eliminar una transacción
   * @param {Object} transaction
   * @returns {boolean}
   */
  canDeleteTransaction(transaction) {
    return this.canEditTransaction(transaction);
  }

  /**
   * Restaura la sesión desde storage
   * @private
   */
  restoreSession() {
    try {
      // Priorizar localStorage (remember me)
      let stored = localStorage.getItem('currentUser');
      let expiry = localStorage.getItem('sessionExpiry');

      // Fallback a sessionStorage
      if (!stored) {
        stored = sessionStorage.getItem('currentUser');
        expiry = sessionStorage.getItem('sessionExpiry');
      }

      if (stored && expiry) {
        const expiryTime = parseInt(expiry);

        // Verificar si la sesión está vigente
        if (Date.now() < expiryTime) {
          this.currentUser = JSON.parse(stored);
        } else {
          this.clearSession();
        }
      }
    } catch (error) {
      this.clearSession();
    }
  }

  /**
   * Verifica si la sesión ha expirado
   * @private
   * @returns {boolean}
   */
  isSessionExpired() {
    const expiry = sessionStorage.getItem('sessionExpiry') ||
      localStorage.getItem('sessionExpiry');

    if (!expiry) return true;

    return Date.now() >= parseInt(expiry);
  }

  /**
   * Limpia la sesión completamente
   * @private
   */
  clearSession() {
    this.currentUser = null;
    sessionStorage.clear();
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionExpiry');
  }

  /**
   * Verifica si una cuenta está bloqueada
   * @private
   * @param {string} username
   * @returns {boolean}
   */
  isAccountLocked(username) {
    const attempts = this.getLoginAttempts(username);

    if (attempts.count >= this.maxLoginAttempts && attempts.lockedUntil) {
      if (Date.now() < attempts.lockedUntil) {
        return true;
      } else {
        // Bloqueo expirado, limpiar
        this.clearLoginAttempts(username);
        return false;
      }
    }

    return false;
  }

  /**
   * Registra un intento fallido de login
   * @private
   * @param {string} username
   */
  recordFailedAttempt(username) {
    const key = `login_attempts_${username.toLowerCase()}`;
    const attempts = this.getLoginAttempts(username);

    attempts.count++;
    attempts.lastAttempt = Date.now();

    if (attempts.count >= this.maxLoginAttempts) {
      attempts.lockedUntil = Date.now() + this.lockoutDuration;
      this.logSecurityEvent('account_locked', username);
    }

    localStorage.setItem(key, JSON.stringify(attempts));
  }

  /**
   * Obtiene los intentos de login de un usuario
   * @private
   * @param {string} username
   * @returns {Object}
   */
  getLoginAttempts(username) {
    const key = `login_attempts_${username.toLowerCase()}`;
    const stored = localStorage.getItem(key);

    if (stored) {
      return JSON.parse(stored);
    }

    return { count: 0, lastAttempt: null, lockedUntil: null };
  }

  /**
   * Limpia los intentos fallidos de login
   * @private
   * @param {string} username
   */
  clearLoginAttempts(username) {
    const key = `login_attempts_${username.toLowerCase()}`;
    localStorage.removeItem(key);
  }

  /**
   * Registra eventos de seguridad
   * @private
   * @param {string} event
   * @param {string} username
   * @param {string} details
   */
  logSecurityEvent(event, username, details = '') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      username,
      details,
      userAgent: navigator.userAgent
    };

    // Guardar en logs de seguridad
    const logs = JSON.parse(localStorage.getItem('security_logs') || '[]');
    logs.push(logEntry);

    // Mantener solo los últimos 100 logs
    if (logs.length > 100) {
      logs.shift();
    }

    localStorage.setItem('security_logs', JSON.stringify(logs));

    console.log(`🔒 [SECURITY] ${event}:`, username, details);
  }

  /**
   * Obtiene los logs de seguridad
   * @returns {Array}
   */
  getSecurityLogs() {
    return JSON.parse(localStorage.getItem('security_logs') || '[]');
  }

  /**
   * Extiende la sesión actual
   */
  extendSession() {
    if (!this.currentUser) return;

    const storage = localStorage.getItem('currentUser') ? localStorage : sessionStorage;
    storage.setItem('sessionExpiry', (Date.now() + this.sessionTimeout).toString());
  }

  // ========================================
  // ✅ NUEVO: SISTEMA DE TIMEOUT POR INACTIVIDAD
  // ========================================

  /**
   * Inicia el monitoreo de inactividad
   */
  startInactivityMonitor() {
    // Resetear timer al detectar actividad
    const resetTimer = () => {
      this.lastActivity = Date.now();
      this.clearTimeouts();
      this.scheduleTimeout();
    };

    // Eventos que cuentan como "actividad"
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, resetTimer, { passive: true });
    });

    // Iniciar el primer timeout
    this.scheduleTimeout();
  }

  /**
   * Programa los timeouts de advertencia y logout
   */
  scheduleTimeout() {
    // Advertencia 2 minutos antes
    this.warningId = setTimeout(() => {
      this.showInactivityWarning();
    }, this.warningTimeout);

    // Logout automático
    this.timeoutId = setTimeout(() => {
      this.logoutDueToInactivity();
    }, this.inactivityTimeout);
  }

  /**
   * Limpia los timeouts activos
   */
  clearTimeouts() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.warningId) clearTimeout(this.warningId);
  }

  /**
   * Muestra advertencia de inactividad
   */
  showInactivityWarning() {
    const remainingSeconds = Math.floor((this.inactivityTimeout - this.warningTimeout) / 1000);

    // Crear modal de advertencia
    const modal = document.createElement('div');
    modal.id = 'inactivity-warning-modal';
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal-content custom-dialog">
        <h3>⏰ Sesión por Expirar</h3>
        <p>Tu sesión se cerrará en <strong id="countdown">${remainingSeconds}</strong> segundos por inactividad.</p>
        <p style="font-size: 12px; color: var(--text-secondary);">
          Mueve el mouse o presiona cualquier tecla para continuar.
        </p>
        <div class="dialog-buttons">
          <button class="btn btn-primary" id="stay-logged-in">
            Continuar Sesión
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Countdown
    let remaining = remainingSeconds;
    const countdownInterval = setInterval(() => {
      remaining--;
      const countdownEl = document.getElementById('countdown');
      if (countdownEl) {
        countdownEl.textContent = remaining;
      }
      if (remaining <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    // Botón para continuar
    const stayButton = document.getElementById('stay-logged-in');
    if (stayButton) {
      stayButton.addEventListener('click', () => {
        clearInterval(countdownInterval);
        modal.remove();
        this.clearTimeouts();
        this.scheduleTimeout();
      });
    }

    // Cualquier actividad cierra el modal
    const closeWarning = () => {
      clearInterval(countdownInterval);
      if (modal.parentNode) {
        modal.remove();
      }
      document.removeEventListener('mousedown', closeWarning);
      document.removeEventListener('keydown', closeWarning);
    };

    setTimeout(() => {
      document.addEventListener('mousedown', closeWarning, { once: true });
      document.addEventListener('keydown', closeWarning, { once: true });
    }, 100);
  }

  /**
   * Cierra sesión por inactividad
   */
  logoutDueToInactivity() {
    this.clearTimeouts();

    // Guardar razón del logout
    sessionStorage.setItem('logoutReason', 'inactivity');

    // Hacer logout
    this.logout();
  }
}