import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  enableIndexedDbPersistence,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  increment,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  addDoc,
  writeBatch,
  runTransaction,
  onSnapshot
} from 'firebase/firestore';
import { 
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { firebaseConfig } from '../config/firebase.js';
import { DataService } from './storage.js';

class FirebaseService {
  constructor() {
    if (FirebaseService.instance) {
      return FirebaseService.instance;
    }
    
    this.app = initializeApp(firebaseConfig);
    this.db = getFirestore(this.app);
    this.auth = getAuth(this.app);
    this.storage = getStorage(this.app);
    this.analytics = getAnalytics(this.app);
    this.messaging = null;
    
    this.initPersistence();
    this.initMessaging();
    
    FirebaseService.instance = this;
  }

  async initPersistence() {
    try {
      await enableIndexedDbPersistence(this.db);
      console.log('Offline persistence enabled');
    } catch (err) {
      if (err.code === 'failed-precondition') {
        console.log('Multiple tabs open, persistence disabled');
      } else if (err.code === 'unimplemented') {
        console.log('Browser doesn\'t support persistence');
      }
    }
  }

  async initMessaging() {
    try {
      this.messaging = getMessaging(this.app);
      
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const token = await getToken(this.messaging, {
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
          });
          
          onAuthStateChanged(this.auth, async (user) => {
            if (user && token) {
              await this.updateUserToken(user.uid, token);
            }
          });
          
          onMessage(this.messaging, (payload) => {
            window.dispatchEvent(new CustomEvent('show-toast', {
              detail: { message: payload.notification.body, type: 'info' }
            }));
          });
        }
      }
    } catch (error) {
      console.error('Failed to initialize messaging:', error);
    }
  }

  async updateUserToken(userId, token) {
    try {
      await updateDoc(doc(this.db, 'users', userId), {
        fcmToken: token,
        lastTokenUpdate: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update FCM token:', error);
    }
  }

  async batchWrite(operations) {
    const batch = writeBatch(this.db);
    
    operations.forEach(op => {
      const ref = doc(this.db, op.collection, op.id);
      if (op.type === 'set') {
        batch.set(ref, op.data, op.options);
      } else if (op.type === 'update') {
        batch.update(ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(ref);
      }
    });
    
    return batch.commit();
  }

  async runTransaction(transactionFn, maxAttempts = 3) {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        return await runTransaction(this.db, transactionFn);
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempts)));
      }
    }
  }

  async getWithCache(key, collectionName, conditions = []) {
    const cacheKey = `firebase_${key}`;
    let queryRef = collection(this.db, collectionName);
    
    conditions.forEach(cond => {
      queryRef = query(queryRef, where(cond.field, cond.operator, cond.value));
    });
    
    return DataService.getWithCache(cacheKey, () => getDocs(queryRef));
  }

  subscribeToDocument(path, callback) {
    const ref = doc(this.db, path);
    return onSnapshot(ref, (snapshot) => {
      callback(snapshot.exists() ? snapshot.data() : null);
    }, (error) => {
      console.error('Snapshot error:', error);
    });
  }

  logEvent(eventName, params = {}) {
    logEvent(this.analytics, eventName, params);
  }
}

export const firebase = new FirebaseService();
export const db = firebase.db;
export const auth = firebase.auth;
export const storage = firebase.storage;
