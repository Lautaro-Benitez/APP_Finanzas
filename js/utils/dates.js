// js/utils/dates.js - VERSIÓN CORREGIDA COMPLETA
export class DateUtils {
  // ✅ CRÍTICO: Normalización de fechas corregida para evitar errores de zona horaria
  static normalizeDate(dateString) {
    if (!dateString) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}T00:00:00.000Z`;
    }
    
    // Si es formato YYYY-MM-DD del input date
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return `${dateString}T00:00:00.000Z`;
    }
    
    // Si ya tiene componente de tiempo, extraer solo la fecha
    if (dateString.includes('T')) {
      const datePart = dateString.split('T')[0];
      return `${datePart}T00:00:00.000Z`;
    }
    
    // Fallback: intentar extraer fecha
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}T00:00:00.000Z`;
    } catch (error) {
      console.error('Error normalizing date:', error);
      return `${dateString}T00:00:00.000Z`;
    }
  }

  static formatCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }

  static formatDateToISO(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }

  static formatDateComponents(date, separator = '/') {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return { year, month, day };
  }

  static formatDateForDisplay(isoString) {
    const date = new Date(isoString);
    const { day, month, year } = this.formatDateComponents(date);
    return `${day}/${month}/${year}`;
  }

  static formatDateForInput(isoString) {
    const date = new Date(isoString);
    const { year, month, day } = this.formatDateComponents(date, '-');
    return `${year}-${month}-${day}`;
  }

  static getPeriodDates(period) {
    const now = new Date();
    let start, end;

    switch(period) {
      case 'week':
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        end = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    return { 
      start: this.normalizeDate(start.toISOString()), 
      end: this.normalizeDate(end.toISOString()) 
    };
  }

  static isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }

  static addDays(dateString, days) {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);
    return this.normalizeDate(date.toISOString());
  }

  static addMonths(dateString, months) {
    const date = new Date(dateString);
    date.setMonth(date.getMonth() + months);
    return this.normalizeDate(date.toISOString());
  }

  static getDaysDifference(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  static isToday(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    return this.isSameDay(date, today);
  }

  static isPast(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    return date < today && !this.isSameDay(date, today);
  }

  static isFuture(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    return date > today && !this.isSameDay(date, today);
  }
}