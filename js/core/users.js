// js/core/users.js
import { CryptoUtils } from '../utils/crypto.js';
import { Validators } from '../utils/validators.js';

export class UserManager {
  constructor(storage, auth) {
    this.storage = storage;
    this.auth = auth;
  }

  async create(userData) {
    const errors = Validators.validateUserData(userData);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    const users = await this.storage.getUsers();

    // Validar que el usuario no existe
    if (users.find(u => u.username.toLowerCase() === userData.username.toLowerCase())) {
      throw new Error('El nombre de usuario ya existe');
    }

    // Validar que el email no existe
    if (userData.email && users.find(u => u.email && u.email.toLowerCase() === userData.email.toLowerCase())) {
      throw new Error('El email ya está registrado');
    }

    // Validar pregunta de seguridad
    if (!userData.securityQuestion || !userData.securityAnswer) {
      throw new Error('Debes configurar una pregunta de seguridad');
    }

    if (userData.securityAnswer.trim().length < 2) {
      throw new Error('La respuesta debe tener al menos 2 caracteres');
    }

    // Hash de contraseña y respuesta de seguridad
    const passwordHash = await CryptoUtils.hashPassword(userData.password);
    const securityAnswerHash = await CryptoUtils.hashPassword(
      userData.securityAnswer.toLowerCase().trim()
    );

    const newUser = {
      id: CryptoUtils.generateSecureId('user'),
      username: userData.username,
      passwordHash,
      name: userData.name,
      role: userData.role,
      email: userData.email,
      securityQuestion: userData.securityQuestion,
      securityAnswerHash, // ✅ Guardamos hash, no texto plano
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    users.push(newUser);
    await this.storage.saveUsers(users);

    // Retornar sin datos sensibles
    const { passwordHash: _, securityAnswerHash: __, ...userWithoutSensitiveData } = newUser;
    return userWithoutSensitiveData;
  }

  async update(userId, updates) {
    const users = await this.storage.getUsers();
    const index = users.findIndex(u => u.id === userId);

    if (index === -1) throw new Error('Usuario no encontrado');

    this._validateAdminPermission();
    this._validateNotMainAdmin(users[index].id, updates.role);

    // Si se actualiza la contraseña, hashearla
    if (updates.password) {
      updates.passwordHash = await CryptoUtils.hashPassword(updates.password);
      delete updates.password;
    }

    // Si se actualiza la respuesta de seguridad, hashearla
    if (updates.securityAnswer) {
      updates.securityAnswerHash = await CryptoUtils.hashPassword(
        updates.securityAnswer.toLowerCase().trim()
      );
      delete updates.securityAnswer;
    }

    // Validar email único si se actualiza
    if (updates.email) {
      const emailExists = users.some((u, i) =>
        i !== index && u.email && u.email.toLowerCase() === updates.email.toLowerCase()
      );
      if (emailExists) {
        throw new Error('El email ya está en uso');
      }
    }

    users[index] = {
      ...users[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.storage.saveUsers(users);

    // Retornar sin datos sensibles
    const { passwordHash, securityAnswerHash, ...userWithoutSensitiveData } = users[index];
    return userWithoutSensitiveData;
  }

  // ============================================
  // NUEVA FUNCIÓN: Verificar respuesta de seguridad
  // ============================================
  /**
   * Verifica la respuesta de seguridad de un usuario
   * @param {string} username - Nombre de usuario
   * @param {string} answer - Respuesta en texto plano
   * @returns {Promise<{valid: boolean, userId?: string, username?: string, message?: string}>}
   */
  async verifySecurityAnswer(username, answer) {
    try {
      const users = await this.storage.getUsers();
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

      if (!user) {
        return { valid: false, message: 'Usuario no encontrado' };
      }

      // El campo puede llamarse securityAnswerHash o securityAnswer (legacy setup)
      const storedHash = user.securityAnswerHash || user.securityAnswer;

      if (!storedHash) {
        return { valid: false, message: 'Este usuario no tiene pregunta de seguridad configurada' };
      }

      // Verificar respuesta (case-insensitive, trimmed)
      // Usamos CryptoUtils.verifyPassword que es robusto (SHA-256)
      let isValid = await CryptoUtils.verifyPassword(answer.toLowerCase().trim(), storedHash);

      // Fallback para Bcrypt (compatibilidad con versiones anteriores)
      const bcrypt = (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt) ? dcodeIO.bcrypt : (typeof window !== 'undefined' ? window.bcrypt : null);

      if (!isValid && bcrypt) {
        try {
          isValid = await bcrypt.compare(answer.toLowerCase().trim(), storedHash);
        } catch (e) {
          // No es un hash de Bcrypt
        }
      }

      if (isValid) {
        return {
          valid: true,
          userId: user.id,
          username: user.username
        };
      } else {
        return { valid: false, message: 'Respuesta incorrecta' };
      }

    } catch (error) {
      console.error('Error verificando respuesta:', error);
      throw new Error('Error al verificar respuesta de seguridad');
    }
  }

  // ============================================
  // NUEVA FUNCIÓN: Resetear contraseña con pregunta de seguridad
  // ============================================
  async resetPasswordWithSecurityAnswer(username, answer, newPassword) {
    try {
      // Verificar respuesta
      const verification = await this.verifySecurityAnswer(username, answer);

      if (!verification.valid) {
        throw new Error(verification.message || 'Respuesta incorrecta');
      }

      // Validar nueva contraseña
      if (!newPassword || newPassword.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres');
      }

      // Actualizar contraseña
      const users = await this.storage.getUsers();
      const userIndex = users.findIndex(u => u.id === verification.userId);

      if (userIndex === -1) {
        throw new Error('Usuario no encontrado');
      }

      users[userIndex].passwordHash = await CryptoUtils.hashPassword(newPassword);
      users[userIndex].updatedAt = new Date().toISOString();

      await this.storage.saveUsers(users);

      return true;

    } catch (error) {
      console.error('Error reseteando contraseña:', error);
      throw error;
    }
  }

  // ============================================
  // NUEVA FUNCIÓN: Obtener pregunta de seguridad de un usuario
  // ============================================
  async getSecurityQuestion(username) {
    try {
      const users = await this.storage.getUsers();
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

      if (!user) {
        // Por seguridad, no revelar si el usuario existe
        return { found: false };
      }

      if (!user.securityQuestion) {
        return { found: false, message: 'Usuario sin pregunta configurada' };
      }

      return {
        found: true,
        question: user.securityQuestion,
        username: user.username
      };

    } catch (error) {
      console.error('Error obteniendo pregunta:', error);
      throw new Error('Error al obtener pregunta de seguridad');
    }
  }

  async delete(userId) {
    const users = await this.storage.getUsers();

    this._validateAdminPermission();

    // No permitir eliminar al usuario actual
    const currentUser = this.auth.getCurrentUser();
    if (userId === currentUser.id) {
      throw new Error('No puedes eliminar tu propio usuario');
    }

    // No permitir eliminar el usuario admin por defecto
    const userToDelete = users.find(u => u.id === userId);
    if (userToDelete && userToDelete.id === 'admin') {
      throw new Error('No se puede eliminar el usuario administrador principal');
    }

    const updatedUsers = users.filter(u => u.id !== userId);
    await this.storage.saveUsers(updatedUsers);
    return true;
  }

  async getAll() {
    const users = await this.storage.getUsers();

    // Si no es admin, solo puede ver su propio usuario
    if (!this.auth.isAdmin()) {
      const currentUser = this.auth.getCurrentUser();
      return users.filter(u => u.id === currentUser.id);
    }

    return users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  async getById(userId) {
    const users = await this.storage.getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) throw new Error('Usuario no encontrado');

    // Si no es admin, solo puede ver su propio usuario
    if (!this.auth.isAdmin()) {
      const currentUser = this.auth.getCurrentUser();
      if (userId !== currentUser.id) {
        throw new Error('No tienes permisos para ver este usuario');
      }
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async changePassword(userId, currentPassword, newPassword) {
    try {
      const users = await this.storage.getUsers();
      const userIndex = users.findIndex(u => u.id === userId);

      if (userIndex === -1) {
        throw new Error('Usuario no encontrado');
      }

      const user = users[userIndex];

      // Verificar password actual
      const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);

      if (!isValidPassword) {
        throw new Error('La contraseña actual es incorrecta');
      }

      // Validar nueva contraseña
      if (!Validators.isValidPassword(newPassword)) {
        throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
      }

      // Hashear nueva contraseña
      const newPasswordHash = await dcodeIO.bcrypt.hash(newPassword, 10);

      // Actualizar
      users[userIndex].passwordHash = newPasswordHash;
      users[userIndex].updatedAt = new Date().toISOString();

      await this.storage.saveUsers(users);

      // Registrar en audit log
      await this.auditLog.log('update', 'user', userId, {
        action: 'password_change'
      });

      return true;

    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      throw error;
    }
  }



  // Métodos auxiliares para eliminar redundancias
  _validateAdminPermission() {
    if (!this.auth.isAdmin()) {
      throw new Error('Solo los administradores pueden realizar esta acción');
    }
  }

  _validateNotMainAdmin(userId, newRole) {
    if (userId === 'admin' && newRole !== 'admin') {
      throw new Error('No se puede cambiar el rol del administrador principal');
    }
  }


  /**
   * Actualiza el email de un usuario
   * @param {string} userId - ID del usuario
   * @param {string} email - Nuevo email
   * @returns {Promise<boolean>}
   */
  async updateEmail(userId, email) {
    try {
      const users = await this.storage.getUsers();
      const userIndex = users.findIndex(u => u.id === userId);

      if (userIndex === -1) {
        throw new Error('Usuario no encontrado');
      }

      // Validar que no sea admin principal cambiando su propio email sin permisos
      const currentUser = this.auth.getCurrentUser();
      if (!this.auth.isAdmin() && userId !== currentUser.id) {
        throw new Error('No tienes permisos para cambiar el email de otro usuario');
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Formato de email inválido');
      }

      // Verificar que no exista otro usuario con ese email
      if (users.some((u, i) => i !== userIndex && u.email && u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('El email ya está en uso');
      }

      users[userIndex].email = email;
      users[userIndex].updatedAt = new Date().toISOString();

      await this.storage.saveUsers(users);

      return true;

    } catch (error) {
      console.error('Error actualizando email:', error);
      throw error;
    }
  }

}