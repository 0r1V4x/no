import { firebase, auth } from './services/firebase.js';
import { authService, login, signUp, logout } from './services/auth.js';
import { earningsService } from './services/earnings.js';
import { adminService } from './services/admin-service.js';
import { withdrawalService } from './services/withdrawal.js';
import { analytics } from './services/analytics.js';
import { offlineStorage } from './services/storage.js';
import { store } from './store/store.js';
import { ui } from './components/ui.js';
import { reels } from './components/reels.js';
import { wallet } from './components/wallet.js';
import { copyToClipboard, shareContent } from './utils/helpers.js';
import { onAuthStateChanged } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { db } from './services/firebase.js';

class App {
  constructor() {
    this.init();
  }

  async init() {
    store.loadPersistedState();
    
    await offlineStorage.open();
    
    await this.loadAdminSettings();
    
    this.setupAuthObserver();
    
    analytics.trackPageView('home');
    analytics.trackWebVitals();
    
    this.registerServiceWorker();
    this.setupEventListeners();
    
    setTimeout(() => {
      document.getElementById('splashScreen').style.display = 'none';
    }, 2200);
  }

  async loadAdminSettings() {
    const [appConfig, earningRates, withdrawalSettings] = await Promise.all([
      adminService.getAppConfig(),
      adminService.getEarningRates(),
      adminService.getWithdrawalSettings()
    ]);

    store.setState({
      appConfig,
      earningRates,
      withdrawalSettings
    });

    adminService.subscribeToConfigChanges();
  }

  setupAuthObserver() {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userStatus = await adminService.checkUserStatus(user.uid);
        
        if (userStatus.isBlocked) {
          await authService.logout();
          return;
        }

        store.setUser(user);
        await this.loadUserData(user.uid);
        
        const videos = await adminService.getVideos();
        store.setState({ videos });
        
        this.unsubscribeVideos = adminService.subscribeToVideos((videos) => {
          store.setState({ videos });
          reels.renderVideos(videos);
        });

        const tasks = await adminService.getActiveTasks();
        store.setState({ tasks });
        this.renderTasks(tasks);

      } else {
        store.setUser(null);
        store.setUserData(null);
        
        if (this.unsubscribeVideos) {
          this.unsubscribeVideos();
        }
      }
    });
  }

  async loadUserData(uid) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        store.setUserData(userDoc.data());
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  renderTasks(tasks) {
    const container = document.getElementById('tasksContainer');
    if (!container) return;

    if (tasks.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'grid';
    container.innerHTML = tasks.map(task => `
      <div class="task-card" data-task-id="${task.id}">
        <div class="task-icon">
          <i class="fas ${task.icon || 'fa-tasks'}"></i>
        </div>
        <div class="task-info">
          <h4 class="task-title">${task.title}</h4>
          <p class="task-reward">+${task.reward} coins</p>
          <p class="task-expiry">Expires: ${new Date(task.expiryDate?.toDate()).toLocaleDateString()}</p>
        </div>
        <button class="task-btn" onclick="app.completeTask('${task.id}')">Complete</button>
      </div>
    `).join('');
  }

  async completeTask(taskId) {
    const user = store.getState().user;
    if (!user) {
      store.showToast('Please login to complete tasks', 'error');
      return;
    }

    try {
      store.setLoading(true);
      const reward = await adminService.completeTask(taskId, user.uid);
      store.showToast(`+${reward} coins for completing task!`);
      analytics.track('task_completed', { taskId, reward });
    } catch (error) {
      store.showToast(error.message, 'error');
    } finally {
      store.setLoading(false);
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then(registration => {
            console.log('ServiceWorker registered:', registration);
            this.requestNotificationPermission();
          })
          .catch(error => {
            console.log('ServiceWorker registration failed:', error);
          });
      });
    }
  }

  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      analytics.track('notification_permission', { permission });
    }
  }

  setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        if (tab) {
          this.switchTab(tab);
        }
      });
    });

    document.querySelector('[data-action="login"]')?.addEventListener('click', () => this.handleLogin());
    document.querySelector('[data-action="signup"]')?.addEventListener('click', () => this.handleSignup());
    document.querySelector('[data-action="logout"]')?.addEventListener('click', () => this.handleLogout());

    document.querySelectorAll('[data-toggle-auth]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const form = e.target.dataset.toggleAuth;
        this.toggleAuthForms(form);
      });
    });

    document.querySelector('[data-action="checkin"]')?.addEventListener('click', () => ui.handleCheckIn());

    document.querySelector('[data-action="open-spin"]')?.addEventListener('click', () => this.openSpinWheel());
    document.querySelector('[data-action="close-spin"]')?.addEventListener('click', () => ui.closeSpinWheel());
    document.querySelector('[data-action="spin-wheel"]')?.addEventListener('click', () => this.spinWheel());

    document.querySelector('[data-action="copy-referral"]')?.addEventListener('click', () => this.copyReferralCode());
    document.querySelector('[data-action="share-referral"]')?.addEventListener('click', () => this.shareReferralCode());

    document.querySelector('[data-action="edit-profile"]')?.addEventListener('click', () => this.editProfile());
    document.querySelector('[data-action="contact-admin"]')?.addEventListener('click', () => this.contactAdmin());

    document.querySelectorAll('[data-support]').forEach(link => {
      link.addEventListener('click', (e) => {
        const platform = e.target.dataset.support;
        this.openSupport(platform);
      });
    });

    document.querySelector('[data-action="watch-ad"]')?.addEventListener('click', () => this.handleWatchAd());
  }

  switchTab(tab) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.tab === tab) {
        item.classList.add('active');
      }
    });

    document.querySelectorAll('.content-section').forEach(section => {
      section.classList.remove('active');
    });
    
    const section = document.getElementById(tab + 'Section');
    if (section) {
      section.classList.add('active');
    }

    if (tab === 'home') {
      reels.loadVideos();
    } else if (tab === 'wallet') {
      wallet.loadTransactions();
    } else if (tab === 'invite') {
      this.loadRecentInvites();
    }

    analytics.trackPageView(tab);
    store.setCurrentTab(tab);
  }

  toggleAuthForms(form) {
    document.getElementById('loginForm').style.display = form === 'login' ? 'block' : 'none';
    document.getElementById('signupForm').style.display = form === 'signup' ? 'block' : 'none';
  }

  async handleLogin() {
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      store.setLoading(true);
      const result = await authService.login(phone, password);
      store.setUser(result.user);
      store.setUserData(result.userData);
      store.showToast('Login successful!');
    } catch (error) {
      store.showToast(error.message, 'error');
    } finally {
      store.setLoading(false);
    }
  }

  async handleSignup() {
    const userData = {
      username: document.getElementById('signupUsername').value.trim(),
      userId: document.getElementById('signupUserId').value.trim(),
      phone: document.getElementById('signupPhone').value.trim(),
      password: document.getElementById('signupPassword').value,
      inviteCode: document.getElementById('inviteCode').value.trim()
    };

    try {
      store.setLoading(true);
      const result = await authService.signUp(userData);
      store.setUser(result.user);
      store.setUserData(result.userDoc);
      store.showToast('Account created successfully!');
    } catch (error) {
      store.showToast(error.message, 'error');
    } finally {
      store.setLoading(false);
    }
  }

  async handleLogout() {
    try {
      store.setLoading(true);
      await authService.logout();
      store.setUser(null);
      store.setUserData(null);
      store.showToast('Logged out successfully');
    } catch (error) {
      store.showToast(error.message, 'error');
    } finally {
      store.setLoading(false);
    }
  }

  handleWatchAd() {
    if (!store.getState().user) {
      store.showToast('Please login to watch ads', 'error');
      return;
    }

    earningsService.showRewardedAd(async () => {
      const reward = Math.floor(Math.random() * 6) + 5;
      await earningsService.addCoins(reward, 'ad_watch', 'Watched ad');
      store.showToast(`+${reward} coins from ad!`);
    });
  }

  async openSpinWheel() {
    if (!store.getState().user) {
      store.showToast('Please login to spin', 'error');
      return;
    }

    if (store.getState().userData?.spinsRemaining <= 0) {
      store.showToast('No spins left today!', 'error');
      return;
    }

    store.setSpinWheelOpen(true);
    document.getElementById('wheelModal').style.display = 'flex';
    this.drawWheel();
  }

  drawWheel() {
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const segments = store.getState().earningRates?.spinRewards || [5, 10, 15, 20, 10, 5];
    const colors = ['#FF6B4A', '#FF8E6A', '#FFA07A', '#FFB694', '#FFCCAA', '#FFE0C0'];
    
    const angle = (Math.PI * 2) / segments.length;
    
    for (let i = 0; i < segments.length; i++) {
      ctx.beginPath();
      ctx.moveTo(125, 125);
      ctx.arc(125, 125, 125, i * angle, (i + 1) * angle);
      ctx.closePath();
      
      ctx.fillStyle = colors[i];
      ctx.fill();
      
      ctx.save();
      ctx.translate(125, 125);
      ctx.rotate(i * angle + angle / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'white';
      ctx.font = 'bold 20px Inter';
      ctx.fillText(segments[i], 75, 10);
      ctx.restore();
    }
  }

  async spinWheel() {
    try {
      store.setLoading(true);
      
      earningsService.showRewardedAd(async () => {
        const result = await earningsService.spinWheel();
        store.showToast(`🎉 You won ${result.reward} coins!`);
        analytics.track('spin_completed', result);
        ui.closeSpinWheel();
      });
    } catch (error) {
      store.showToast(error.message, 'error');
    } finally {
      store.setLoading(false);
    }
  }

  async copyReferralCode() {
    const code = store.getState().userData?.referralCode;
    if (code) {
      await copyToClipboard(code);
      store.showToast('Referral code copied!');
      analytics.track('referral_copied');
    }
  }

  async shareReferralCode() {
    const code = store.getState().userData?.referralCode;
    if (code) {
      const shared = await shareContent(
        'Join CoinFlow',
        `Join CoinFlow and earn real money! Use my referral code: ${code}`,
        import.meta.env.VITE_APP_URL
      );
      
      if (shared) {
        analytics.track('referral_shared');
      } else {
        this.copyReferralCode();
      }
    }
  }

  async loadRecentInvites() {
    // Implement invite loading
  }

  editProfile() {
    store.showToast('Edit profile coming soon!');
  }

  contactAdmin() {
    store.showToast('Admin contact: support@coinflow.app');
  }

  openSupport(platform) {
    const urls = {
      facebook: 'https://facebook.com/groups/coinflow',
      telegram: 'https://t.me/coinflow'
    };
    
    if (urls[platform]) {
      window.open(urls[platform], '_blank');
      analytics.track('support_clicked', { platform });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

export default App;
