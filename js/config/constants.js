export const APP_CONSTANTS = {
  APP_NAME: 'CoinFlow',
  APP_VERSION: '2.0.0',
  MIN_WITHDRAWAL: 50,
  MAX_WITHDRAWAL: 10000,
  COIN_TO_BDT_RATE: 20,
  MAX_DAILY_SPINS: 2,
  CACHE_TIMEOUT: 5 * 60 * 1000,
  RATE_LIMITS: {
    CHECKIN: { limit: 1, window: 24 * 60 * 60 * 1000 },
    SPIN: { limit: 2, window: 24 * 60 * 60 * 1000 },
    WITHDRAWAL: { limit: 3, window: 24 * 60 * 60 * 1000 }
  }
};

export const VALIDATION_PATTERNS = {
  PHONE: /^01[3-9]\d{8}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  USERNAME: /^[a-zA-Z0-9_]{3,20}$/,
  USER_ID: /^[a-zA-Z0-9_]{4,20}$/,
  AMOUNT: /^\d+(\.\d{1,2})?$/
};

export const ERROR_MESSAGES = {
  NETWORK: 'Network error. Please check your connection.',
  PERMISSION: 'You don\'t have permission to do that.',
  NOT_FOUND: 'Resource not found.',
  VALIDATION: {
    PHONE: 'Please enter a valid Bangladesh phone number (01XXXXXXXXX)',
    PASSWORD: 'Password must be at least 8 characters with uppercase, lowercase, number and special character',
    USERNAME: 'Username must be 3-20 characters (letters, numbers, underscore)',
    USER_ID: 'User ID must be 4-20 characters (letters, numbers, underscore)',
    AMOUNT: 'Please enter a valid amount',
    REQUIRED: 'All fields are required'
  },
  AUTH: {
    INVALID_CREDENTIALS: 'Invalid phone number or password',
    USER_EXISTS: 'User already exists',
    WEAK_PASSWORD: 'Password is too weak'
  }
};
