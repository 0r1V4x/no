import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  serverTimestamp,
  increment,
  addDoc
} from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { Validator } from '../utils/validator.js';
import { rateLimiter } from '../utils/rateLimiter.js';
import { errorHandler } from '../utils/errorHandler.js';
import { generateReferralCode, getDeviceInfo } from '../utils/helpers.js';
import { analytics } from './analytics.js';
import { APP_CONSTANTS } from '../config/constants.js';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.userData = null;
    this.deviceId = this.getDeviceId();
  }

  getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }

  async signUp(userData) {
    const validation = Validator.validateSignup(userData);
    if (!validation.valid) {
      throw new Error(validation.errors[0].message);
    }

    await rateLimiter.check(this.deviceId, 'signup');

    const email = userData.phone + '@coinflow.app';

    try {
      const phoneQuery = query(collection(db, 'users'), where('phone', '==', userData.phone));
      const phoneSnapshot = await getDocs(phoneQuery);
      if (!phoneSnapshot.empty) {
        throw new Error('Phone number already registered');
      }

      const userIdQuery = query(collection(db, 'users'), where('userId', '==', userData.userId));
      const userIdSnapshot = await getDocs(userIdQuery);
      if (!userIdSnapshot.empty) {
        throw new Error('User ID already taken');
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, userData.password);
      const user = userCredential.user;

      const referralCode = generateReferralCode();

      const userDoc = {
        uid: user.uid,
        username: Validator.sanitize(userData.username),
        userId: Validator.sanitize(userData.userId),
        phone: userData.phone,
        email,
        referralCode,
        referredBy: null,
        coins: 0,
        balance: 0,
        totalEarned: 0,
        todayEarned: 0,
        deviceId: this.deviceId,
        deviceInfo: getDeviceInfo(),
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp(),
        lastEarnDate: serverTimestamp(),
        checkInStreak: 0,
        lastCheckIn: null,
        totalReferrals: 0,
        activeReferrals: 0,
        referralEarnings: 0,
        completedTasks: 0,
        spinsRemaining: APP_CONSTANTS.MAX_DAILY_SPINS,
        weeklyBonusClaimed: false,
        fcmToken: null,
        isActive: true,
        isBlocked: false,
        role: 'user'
      };

      if (userData.inviteCode) {
        const referrerQuery = query(collection(db, 'users'), where('referralCode', '==', userData.inviteCode));
        const referrerSnapshot = await getDocs(referrerQuery);
        
        if (!referrerSnapshot.empty) {
          const referrerDoc = referrerSnapshot.docs[0];
          userDoc.referredBy = referrerDoc.id;
          userDoc.coins += 10;
          
          await updateDoc(doc(db, 'users', referrerDoc.id), {
            totalReferrals: increment(1),
            coins: increment(50),
            referralEarnings: increment(50),
            balance: increment(50 / 20)
          });

          await addDoc(collection(db, 'transactions'), {
            userId: referrerDoc.id,
            type: 'referral_bonus',
            amount: 50,
            description: `New user joined with code: ${userData.userId}`,
            timestamp: serverTimestamp()
          });
        }
      }

      await setDoc(doc(db, 'users', user.uid), userDoc);

      analytics.track('user_signup', {
        method: 'phone',
        hasReferral: !!userData.inviteCode
      });

      return { user, userDoc };
    } catch (error) {
      throw await errorHandler.handle(error, { action: 'signup', userData });
    }
  }

  async login(phone, password) {
    const validation = Validator.validateLogin(phone, password);
    if (!validation.valid) {
      throw new Error(validation.errors[0].message);
    }

    await rateLimiter.check(this.deviceId, 'login');

    try {
      const email = phone + '@coinflow.app';
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error('User data not found');
      }

      const userData = userDoc.data();

      if (userData.isBlocked) {
        await signOut(auth);
        throw new Error(userData.blockReason || 'Your account has been blocked');
      }

      await updateDoc(userRef, {
        deviceId: this.deviceId,
        deviceInfo: getDeviceInfo(),
        lastActive: serverTimestamp()
      });

      this.currentUser = user;
      this.userData = userData;

      await this.checkDailyReset(user.uid, userData);

      analytics.track('user_login', {
        method: 'phone',
        userId: user.uid
      });

      return { user, userData };
    } catch (error) {
      throw await errorHandler.handle(error, { action: 'login', phone });
    }
  }

  async checkDailyReset(userId, userData) {
    const lastEarnDate = userData.lastEarnDate?.toDate() || new Date();
    const today = new Date();

    if (lastEarnDate.getDate() !== today.getDate() || 
        lastEarnDate.getMonth() !== today.getMonth() || 
        lastEarnDate.getFullYear() !== today.getFullYear()) {

      await updateDoc(doc(db, 'users', userId), {
        todayEarned: 0,
        lastEarnDate: serverTimestamp(),
        spinsRemaining: APP_CONSTANTS.MAX_DAILY_SPINS
      });

      this.userData.todayEarned = 0;
      this.userData.spinsRemaining = APP_CONSTANTS.MAX_DAILY_SPINS;
    }
  }

  async logout() {
    try {
      if (this.currentUser) {
        await updateDoc(doc(db, 'users', this.currentUser.uid), {
          lastActive: serverTimestamp()
        });
      }

      await signOut(auth);
      
      this.currentUser = null;
      this.userData = null;

      analytics.track('user_logout');
    } catch (error) {
      throw await errorHandler.handle(error, { action: 'logout' });
    }
  }

  async resetPassword(phone) {
    if (!Validator.phone(phone)) {
      throw new Error('Invalid phone number');
    }

    try {
      const email = phone + '@coinflow.app';
      await sendPasswordResetEmail(auth, email);
      analytics.track('password_reset', { phone });
    } catch (error) {
      throw await errorHandler.handle(error, { action: 'resetPassword' });
    }
  }

  async updatePassword(currentPassword, newPassword) {
    if (!this.currentUser) {
      throw new Error('Not authenticated');
    }

    if (!Validator.password(newPassword)) {
      throw new Error('Invalid new password');
    }

    try {
      const user = this.currentUser;
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      analytics.track('password_updated');
    } catch (error) {
      throw await errorHandler.handle(error, { action: 'updatePassword' });
    }
  }

  async updateProfile(updates) {
    if (!this.currentUser) {
      throw new Error('Not authenticated');
    }

    try {
      const allowedUpdates = ['username'];
      const sanitizedUpdates = {};

      for (const key of allowedUpdates) {
        if (updates[key] !== undefined) {
          if (key === 'username' && !Validator.username(updates[key])) {
            throw new Error('Invalid username');
          }
          sanitizedUpdates[key] = Validator.sanitize(updates[key]);
        }
      }

      sanitizedUpdates.lastActive = serverTimestamp();

      await updateDoc(doc(db, 'users', this.currentUser.uid), sanitizedUpdates);

      if (updates.username) {
        await updateProfile(this.currentUser, {
          displayName: updates.username
        });
      }

      this.userData = { ...this.userData, ...sanitizedUpdates };

      analytics.track('profile_updated', { updates: Object.keys(updates) });

      return this.userData;
    } catch (error) {
      throw await errorHandler.handle(error, { action: 'updateProfile' });
    }
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getUserData() {
    return this.userData;
  }

  isAuthenticated() {
    return !!this.currentUser;
  }
}

export const authService = new AuthService();
