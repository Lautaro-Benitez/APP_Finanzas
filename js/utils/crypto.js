// js/utils/crypto.js
/**
 * Utilidades de cifrado para FinanzApp
 * Implementa hashing seguro de contraseñas con SHA-256
 */

export class CryptoUtils {
  /**
   * Genera un hash SHA-256 de una contraseña
   * @param {string} password - Contraseña en texto plano
   * @returns {Promise<string>} Hash hexadecimal
   */
  static async hashPassword(password) {
    if (!password) throw new Error('Contraseña requerida');
    
    try {
      // Convertir string a bytes
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      
      // Generar hash SHA-256
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      
      // Convertir a hexadecimal
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } catch (error) {
      console.error('Error generando hash:', error);
      throw new Error('Error al procesar contraseña');
    }
  }

  /**
   * Verifica una contraseña contra un hash
   * @param {string} password - Contraseña a verificar
   * @param {string} hash - Hash almacenado
   * @returns {Promise<boolean>}
   */
  static async verifyPassword(password, hash) {
    if (!password || !hash) return false;
    
    try {
      const passwordHash = await this.hashPassword(password);
      return passwordHash === hash;
    } catch (error) {
      console.error('Error verificando contraseña:', error);
      return false;
    }
  }

  /**
   * Genera un token aleatorio seguro
   * @param {number} length - Longitud del token (default: 8)
   * @returns {string} Token en mayúsculas
   */
  static generateSecureToken(length = 8) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(36).toUpperCase())
      .join('')
      .substring(0, length);
  }

  /**
   * Genera un ID único seguro
   * @param {string} prefix - Prefijo del ID
   * @returns {string}
   */
  static generateSecureId(prefix = 'id') {
    const timestamp = Date.now();
    const randomPart = this.generateSecureToken(6);
    return `${prefix}_${timestamp}_${randomPart}`;
  }
}