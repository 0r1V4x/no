import { ERROR_MESSAGES } from '../config/constants.js';
import { analytics } from '../services/analytics.js';

export class AppError extends Error {
  constructor(message, code, userMessage, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage || message;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100;
  }

  async handle(error, context = {}) {
    console.error('Error:', error, context);
    
    this.addToLog(error, context);
    
    analytics.track('error', {
      message: error.message,
      code: error.code,
      context,
      stack: error.stack
    });
    
    const userMessage = this.getUserMessage(error);
    
    return {
      message: userMessage,
      code: error.code || 'UNKNOWN_ERROR'
    };
  }

  getUserMessage(error) {
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      return ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS;
    }
    
    if (error.code === 'auth/email-already-in-use') {
      return ERROR_MESSAGES.AUTH.USER_EXISTS;
    }
    
    if (error.code === 'auth/weak-password') {
      return ERROR_MESSAGES.AUTH.WEAK_PASSWORD;
    }
    
    if (error.code === 'permission-denied') {
      return ERROR_MESSAGES.PERMISSION;
    }
    
    if (error.code === 'unavailable' || error.code === 'network-error') {
      return ERROR_MESSAGES.NETWORK;
    }
    
    if (error.code === 'not-found') {
      return ERROR_MESSAGES.NOT_FOUND;
    }
    
    if (error.userMessage) {
      return error.userMessage;
    }
    
    return error.message || 'An unexpected error occurred';
  }

  addToLog(error, context) {
    this.errorLog.push({
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack
      },
      context,
      timestamp: new Date().toISOString()
    });
    
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  }

  getErrorLog() {
    return this.errorLog;
  }

  clearLog() {
    this.errorLog = [];
  }

  wrap(fn, errorMessage) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        const handled = await this.handle(error, { fn: fn.name, args });
        throw new AppError(handled.message, error.code, errorMessage || handled.message);
      }
    };
  }
}

export const errorHandler = new ErrorHandler();

export function withErrorHandling(fn, errorMessage) {
  return errorHandler.wrap(fn, errorMessage);
}
