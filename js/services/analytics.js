class AnalyticsService {
  constructor() {
    this.events = [];
    this.maxEvents = 100;
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  track(eventName, data = {}) {
    const event = {
      name: eventName,
      data: {
        ...data,
        sessionId: this.sessionId,
        sessionDuration: Date.now() - this.startTime
      },
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      online: navigator.onLine
    };

    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user) {
      event.userId = user.uid;
    }

    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    if (import.meta.env.DEV) {
      console.log('Analytics:', event);
    }

    if (window.firebaseAnalytics) {
      try {
        window.firebaseAnalytics.logEvent(eventName, data);
      } catch (error) {
        console.error('Failed to send to Firebase Analytics:', error);
      }
    }

    return event;
  }

  trackPageView(page) {
    this.track('page_view', { page });
  }

  trackError(error, context = {}) {
    this.track('error', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      ...context
    });
  }

  trackPerformance(metric, value) {
    this.track('performance', { metric, value });
  }

  getEvents() {
    return this.events;
  }

  clearEvents() {
    this.events = [];
  }

  trackWebVitals() {
    if ('web-vital' in window) {
      window.webVital.getCLS((metric) => {
        this.trackPerformance('CLS', metric.value);
      });

      window.webVital.getFID((metric) => {
        this.trackPerformance('FID', metric.value);
      });

      window.webVital.getLCP((metric) => {
        this.trackPerformance('LCP', metric.value);
      });
    }
  }
}

export const analytics = new AnalyticsService();
