class Store {
  constructor() {
    this.state = {
      user: null,
      userData: null,
      loading: false,
      toast: null,
      online: navigator.onLine,
      currentTab: 'home',
      spinWheelOpen: false,
      theme: 'light',
      appConfig: null,
      earningRates: null,
      withdrawalSettings: null,
      videos: [],
      tasks: []
    };
    
    this.listeners = [];
    this.initOnlineListener();
  }

  initOnlineListener() {
    window.addEventListener('online', () => {
      this.setState({ online: true });
      this.hideOfflineIndicator();
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      this.setState({ online: false });
      this.showOfflineIndicator();
    });
  }

  getState() {
    return this.state;
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.notify();
    this.persistState();
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  persistState() {
    const persistKeys = ['user', 'theme'];
    const toPersist = {};
    
    persistKeys.forEach(key => {
      if (this.state[key] !== undefined) {
        toPersist[key] = this.state[key];
      }
    });

    localStorage.setItem('appState', JSON.stringify(toPersist));
  }

  loadPersistedState() {
    try {
      const saved = localStorage.getItem('appState');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.setState(parsed);
      }
    } catch (error) {
      console.error('Failed to load persisted state:', error);
    }
  }

  setUser(user) {
    this.setState({ user });
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }

  setUserData(userData) {
    this.setState({ userData });
  }

  setLoading(loading) {
    this.setState({ loading });
  }

  showToast(message, type = 'success', duration = 3000) {
    this.setState({ toast: { message, type, duration } });
    
    setTimeout(() => {
      this.setState({ toast: null });
    }, duration);
  }

  setCurrentTab(tab) {
    this.setState({ currentTab: tab });
  }

  setSpinWheelOpen(open) {
    this.setState({ spinWheelOpen: open });
  }

  setTheme(theme) {
    this.setState({ theme });
    document.documentElement.setAttribute('data-theme', theme);
  }

  async addToQueue(action) {
    const queue = await this.getQueue();
    queue.push({
      ...action,
      id: Date.now(),
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('offlineQueue', JSON.stringify(queue));
  }

  async getQueue() {
    const queue = localStorage.getItem('offlineQueue');
    return queue ? JSON.parse(queue) : [];
  }

  async processQueue() {
    if (!this.state.online) return;

    const queue = await this.getQueue();
    if (queue.length === 0) return;

    this.setLoading(true);

    for (const action of queue) {
      try {
        await action.handler();
        const newQueue = queue.filter(item => item.id !== action.id);
        localStorage.setItem('offlineQueue', JSON.stringify(newQueue));
      } catch (error) {
        console.error('Failed to process offline action:', error);
      }
    }

    this.setLoading(false);
  }

  showOfflineIndicator() {
    const indicator = document.getElementById('offlineIndicator');
    if (indicator) {
      indicator.style.display = 'flex';
    }
  }

  hideOfflineIndicator() {
    const indicator = document.getElementById('offlineIndicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }
}

export const store = new Store();
