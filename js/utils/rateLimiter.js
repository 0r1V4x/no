import { APP_CONSTANTS } from '../config/constants.js';

export class RateLimiter {
  constructor() {
    this.limiters = new Map();
    this.storage = this.initStorage();
  }

  initStorage() {
    try {
      return localStorage;
    } catch {
      return new Map();
    }
  }

  create(key, { limit, window }) {
    const limiter = {
      limit,
      window,
      requests: []
    };
    this.limiters.set(key, limiter);
    return limiter;
  }

  async check(key, action) {
    const config = APP_CONSTANTS.RATE_LIMITS[action.toUpperCase()];
    if (!config) return true;

    let limiter = this.limiters.get(key);
    if (!limiter) {
      limiter = this.create(key, config);
    }

    const now = Date.now();
    const storageKey = `rate_${key}_${action}`;
    
    let requests = this.loadFromStorage(storageKey) || [];
    
    requests = requests.filter(time => now - time < config.window);
    
    if (requests.length >= config.limit) {
      const oldestRequest = requests[0];
      const timeToWait = config.window - (now - oldestRequest);
      throw new Error(`Rate limit exceeded. Please try again in ${Math.ceil(timeToWait / 60000)} minutes.`);
    }
    
    requests.push(now);
    this.saveToStorage(storageKey, requests);
    
    limiter.requests = requests;
    
    return true;
  }

  getRemaining(key, action) {
    const config = APP_CONSTANTS.RATE_LIMITS[action.toUpperCase()];
    if (!config) return Infinity;

    const storageKey = `rate_${key}_${action}`;
    const requests = this.loadFromStorage(storageKey) || [];
    const now = Date.now();
    
    const validRequests = requests.filter(time => now - time < config.window);
    return Math.max(0, config.limit - validRequests.length);
  }

  reset(key, action) {
    const storageKey = `rate_${key}_${action}`;
    this.saveToStorage(storageKey, []);
    
    const limiter = this.limiters.get(key);
    if (limiter) {
      limiter.requests = [];
    }
  }

  loadFromStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return this.storage.get(key);
    }
  }

  saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      this.storage.set(key, data);
    }
  }
}

export const rateLimiter = new RateLimiter();
