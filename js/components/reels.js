import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../services/firebase.js';
import { earningsService } from '../services/earnings.js';
import { store } from '../store/store.js';
import { DataService } from '../services/storage.js';
import { analytics } from '../services/analytics.js';
import { debounce } from '../utils/helpers.js';

class ReelsComponent {
  constructor() {
    this.currentVideoIndex = 0;
    this.videos = [];
    this.watchedVideos = 0;
    this.observer = null;
    this.init();
  }

  async init() {
    await this.loadVideos();
    this.initObserver();
    this.initEventListeners();
  }

  async loadVideos() {
    const reelsContainer = document.getElementById('reelsContainer');
    if (!reelsContainer) return;

    reelsContainer.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading videos...</p></div>';

    try {
      let videos = await DataService.getWithCache('videos', async () => {
        const videosQuery = query(
          collection(db, 'videos'),
          where('status', '==', 'active'),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        const snapshot = await getDocs(videosQuery);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      });

      if (videos.length === 0) {
        videos = this.getSampleVideos();
      }

      this.videos = videos;
      this.renderVideos(videos);
      
      analytics.track('videos_loaded', { count: videos.length });
    } catch (error) {
      console.error('Failed to load videos:', error);
      reelsContainer.innerHTML = '<div class="error-container"><p>Failed to load videos</p><button onclick="window.location.reload()">Retry</button></div>';
    }
  }

  getSampleVideos() {
    return [
      {
        id: '1',
        url: 'https://assets.mixkit.co/videos/preview/mixkit-woman-using-a-mobile-phone-42794-large.mp4',
        username: 'cooking_master',
        userId: 'cooking_master',
        description: 'Amazing pasta recipe! 🍝',
        likes: 1234,
        thumbnail: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=400'
      },
      {
        id: '2',
        url: 'https://assets.mixkit.co/videos/preview/mixkit-man-jumping-in-the-street-32849-large.mp4',
        username: 'travel_diaries',
        userId: 'travel_diaries',
        description: 'Beautiful sunset views! 🌅',
        likes: 2341,
        thumbnail: 'https://images.unsplash.com/photo-1507525425510-56b6e2d4f9b2?w=400'
      }
    ];
  }

  renderVideos(videos) {
    const reelsContainer = document.getElementById('reelsContainer');
    if (!reelsContainer) return;

    reelsContainer.innerHTML = '';

    videos.forEach((video, index) => {
      const reelElement = this.createReelElement(video, index);
      reelsContainer.appendChild(reelElement);
    });

    this.observeVideos();
  }

  createReelElement(video, index) {
    const div = document.createElement('div');
    div.className = 'reel-item';
    div.setAttribute('data-index', index);
    div.setAttribute('role', 'region');
    div.setAttribute('aria-label', `Video by ${video.username}`);

    div.innerHTML = `
      <video class="reel-video" loop playsinline poster="${video.thumbnail || ''}" preload="none">
        <source data-src="${video.url}" type="video/mp4">
      </video>
      <div class="reel-overlay">
        <div class="reel-user">
          <div class="reel-avatar" aria-hidden="true">${video.username?.charAt(0) || 'U'}</div>
          <div>
            <h4>@${video.username || 'user'}</h4>
            <p>${video.description || 'Amazing video!'}</p>
          </div>
        </div>
        <div class="reel-actions">
          <button class="reel-like-btn" aria-label="Like video">
            <i class="far fa-heart"></i>
            <span>${video.likes || 0}</span>
          </button>
        </div>
      </div>
      <div class="reel-timer">
        <i class="fas fa-clock" aria-hidden="true"></i>
        <span>Watch to earn coins</span>
      </div>
    `;

    const likeBtn = div.querySelector('.reel-like-btn');
    likeBtn.addEventListener('click', () => this.handleLike(video.id));

    return div;
  }

  initObserver() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const video = entry.target.querySelector('video');
          if (video) {
            this.playVideo(video, entry.target.dataset.index);
          }
        } else {
          const video = entry.target.querySelector('video');
          if (video) {
            this.pauseVideo(video);
          }
        }
      });
    }, { threshold: 0.7 });
  }

  observeVideos() {
    const reels = document.querySelectorAll('.reel-item');
    reels.forEach(reel => {
      this.observer.observe(reel);
    });
  }

  async playVideo(video, index) {
    try {
      const source = video.querySelector('source');
      if (source && source.dataset.src && !source.src) {
        source.src = source.dataset.src;
        video.load();
      }

      await video.play();
      this.currentVideoIndex = parseInt(index);
      
      analytics.track('video_play', { 
        videoId: this.videos[index]?.id,
        index 
      });

      video.addEventListener('timeupdate', debounce(() => {
        if (video.currentTime >= 5 && !video.rewardGiven) {
          video.rewardGiven = true;
          this.handleVideoWatched();
        }
      }, 1000));
    } catch (error) {
      console.log('Video playback error:', error);
    }
  }

  pauseVideo(video) {
    video.pause();
  }

  async handleVideoWatched() {
    this.watchedVideos++;

    if (this.watchedVideos % 2 === 0 && store.getState().user) {
      earningsService.showInterstitialAd(async () => {
        const reward = Math.floor(Math.random() * 6) + 5;
        await earningsService.addCoins(reward, 'video_reward', 'Watched 2 videos');
        store.showToast(`+${reward} coins for watching videos!`);
        
        analytics.track('video_reward', { 
          watchedCount: this.watchedVideos,
          reward 
        });
      });
    }
  }

  async handleLike(videoId) {
    if (!store.getState().user) {
      store.showToast('Please login to like videos', 'info');
      return;
    }

    analytics.track('video_like', { videoId });
    store.showToast('Video liked!');
  }

  initEventListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.navigateVideo('prev');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.navigateVideo('next');
      }
    });
  }

  navigateVideo(direction) {
    const reels = document.querySelectorAll('.reel-item');
    let newIndex = this.currentVideoIndex;

    if (direction === 'next' && this.currentVideoIndex < reels.length - 1) {
      newIndex = this.currentVideoIndex + 1;
    } else if (direction === 'prev' && this.currentVideoIndex > 0) {
      newIndex = this.currentVideoIndex - 1;
    }

    if (newIndex !== this.currentVideoIndex) {
      reels[newIndex].scrollIntoView({ behavior: 'smooth' });
    }
  }
}

export const reels = new ReelsComponent();
