import { store } from '../store/store.js';
import { authService } from '../services/auth.js';
import { earningsService } from '../services/earnings.js';
import { formatCurrency } from '../utils/helpers.js';

class UI {
  constructor() {
    this.init();
  }

  init() {
    store.subscribe(this.updateUI.bind(this));
    this.initEventListeners();
    this.initKeyboardNav();
    this.initAriaLabels();
  }

  initEventListeners() {
    window.addEventListener('show-toast', (e) => {
      store.showToast(e.detail.message, e.detail.type);
    });

    window.addEventListener('online', () => {
      store.hideOfflineIndicator();
    });

    window.addEventListener('offline', () => {
      store.showOfflineIndicator();
    });
  }

  initKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (store.getState().spinWheelOpen) {
          this.closeSpinWheel();
        }
      }

      if (e.key === 'Tab') {
        document.body.classList.add('keyboard-nav');
      }
    });

    document.addEventListener('mousedown', () => {
      document.body.classList.remove('keyboard-nav');
    });
  }

  initAriaLabels() {
    const interactiveElements = document.querySelectorAll('button, a, input, select');
    interactiveElements.forEach(el => {
      if (!el.getAttribute('aria-label')) {
        const text = el.textContent || el.placeholder || el.getAttribute('data-label');
        if (text) {
          el.setAttribute('aria-label', text.trim());
        }
      }
    });
  }

  updateUI(state) {
    this.updateLoading(state.loading);
    
    if (state.toast) {
      this.showToast(state.toast.message, state.toast.type, state.toast.duration);
    }

    if (state.user) {
      this.showMainScreen();
      this.updateUserData(state.userData);
    } else {
      this.showAuthScreen();
    }
  }

  updateLoading(loading) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.style.display = loading ? 'flex' : 'none';
      overlay.setAttribute('aria-hidden', (!loading).toString());
    }
  }

  showToast(message, type = 'success', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.style.display = 'block';

    setTimeout(() => {
      toast.style.display = 'none';
    }, duration);
  }

  showAuthScreen() {
    document.getElementById('authScreen').classList.add('active');
    document.getElementById('mainScreen').style.display = 'none';
  }

  showMainScreen() {
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainScreen').style.display = 'block';
  }

  updateUserData(userData) {
    if (!userData) return;

    const walletBalance = document.getElementById('walletBalance');
    const totalCoins = document.getElementById('totalCoins');
    const todayEarnings = document.getElementById('todayEarnings');

    if (walletBalance) {
      walletBalance.textContent = formatCurrency(userData.balance || 0);
    }
    if (totalCoins) {
      totalCoins.textContent = userData.coins || 0;
    }
    if (todayEarnings) {
      todayEarnings.textContent = formatCurrency(userData.todayEarned || 0);
    }

    const profileUsername = document.getElementById('profileUsername');
    const profileUserId = document.getElementById('profileUserId');
    const profilePhone = document.getElementById('profilePhone');
    const profileTotalEarnings = document.getElementById('profileTotalEarnings');
    const profileDailyEarnings = document.getElementById('profileDailyEarnings');

    if (profileUsername) {
      profileUsername.textContent = userData.username || 'User';
    }
    if (profileUserId) {
      profileUserId.textContent = `@${userData.userId || 'user'}`;
    }
    if (profilePhone) {
      profilePhone.innerHTML = `<i class="fas fa-phone"></i> ${userData.phone || 'Not set'}`;
    }
    if (profileTotalEarnings) {
      profileTotalEarnings.textContent = formatCurrency(userData.totalEarned || 0);
    }
    if (profileDailyEarnings) {
      profileDailyEarnings.textContent = formatCurrency(userData.todayEarned || 0);
    }

    const referralCodeDisplay = document.getElementById('referralCodeDisplay');
    const totalReferrals = document.getElementById('totalReferrals');
    const activeReferrals = document.getElementById('activeReferrals');
    const referralEarnings = document.getElementById('referralEarnings');

    if (referralCodeDisplay) {
      referralCodeDisplay.textContent = userData.referralCode || 'N/A';
    }
    if (totalReferrals) {
      totalReferrals.textContent = userData.totalReferrals || 0;
    }
    if (activeReferrals) {
      activeReferrals.textContent = userData.activeReferrals || 0;
    }
    if (referralEarnings) {
      referralEarnings.textContent = userData.referralEarnings || 0;
    }

    const spinsLeft = document.getElementById('spinsLeft');
    if (spinsLeft) {
      spinsLeft.textContent = `${userData.spinsRemaining || 0} Spins Left`;
    }

    const taskProgress = document.getElementById('taskProgress');
    const progressBar = document.getElementById('progressBar');
    if (taskProgress) {
      taskProgress.textContent = `${userData.completedTasks || 0}/50`;
    }
    if (progressBar) {
      const progressPercent = Math.min(((userData.completedTasks || 0) / 50) * 100, 100);
      progressBar.style.width = `${progressPercent}%`;
    }

    this.updateCheckInDays(userData.checkInStreak || 0);
  }

  updateCheckInDays(streak) {
    const checkinDays = document.getElementById('checkinDays');
    if (!checkinDays) return;

    checkinDays.innerHTML = '';
    for (let i = 1; i <= 7; i++) {
      const day = document.createElement('div');
      day.className = `checkin-day ${i <= streak ? 'active' : ''}`;
      day.innerHTML = `
        Day ${i}
        <div style="font-size: 16px; margin-top: 4px;">${i === 7 ? '20' : '10'}</div>
      `;
      day.setAttribute('role', 'button');
      day.setAttribute('aria-label', `Day ${i} check-in reward: ${i === 7 ? '20' : '10'} coins`);
      day.setAttribute('tabindex', '0');
      
      checkinDays.appendChild(day);
    }
  }

  async handleCheckIn() {
    store.setLoading(true);
    try {
      const result = await earningsService.checkIn();
      store.showToast(`+${result.reward} coins for check-in!`);
    } catch (error) {
      store.showToast(error.message, 'error');
    } finally {
      store.setLoading(false);
    }
  }

  closeSpinWheel() {
    store.setSpinWheelOpen(false);
    document.getElementById('wheelModal').style.display = 'none';
  }
}

export const ui = new UI();
