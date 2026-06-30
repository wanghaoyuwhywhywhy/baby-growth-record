import { useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import HomePage from '@/pages/HomePage';
import RecordPage from '@/pages/RecordPage';
import TimelinePage from '@/pages/TimelinePage';
import BabyDetailPage from '@/pages/BabyDetailPage';
import BabyEditPage from '@/pages/BabyEditPage';
import GrowthPage from '@/pages/GrowthPage';
import SettingsPage from '@/pages/SettingsPage';

// PWA 自动更新：检测到新版本时自动刷新页面
function setupAutoUpdate() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // 监听 SW 更新，检测到新版本自动刷新
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // 新 SW 已激活，自动刷新页面加载最新资源
    window.location.reload();
  });

  // 定时检查更新（每30分钟）
  const CHECK_INTERVAL = 30 * 60 * 1000;
  setInterval(() => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg) reg.update();
    });
  }, CHECK_INTERVAL);

  // 页面可见性变化时也检查更新（用户切回页面时）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update();
      });
    }
  });
}

// 启动时检查是否长时间未刷新，超过24小时自动清理缓存并刷新
function checkStaleCache() {
  const LAST_REFRESH_KEY = 'last_refresh_time';
  const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24小时
  const now = Date.now();
  const lastRefresh = parseInt(localStorage.getItem(LAST_REFRESH_KEY) || '0', 10);

  if (lastRefresh && (now - lastRefresh > STALE_THRESHOLD)) {
    // 超过24小时，清空缓存后刷新
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
    localStorage.setItem(LAST_REFRESH_KEY, String(now));
    window.location.reload();
    return;
  }
  if (!lastRefresh) {
    localStorage.setItem(LAST_REFRESH_KEY, String(now));
  }
}

export default function App() {
  const initApp = useAppStore((s) => s.initApp);
  const initialized = useAppStore((s) => s.initialized);

  useEffect(() => {
    checkStaleCache();
    setupAutoUpdate();
    initApp();
  }, [initApp]);

  if (!initialized) {
    return (
      <div className="page-container flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-coral/30 border-t-coral rounded-full animate-spin" />
          <p className="text-sm text-muted">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/record" element={<RecordPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/baby/detail" element={<BabyDetailPage />} />
        <Route path="/baby/edit" element={<BabyEditPage />} />
        <Route path="/growth" element={<GrowthPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Router>
  );
}
