import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  orderBy,
  limit,
  runTransaction
} from 'firebase/firestore';
import { db } from './firebase.js';
import { authService } from './auth.js';
import { adminService } from './admin-service.js';
import { rateLimiter } from '../utils/rateLimiter.js';
import { errorHandler } from '../utils/errorHandler.js';
import { analytics } from './analytics.js';
import { store } from '../store/store.js';

class WithdrawalService {
  constructor() {
    this.settings = null;
    this.init();
  }

  async init() {
    this.settings = await adminService.getWithdrawalSettings();
    
    store.subscribe((state) => {
      if (state.withdrawalSettings) {
        this.settings = state.withdrawalSettings;
      }
    });
  }

  async requestWithdrawal(method, account, amount) {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    await rateLimiter.check(user.uid, 'withdrawal');

    if (!this.settings) {
      this.settings = await adminService.getWithdrawalSettings();
    }

    if (this.settings?.status !== 'active') {
      throw new Error('Withdrawals are currently disabled');
    }

    if (amount < this.settings.minAmount) {
      throw new Error(`Minimum withdrawal is ৳${this.settings.minAmount}`);
    }

    if (amount > this.settings.maxAmount) {
      throw new Error(`Maximum withdrawal is ৳${this.settings.maxAmount}`);
    }

    const methodConfig = this.settings.methods.find(m => m.id === method);
    if (!methodConfig || !methodConfig.enabled) {
      throw new Error('Selected payment method is not available');
    }

    if (!/^\d{11}$/.test(account)) {
      throw new Error('Invalid account number');
    }

    const todayWithdrawals = await this.getTodayWithdrawals(user.uid);
    if (todayWithdrawals + amount > this.settings.dailyLimit) {
      throw new Error(`Daily withdrawal limit is ৳${this.settings.dailyLimit}`);
    }

    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();

    if (userData.balance < amount) {
      throw new Error('Insufficient balance');
    }

    await runTransaction(db, async (transaction) => {
      transaction.update(userRef, {
        balance: increment(-amount)
      });

      const withdrawalRef = doc(collection(db, 'withdrawals'));
      transaction.set(withdrawalRef, {
        userId: user.uid,
        username: userData.username,
        method,
        account,
        amount,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    await addDoc(collection(db, 'transactions'), {
      userId: user.uid,
      type: 'withdrawal',
      amount,
      description: `Withdrawal via ${methodConfig.name}`,
      timestamp: serverTimestamp(),
      status: 'pending'
    });

    analytics.track('withdrawal_requested', { method, amount });

    return true;
  }

  async getTodayWithdrawals(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const withdrawalsQuery = query(
      collection(db, 'withdrawals'),
      where('userId', '==', userId),
      where('createdAt', '>=', today)
    );

    const snapshot = await getDocs(withdrawalsQuery);
    return snapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
  }

  async getWithdrawalHistory(limitCount = 10) {
    const user = authService.getCurrentUser();
    if (!user) return [];

    const withdrawalsQuery = query(
      collection(db, 'withdrawals'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(withdrawalsQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  async getWithdrawalStatus(withdrawalId) {
    const withdrawalDoc = await getDoc(doc(db, 'withdrawals', withdrawalId));
    if (!withdrawalDoc.exists()) return null;

    const data = withdrawalDoc.data();
    return {
      status: data.status,
      processedAt: data.processedAt?.toDate(),
      notes: data.notes
    };
  }
}

export const withdrawalService = new WithdrawalService();
