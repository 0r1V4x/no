import { VALIDATION_PATTERNS, ERROR_MESSAGES } from '../config/constants.js';

export class Validator {
  static sanitize(input) {
    if (typeof input !== 'string') return input;
    return input
      .replace(/[<>]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  static phone(phone) {
    return VALIDATION_PATTERNS.PHONE.test(phone);
  }

  static password(password) {
    return VALIDATION_PATTERNS.PASSWORD.test(password);
  }

  static username(username) {
    return VALIDATION_PATTERNS.USERNAME.test(username);
  }

  static userId(userId) {
    return VALIDATION_PATTERNS.USER_ID.test(userId);
  }

  static amount(amount, min = 0, max = Infinity) {
    if (!VALIDATION_PATTERNS.AMOUNT.test(String(amount))) return false;
    const num = parseFloat(amount);
    return num >= min && num <= max && Number.isFinite(num);
  }

  static email(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  static referralCode(code) {
    return /^[A-Z0-9]{8}$/.test(code);
  }

  static getErrorMessage(type, field) {
    return ERROR_MESSAGES.VALIDATION[type.toUpperCase()] || `Invalid ${field}`;
  }

  static validateSignup(data) {
    const errors = [];

    if (!this.username(data.username)) {
      errors.push({ field: 'username', message: this.getErrorMessage('username', 'username') });
    }

    if (!this.userId(data.userId)) {
      errors.push({ field: 'userId', message: this.getErrorMessage('userId', 'User ID') });
    }

    if (!this.phone(data.phone)) {
      errors.push({ field: 'phone', message: this.getErrorMessage('phone', 'phone') });
    }

    if (!this.password(data.password)) {
      errors.push({ field: 'password', message: this.getErrorMessage('password', 'password') });
    }

    if (data.inviteCode && !this.referralCode(data.inviteCode)) {
      errors.push({ field: 'inviteCode', message: 'Invalid invite code' });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateLogin(phone, password) {
    const errors = [];

    if (!this.phone(phone)) {
      errors.push({ field: 'phone', message: this.getErrorMessage('phone', 'phone') });
    }

    if (!password || password.length < 6) {
      errors.push({ field: 'password', message: 'Password must be at least 6 characters' });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateWithdrawal(data, balance) {
    const errors = [];

    if (!data.method) {
      errors.push({ field: 'method', message: 'Please select a payment method' });
    }

    if (!data.account || !/^\d{11}$/.test(data.account)) {
      errors.push({ field: 'account', message: 'Please enter a valid 11-digit account number' });
    }

    if (!this.amount(data.amount, 50, balance)) {
      errors.push({ field: 'amount', message: `Amount must be between 50 and ${balance} BDT` });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
