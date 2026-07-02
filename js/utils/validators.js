// js/utils/validators.js


export class Validators {
  static validateTransactionData(data) {
    const errors = [];
    
    if (!data.type || !['income', 'expense'].includes(data.type)) {
      errors.push('Tipo de transacción inválido');
    }
    
    if (!this.isValidAmount(data.amount)) {
      errors.push('El monto debe ser un número mayor a 0');
    }
    
    if (!this.isValidDate(data.date)) {
      errors.push('Fecha inválida');
    }
    
    if (!this.isValidRequiredField(data.category)) {
      errors.push('Categoría requerida');
    }
    
    if (!data.paymentMethod || !['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Ahorro'].includes(data.paymentMethod)) {
      errors.push('Método de pago inválido');
    }
    
    return errors;
  }

  static validateUserData(data) {
    const errors = [];
    
    if (!this.isValidName(data.name)) {
      errors.push('El nombre debe tener al menos 2 caracteres');
    }
    
    if (!this.isValidUsername(data.username)) {
      errors.push('El usuario debe tener al menos 3 caracteres');
    }
    
    if (!this.isValidPassword(data.password)) {
      errors.push('La contraseña debe tener al menos 6 caracteres');
    }
    
    if (!data.role || !['admin', 'user'].includes(data.role)) {
      errors.push('Rol inválido');
    }
    
    return errors;
  }

  static validateBudgetData(data) {
    const errors = [];
    
    if (!this.isValidRequiredField(data.category)) {
      errors.push('Categoría requerida');
    }
    
    if (!this.isValidAmount(data.limit)) {
      errors.push('El límite debe ser un número mayor a 0');
    }
    
    if (!data.period || !['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'].includes(data.period)) {
      errors.push('Período inválido');
    }
    
    return errors;
  }

  static validateSavingsData(data) {
    const errors = [];
    
    if (!this.isValidName(data.name)) {
      errors.push('El nombre debe tener al menos 2 caracteres');
    }
    
    if (!this.isValidAmount(data.goalAmount)) {
      errors.push('La meta debe ser un número mayor a 0');
    }
    
    if (data.currency && !['ARS', 'USD', 'EUR'].includes(data.currency)) {
      errors.push('Moneda inválida');
    }
    
    return errors;
  }

  static validateCardData(data) {
    const errors = [];
    
    if (!this.isValidName(data.name)) {
      errors.push('El nombre debe tener al menos 2 caracteres');
    }
    
    if (!data.type || !['Débito', 'Crédito'].includes(data.type)) {
      errors.push('Tipo de tarjeta inválido');
    }
    
    if (!this.isValidDueDay(data.dueDay)) {
      errors.push('Día de vencimiento inválido (1-31)');
    }
    
    return errors;
  }

  // Métodos de validación reutilizables
  static isValidAmount(amount) {
    return amount && amount > 0 && !isNaN(amount);
  }

  static isValidDate(date) {
    return date && !isNaN(new Date(date).getTime());
  }

  static isValidRequiredField(field) {
    return field && field.trim() !== '';
  }

  static isValidName(name) {
    return name && name.trim().length >= 2;
  }

  static isValidUsername(username) {
    return username && username.trim().length >= 3;
  }

  static isValidPassword(password) {
    return password && password.length >= 6;
  }

  static isValidDueDay(dueDay) {
    return dueDay && dueDay >= 1 && dueDay <= 31 && !isNaN(dueDay);
  }

  /**
   * Valida formato de email
   * @param {string} email - Email a validar
   * @returns {boolean}
   */
  static isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }


/**
   * Valida respuesta de seguridad
   * @param {string} answer - Respuesta a validar
   * @returns {boolean}
   */
  static isValidSecurityAnswer(answer) {
    if (!answer || typeof answer !== 'string') return false;
    const trimmed = answer.trim();
    return trimmed.length >= 2 && trimmed.length <= 100;
  }

}

