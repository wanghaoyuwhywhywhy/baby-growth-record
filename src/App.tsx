import { useEffect, useState, useCallback } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { isAuthenticated, clearAuthInfo, type AuthRole, isEditMode } from '@/lib/auth';
import LoginPage from '@/pages/LoginPage';
import HomePage from '@/pages/HomePage';
import RecordPage from '@/pages/RecordPage';
import TimelinePage from '@/pages/TimelinePage';
import BabyDetailPage from '@/pages/BabyDetailPage';
import BabyEditPage from '@/pages/BabyEditPage';
import GrowthPage from '@/pages/GrowthPage';
import SettingsPage from '@/pages/SettingsPage';
import VaccinePage from '@/pages/VaccinePage';
import AIChatPage from '@/pages/AIChatPage';

// PWA 自动更新：检测到新版本时自动刷新页面
function setupAutoUpdate() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // 监听 SW 更新，检测到新版本自动刷新
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });

  // 定时检查更新（每30分钟）
  const CHECK_INTERVAL = 30 * 60 * 1000;
  setInterval(() => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg) reg.update();
    });
  }, CHECK_INTERVAL);

  // 页面可见性变化时也检查更新
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update();
      });
    }
  });
}

// 超过24小时自动清理缓存并刷新
function checkStaleCache() {
  const LAST_REFRESH_KEY = 'last_refresh_time';
  const STALE_THRESHOLD = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const lastRefresh = parseInt(localStorage.getItem(LAST_REFRESH_KEY) || '0', 10);

  if (lastRefresh && (now - lastRefresh > STALE_THRESHOLD)) {
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

// 路由切换时滚动到顶部
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);
  return null;
}

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const initApp = useAppStore((s) => s.initApp);
  const initialized = useAppStore((s) => s.initialized);

  useEffect(() => {
    checkStaleCache();
    setupAutoUpdate();
  }, []);

  useEffect(() => {
    if (authed) initApp();
  }, [authed, initApp]);

  // initialized 变为 true 时（数据加载完成），滚动到顶部
  useEffect(() => {
    if (initialized) {
      // 延迟确保 DOM 布局完成后再滚动（手机浏览器尤其需要）
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        }, 100);
      });
    }
  }, [initialized]);

  // API 401 时通过自定义事件通知 App 登出
  useEffect(() => {
    const handler = () => {
      clearAuthInfo();
      setAuthed(false);
    };
    window.addEventListener('auth-expired', handler);
    return () => window.removeEventListener('auth-expired', handler);
  }, []);

  const handleLoginSuccess = useCallback((role: AuthRole) => {
    // 清除 hash 确保登录后跳转首页（而非停留在之前的页面如 /settings）
    window.location.hash = '#/';
    window.scrollTo(0, 0);
    setAuthed(true);
  }, []);

  if (!authed) {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

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
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/record" element={<RecordPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/baby/detail" element={<BabyDetailPage />} />
        <Route path="/baby/edit" element={<BabyEditPage />} />
        <Route path="/growth" element={<GrowthPage />} />
        <Route path="/vaccine" element={<VaccinePage />} />
        <Route path="/chat" element={<AIChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Router>
  );
}
