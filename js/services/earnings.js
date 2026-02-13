import { 
  doc, 
  updateDoc, 
  increment, 
  serverTimestamp,
  addDoc,
  collection,
  getDoc,
  runTransaction
} from 'firebase/firestore';
import { db } from './firebase.js';
import { authService } from './auth.js';
import { adminService } from './admin-service.js';
import { rateLimiter } from '../utils/rateLimiter.js';
import { errorHandler } from '../utils/errorHandler.js';
import { analytics } from './analytics.js';
import { store } from '../store/store.js';

class EarningsService {
  constructor() {
    this.rewardedAdCallbacks = new Map();
    this.interstitialAdCallbacks = new Map();
    this.earningRates = null;
    this.init();
  }

  async init() {
    this.earningRates = await adminService.getEarningRates();
    
    store.subscribe((state) => {
      if (state.earningRates) {
        this.earningRates = state.earningRates;
      }
    });
  }

  async addCoins(amount, type, description) {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    if (amount <= 0 || amount > 1000) {
      throw new Error('Invalid amount');
    }

    const userRef = doc(db, 'users', user.uid);
    const coinToBdtRate = this.earningRates?.coinToBdtRate || 20;
    const balanceIncrement = amount / coinToBdtRate;

    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }

        const userData = userDoc.data();

        if (userData.todayEarned + balanceIncrement > 50) {
          throw new Error('Daily earning limit reached');
        }

        transaction.update(userRef, {
          coins: increment(amount),
          balance: increment(balanceIncrement),
          todayEarned: increment(balanceIncrement),
          totalEarned: increment(balanceIncrement),
          completedTasks: increment(1),
          lastEarnDate: serverTimestamp()
        });
      });

      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        type,
        amount,
        description,
        timestamp: serverTimestamp()
      });

      await this.checkMilestone(user.uid);

      analytics.track('earnings_added', {
        amount,
        type,
        userId: user.uid
      });

      return amount;
    } catch (error) {
      throw await errorHandler.handle(error, { action: 'addCoins', amount, type });
    }
  }

  async checkIn() {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    await rateLimiter.check(user.uid, 'checkin');

    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();

    const today = new Date();
    const lastCheckIn = userData.lastCheckIn?.toDate();

    if (lastCheckIn && 
        lastCheckIn.getDate() === today.getDate() && 
        lastCheckIn.getMonth() === today.getMonth() && 
        lastCheckIn.getFullYear() === today.getFullYear()) {
      throw new Error('Already checked in today');
    }

    let streak = userData.checkInStreak || 0;
    if (lastCheckIn) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (lastCheckIn.getDate() === yesterday.getDate() && 
          lastCheckIn.getMonth() === yesterday.getMonth() && 
          lastCheckIn.getFullYear() === yesterday.getFullYear()) {
        streak++;
      } else {
        streak = 1;
      }
    } else {
      streak = 1;
    }

    const reward = this.earningRates?.checkinRewards?.[`day${Math.min(streak, 7)}`] || 
                   (streak === 7 ? 20 : 10);

    await runTransaction(db, async (transaction) => {
      transaction.update(userRef, {
        coins: increment(reward),
        balance: increment(reward / (this.earningRates?.coinToBdtRate || 20)),
        todayEarned: increment(reward / (this.earningRates?.coinToBdtRate || 20)),
        totalEarned: increment(reward / (this.earningRates?.coinToBdtRate || 20)),
        checkInStreak: streak === 7 ? 0 : streak,
        lastCheckIn: serverTimestamp(),
        completedTasks: increment(1)
      });
    });

    await addDoc(collection(db, 'transactions'), {
      userId: user.uid,
      type: 'checkin',
      amount: reward,
      description: `Day ${streak} check-in reward`,
      timestamp: serverTimestamp()
    });

    analytics.track('checkin_completed', { streak, reward });

    return { reward, streak };
  }

  async spinWheel() {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    await rateLimiter.check(user.uid, 'spin');

    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();

    if (userData.spinsRemaining <= 0) {
      throw new Error('No spins left today');
    }

    const segments = this.earningRates?.spinRewards || [5, 10, 15, 20, 10, 5];
    const reward = segments[Math.floor(Math.random() * segments.length)];

    await runTransaction(db, async (transaction) => {
      transaction.update(userRef, {
        spinsRemaining: increment(-1),
        coins: increment(reward),
        balance: increment(reward / (this.earningRates?.coinToBdtRate || 20)),
        todayEarned: increment(reward / (this.earningRates?.coinToBdtRate || 20)),
        totalEarned: increment(reward / (this.earningRates?.coinToBdtRate || 20)),
        completedTasks: increment(1)
      });
    });

    await addDoc(collection(db, 'transactions'), {
      userId: user.uid,
      type: 'spin_wheel',
      amount: reward,
      description: 'Spin wheel reward',
      timestamp: serverTimestamp()
    });

    analytics.track('spin_completed', { reward, remaining: userData.spinsRemaining - 1 });

    return { reward, remaining: userData.spinsRemaining - 1 };
  }

  async checkMilestone(userId) {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();

    if (userData.completedTasks >= 50 && !userData.weeklyBonusClaimed) {
      const bonus = Math.floor(Math.random() * 41) + 10;

      await runTransaction(db, async (transaction) => {
        transaction.update(userRef, {
          coins: increment(bonus),
          balance: increment(bonus / (this.earningRates?.coinToBdtRate || 20)),
          totalEarned: increment(bonus / (this.earningRates?.coinToBdtRate || 20)),
          weeklyBonusClaimed: true,
          completedTasks: 0
        });
      });

      await addDoc(collection(db, 'transactions'), {
        userId,
        type: 'weekly_bonus',
        amount: bonus,
        description: 'Weekly milestone bonus',
        timestamp: serverTimestamp()
      });

      analytics.track('milestone_reached', { bonus });

      return bonus;
    }

    return null;
  }

  showRewardedAd(callback) {
    const adId = Date.now().toString();
    this.rewardedAdCallbacks.set(adId, callback);

    setTimeout(() => {
      const cb = this.rewardedAdCallbacks.get(adId);
      if (cb) {
        cb();
        this.rewardedAdCallbacks.delete(adId);
      }
    }, 3000);

    analytics.track('ad_shown', { type: 'rewarded' });

    return adId;
  }

  showInterstitialAd(callback) {
    const adId = Date.now().toString();
    this.interstitialAdCallbacks.set(adId, callback);

    setTimeout(() => {
      const cb = this.interstitialAdCallbacks.get(adId);
      if (cb) {
        cb();
        this.interstitialAdCallbacks.delete(adId);
      }
    }, 2000);

    analytics.track('ad_shown', { type: 'interstitial' });

    return adId;
  }
}

export const earningsService = new EarningsService();
