export function generateId(prefix = '') {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function formatCurrency(amount, currency = '৳') {
  return `${currency} ${amount.toFixed(2)}`;
}

export function formatDate(date, format = 'short') {
  const d = date instanceof Date ? date : new Date(date);
  
  if (format === 'short') {
    return d.toLocaleDateString('en-BD', { month: 'short', day: 'numeric' });
  }
  
  if (format === 'long') {
    return d.toLocaleDateString('en-BD', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  return d.toISOString();
}

export function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle(fn, limit = 300) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry(fn, maxAttempts = 3, delay = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxAttempts - 1) throw error;
      await sleep(delay * Math.pow(2, i));
    }
  }
}

export function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency
  };
}

export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  }
}

export async function shareContent(title, text, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
