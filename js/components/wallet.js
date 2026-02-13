import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase.js';
import { withdrawalService } from '../services/withdrawal.js';
import { store } from '../store/store.js';
import { Validator } from '../utils/validator.js';
import { formatCurrency, formatDate } from '../utils/helpers.js';
import { analytics } from '../services/analytics.js';

class WalletComponent {
  constructor() {
    this.init();
  }

  init() {
    this.loadTransactions();
    this.initEventListeners();
  }

  async loadTransactions(limitCount = 5) {
    const user = store.getState().user;
    if (!user) return;

    try {
      const transactionsQuery = query(
        collection(db, 'transactions'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(transactionsQuery);
      this.renderTransactions(snapshot.docs);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  }

  renderTransactions(docs) {
    const historyDiv = document.getElementById('transactionHistory');
    if (!historyDiv) return;

    if (docs.length === 0) {
      historyDiv.innerHTML = '<p class="empty-state">No transactions yet</p>';
      return;
    }

    historyDiv.innerHTML = docs.map(doc => {
      const data = doc.data();
      const date = data.timestamp?.toDate() || new Date();
      const isCredit = !data.type.includes('withdrawal') && data.type !== 'withdrawal';
      
      return `
        <div class="transaction-item" role="listitem">
          <div class="transaction-info">
            <p class="transaction-description">${data.description || data.type}</p>
            <small class="transaction-date">${formatDate(date)}</small>
          </div>
          <div class="transaction-amount ${isCredit ? 'credit' : 'debit'}">
            ${isCredit ? '+' : '-'}${data.amount} ${isCredit ? 'coins' : '৳'}
          </div>
        </div>
      `;
    }).join('');
  }

  async handleWithdrawal() {
    const user = store.getState().user;
    if (!user) {
      store.showToast('Please login to withdraw', 'error');
      return;
    }

    const method = document.getElementById('withdrawMethod').value;
    const account = document.getElementById('withdrawAccount').value.trim();
    const amount = parseFloat(document.getElementById('withdrawAmount').value);

    const userData = store.getState().userData;
    const validation = Validator.validateWithdrawal({ method, account, amount }, userData?.balance || 0);

    if (!validation.valid) {
      validation.errors.forEach(error => {
        store.showToast(error.message, 'error');
      });
      return;
    }

    store.setLoading(true);

    try {
      await withdrawalService.requestWithdrawal(method, account, amount);
      store.showToast('Withdrawal request submitted!');
      
      document.getElementById('withdrawAccount').value = '';
      document.getElementById('withdrawAmount').value = '';
      
      await this.loadTransactions();
      
      analytics.track('withdrawal_completed', { method, amount });
    } catch (error) {
      store.showToast(error.message, 'error');
    } finally {
      store.setLoading(false);
    }
  }

  initEventListeners() {
    const withdrawBtn = document.querySelector('[data-action="withdraw"]');
    if (withdrawBtn) {
      withdrawBtn.addEventListener('click', () => this.handleWithdrawal());
    }

    store.subscribe((state) => {
      if (state.userData) {
        this.updateBalanceDisplay(state.userData);
      }
    });
  }

  updateBalanceDisplay(userData) {
    const balanceElement = document.getElementById('walletBalance');
    if (balanceElement) {
      balanceElement.textContent = formatCurrency(userData.balance || 0);
    }
  }
}

export const wallet = new WalletComponent();
