import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  onSnapshot,
  orderBy, 
  limit,
  addDoc,
  updateDoc,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase.js';
import { store } from '../store/store.js';
import { DataService } from './storage.js';
import { analytics } from './analytics.js';

class AdminControlledService {
  constructor() {
    this.listeners = new Map();
    this.appConfig = null;
    this.earningRates = null;
    this.withdrawalSettings = null;
  }

  async getAppConfig() {
    try {
      const config = await DataService.getWithCache('app_config', async () => {
        const configDoc = await getDoc(doc(db, 'app_config', 'current'));
        return configDoc.exists() ? configDoc.data() : this.getDefaultAppConfig();
      });
      
      this.appConfig = config;
      
      if (config.maintenanceMode) {
        this.showMaintenanceMode(config.maintenanceMessage);
      }
      
      if (config.forceUpdate && this.isUpdateRequired(config.minVersion)) {
        this.showForceUpdate();
      }
      
      return config;
    } catch (error) {
      console.error('Failed to get app config:', error);
      return this.getDefaultAppConfig();
    }
  }

  getDefaultAppConfig() {
    return {
      maintenanceMode: false,
      maintenanceMessage: 'Under maintenance',
      forceUpdate: false,
      minVersion: '1.0.0',
      latestVersion: '2.0.0',
      announcement: null
    };
  }

  isUpdateRequired(minVersion) {
    const currentVersion = import.meta.env.VITE_APP_VERSION;
    return this.compareVersions(currentVersion, minVersion) < 0;
  }

  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      if (parts1[i] > parts2[i]) return 1;
      if (parts1[i] < parts2[i]) return -1;
    }
    return 0;
  }

  showMaintenanceMode(message) {
    const overlay = document.createElement('div');
    overlay.className = 'maintenance-overlay';
    overlay.innerHTML = `
      <div class="maintenance-content">
        <i class="fas fa-tools"></i>
        <h2>Maintenance Mode</h2>
        <p>${message || 'We\'ll be back soon!'}</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  showForceUpdate() {
    const overlay = document.createElement('div');
    overlay.className = 'update-overlay';
    overlay.innerHTML = `
      <div class="update-content">
        <i class="fas fa-download"></i>
        <h2>Update Required</h2>
        <p>A new version is available. Please update to continue.</p>
        <button onclick="window.location.reload()" class="btn btn-primary">Update Now</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  async getEarningRates() {
    try {
      const rates = await DataService.getWithCache('earning_rates', async () => {
        const ratesDoc = await getDoc(doc(db, 'settings_earnings', 'current'));
        return ratesDoc.exists() ? ratesDoc.data() : this.getDefaultEarningRates();
      });
      
      this.earningRates = rates;
      return rates;
    } catch (error) {
      console.error('Failed to get earning rates:', error);
      return this.getDefaultEarningRates();
    }
  }

  getDefaultEarningRates() {
    return {
      checkinRewards: {
        day1: 10,
        day2: 10,
        day3: 10,
        day4: 10,
        day5: 10,
        day6: 10,
        day7: 20
      },
      spinRewards: [5, 10, 15, 20, 10, 5],
      videoRewards: {
        min: 5,
        max: 10
      },
      referralBonus: 50,
      coinToBdtRate: 20
    };
  }

  async getWithdrawalSettings() {
    try {
      const settings = await DataService.getWithCache('withdrawal_settings', async () => {
        const settingsDoc = await getDoc(doc(db, 'settings_withdrawal', 'current'));
        return settingsDoc.exists() ? settingsDoc.data() : this.getDefaultWithdrawalSettings();
      });
      
      this.withdrawalSettings = settings;
      return settings;
    } catch (error) {
      console.error('Failed to get withdrawal settings:', error);
      return this.getDefaultWithdrawalSettings();
    }
  }

  getDefaultWithdrawalSettings() {
    return {
      minAmount: 50,
      maxAmount: 10000,
      dailyLimit: 10000,
      methods: [
        { id: 'bkash', name: 'bKash', enabled: true },
        { id: 'nagad', name: 'Nagad', enabled: true },
        { id: 'rocket', name: 'Rocket', enabled: false }
      ],
      processingTime: '24-48 hours',
      status: 'active'
    };
  }

  async getVideos(limitCount = 10) {
    try {
      const videosQuery = query(
        collection(db, 'videos'),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(videosQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Failed to get videos:', error);
      return [];
    }
  }

  subscribeToVideos(callback) {
    const q = query(
      collection(db, 'videos'),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const videos = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(videos);
    });
    
    return unsubscribe;
  }

  async getActiveTasks() {
    try {
      const now = new Date();
      const tasksQuery = query(
        collection(db, 'tasks'),
        where('status', '==', 'active'),
        where('expiryDate', '>', now),
        orderBy('expiryDate', 'asc'),
        limit(20)
      );
      
      const snapshot = await getDocs(tasksQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Failed to get tasks:', error);
      return [];
    }
  }

  async completeTask(taskId, userId) {
    try {
      const completionQuery = query(
        collection(db, 'task_completions'),
        where('taskId', '==', taskId),
        where('userId', '==', userId)
      );
      
      const existing = await getDocs(completionQuery);
      if (!existing.empty) {
        throw new Error('Task already completed');
      }

      const taskDoc = await getDoc(doc(db, 'tasks', taskId));
      if (!taskDoc.exists()) {
        throw new Error('Task not found');
      }

      const task = taskDoc.data();
      
      await addDoc(collection(db, 'task_completions'), {
        taskId,
        userId,
        reward: task.reward,
        completedAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'users', userId), {
        coins: increment(task.reward),
        balance: increment(task.reward / 20),
        totalEarned: increment(task.reward / 20),
        completedTasks: increment(1)
      });

      return task.reward;
    } catch (error) {
      console.error('Failed to complete task:', error);
      throw error;
    }
  }

  async getAdConfig(adType) {
    try {
      const adsQuery = query(
        collection(db, 'ads'),
        where('type', '==', adType),
        where('status', '==', 'active'),
        limit(1)
      );
      
      const snapshot = await getDocs(adsQuery);
      if (!snapshot.empty) {
        return snapshot.docs[0].data();
      }
      
      return {
        unitId: adType === 'rewarded' 
          ? import.meta.env.VITE_ADMOB_REWARDED_AD_UNIT
          : import.meta.env.VITE_ADMOB_INTERSTITIAL_AD_UNIT,
        frequency: 1,
        reward: adType === 'rewarded' ? { min: 5, max: 10 } : null
      };
    } catch (error) {
      console.error('Failed to get ad config:', error);
      return null;
    }
  }

  async checkUserStatus(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return { isBlocked: false };

      const userData = userDoc.data();
      
      if (userData.isBlocked) {
        this.showBlockedMessage(userData.blockReason);
        return { isBlocked: true, reason: userData.blockReason };
      }

      if (userData.role === 'admin' || userData.role === 'moderator') {
        this.enableAdminFeatures();
      }

      return { isBlocked: false, role: userData.role };
    } catch (error) {
      console.error('Failed to check user status:', error);
      return { isBlocked: false };
    }
  }

  showBlockedMessage(reason) {
    const overlay = document.createElement('div');
    overlay.className = 'blocked-overlay';
    overlay.innerHTML = `
      <div class="blocked-content">
        <i class="fas fa-ban"></i>
        <h2>Account Blocked</h2>
        <p>${reason || 'Your account has been blocked. Contact support for more information.'}</p>
        <button onclick="window.location.href='mailto:support@coinflow.app'" class="btn btn-primary">
          Contact Support
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  enableAdminFeatures() {
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.innerHTML = '<i class="fas fa-crown"></i> Admin';
    
    const profileHeader = document.querySelector('.profile-header');
    if (profileHeader) {
      profileHeader.appendChild(badge);
    }
    
    const adminActions = document.createElement('div');
    adminActions.className = 'admin-actions';
    adminActions.innerHTML = `
      <button onclick="window.open('/admin', '_blank')" class="btn btn-outline">
        <i class="fas fa-cog"></i> Admin Panel
      </button>
    `;
    
    const profileSection = document.querySelector('#profileSection');
    if (profileSection) {
      profileSection.appendChild(adminActions);
    }
  }

  subscribeToConfigChanges() {
    this.listeners.set('app_config', onSnapshot(
      doc(db, 'app_config', 'current'),
      (doc) => {
        if (doc.exists()) {
          this.appConfig = doc.data();
          store.setState({ appConfig: this.appConfig });
        }
      }
    ));

    this.listeners.set('earning_rates', onSnapshot(
      doc(db, 'settings_earnings', 'current'),
      (doc) => {
        if (doc.exists()) {
          this.earningRates = doc.data();
          store.setState({ earningRates: this.earningRates });
        }
      }
    ));

    this.listeners.set('withdrawal_settings', onSnapshot(
      doc(db, 'settings_withdrawal', 'current'),
      (doc) => {
        if (doc.exists()) {
          this.withdrawalSettings = doc.data();
          store.setState({ withdrawalSettings: this.withdrawalSettings });
          this.updateWithdrawalUI();
        }
      }
    ));
  }

  updateWithdrawalUI() {
    if (!this.withdrawalSettings) return;

    const minAmount = document.getElementById('minWithdrawal');
    const maxAmount = document.getElementById('maxWithdrawal');
    const processingTime = document.getElementById('processingTime');
    const methodSelect = document.getElementById('withdrawMethod');

    if (minAmount) {
      minAmount.textContent = `৳ ${this.withdrawalSettings.minAmount}`;
    }
    if (maxAmount) {
      maxAmount.textContent = `৳ ${this.withdrawalSettings.maxAmount}`;
    }
    if (processingTime) {
      processingTime.textContent = this.withdrawalSettings.processingTime;
    }
    if (methodSelect) {
      methodSelect.innerHTML = '<option value="">Select Payment Method</option>';
      this.withdrawalSettings.methods
        .filter(method => method.enabled)
        .forEach(method => {
          methodSelect.innerHTML += `<option value="${method.id}">${method.name}</option>`;
        });
    }
  }

  cleanup() {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }
}

export const adminService = new AdminControlledService();
