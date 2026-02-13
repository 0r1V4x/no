// js/app.js - SIMPLIFIED WORKING VERSION
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp 
} from "firebase/firestore";

// Firebase Config - Hardcoded for now (we'll fix env later)
const firebaseConfig = {
  apiKey: "AIzaSyDhM8LtJKXnSI9nsJLWs1Dpj9WBpEr8B_I",
  authDomain: "coinflow-a5496.firebaseapp.com",
  projectId: "coinflow-a5496",
  storageBucket: "coinflow-a5496.firebasestorage.app",
  messagingSenderId: "654252221891",
  appId: "1:654252221891:web:1992c59199780625930976",
  measurementId: "G-6MHV1R3GPN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Make functions globally available
window.handleLogin = async function() {
  const phone = document.getElementById('loginPhone')?.value;
  const password = document.getElementById('loginPassword')?.value;
  
  if (!phone || !password) {
    alert('Please enter phone and password');
    return;
  }

  try {
    const email = phone + '@coinflow.app';
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Login successful:', userCredential.user);
    alert('Login successful!');
    
    // Hide auth screen, show main screen
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainScreen').style.display = 'block';
    
  } catch (error) {
    console.error('Login error:', error);
    alert('Login failed: ' + error.message);
  }
};

window.handleSignup = async function() {
  const username = document.getElementById('signupUsername')?.value;
  const userId = document.getElementById('signupUserId')?.value;
  const phone = document.getElementById('signupPhone')?.value;
  const password = document.getElementById('signupPassword')?.value;
  const inviteCode = document.getElementById('inviteCode')?.value;

  if (!username || !userId || !phone || !password) {
    alert('Please fill all fields');
    return;
  }

  try {
    const email = phone + '@coinflow.app';
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Create user document
    await setDoc(doc(db, 'users', user.uid), {
      username,
      userId,
      phone,
      email,
      coins: 0,
      balance: 0,
      createdAt: serverTimestamp()
    });

    console.log('Signup successful:', user);
    alert('Account created successfully!');
    
    // Switch to login form
    toggleAuthForms('login');
    
  } catch (error) {
    console.error('Signup error:', error);
    alert('Signup failed: ' + error.message);
  }
};

window.handleLogout = async function() {
  try {
    await signOut(auth);
    document.getElementById('authScreen').classList.add('active');
    document.getElementById('mainScreen').style.display = 'none';
    alert('Logged out successfully');
  } catch (error) {
    console.error('Logout error:', error);
  }
};

// Toggle between login and signup forms
window.toggleAuthForms = function(form) {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  
  if (form === 'login') {
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
  } else {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
  }
};

// Switch between tabs
window.switchTab = function(tab) {
  // Update navigation active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  event.currentTarget.classList.add('active');

  // Show selected section
  document.querySelectorAll('.content-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(tab + 'Section').classList.add('active');
};

// Check-in function
window.handleCheckIn = function() {
  alert('Check-in successful! +10 coins');
};

// Spin wheel functions
window.openSpinWheel = function() {
  document.getElementById('wheelModal').style.display = 'flex';
};

window.closeSpinWheel = function() {
  document.getElementById('wheelModal').style.display = 'none';
};

window.spinWheelAction = function() {
  alert('You won 10 coins!');
  closeSpinWheel();
};

// Watch ad function
window.handleWatchAd = function() {
  alert('Ad watched! +5 coins');
};

// Withdrawal function
window.handleWithdrawal = function() {
  alert('Withdrawal request submitted!');
};

// Referral functions
window.copyReferralCode = function() {
  const code = document.getElementById('referralCodeDisplay')?.textContent;
  if (code) {
    navigator.clipboard.writeText(code);
    alert('Referral code copied!');
  }
};

window.shareReferralCode = function() {
  const code = document.getElementById('referralCodeDisplay')?.textContent;
  if (code) {
    alert('Share: ' + code);
  }
};

// Profile functions
window.editProfile = function() {
  alert('Edit profile coming soon!');
};

window.openSupport = function(platform) {
  alert('Opening ' + platform + ' group');
};

window.contactAdmin = function() {
  alert('Contact admin at support@coinflow.app');
};

// Auth state observer
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('User is logged in:', user);
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainScreen').style.display = 'block';
    
    // Load user data
    loadUserData(user.uid);
  } else {
    console.log('User is logged out');
    document.getElementById('authScreen').classList.add('active');
    document.getElementById('mainScreen').style.display = 'none';
  }
});

async function loadUserData(uid) {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      
      // Update UI with user data
      document.getElementById('profileUsername').textContent = data.username || 'User';
      document.getElementById('profileUserId').textContent = '@' + (data.userId || 'user');
      document.getElementById('walletBalance').textContent = '৳ ' + (data.balance || 0).toFixed(2);
      document.getElementById('totalCoins').textContent = data.coins || 0;
      document.getElementById('referralCodeDisplay').textContent = data.referralCode || 'N/A';
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// Hide splash screen after 2 seconds
setTimeout(() => {
  document.getElementById('splashScreen').style.display = 'none';
}, 2000);

console.log('App initialized successfully');
