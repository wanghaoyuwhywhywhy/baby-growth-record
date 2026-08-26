import { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { unlockEditMode } from '@/lib/auth';
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

// 隐秘路径解锁编辑模式：访问 /admin/edit 后写入标记并跳转首页
function EditModeUnlock() {
  const navigate = useNavigate();
  useEffect(() => {
    unlockEditMode(); // 同步更新 store，各组件响应式重渲染，无需 reload
    navigate('/', { replace: true });
  }, [navigate]);
  return null;
}

export default function App() {
  const initApp = useAppStore((s) => s.initApp);
  const initialized = useAppStore((s) => s.initialized);

  useEffect(() => {
    checkStaleCache();
    setupAutoUpdate();
  }, []);

  // 无需登录，直接初始化数据（后端已放开鉴权，默认 admin 身份）
  useEffect(() => {
    initApp();
  }, [initApp]);

  // initialized 变为 true 时（数据加载完成），滚动到顶部
  useEffect(() => {
    if (initialized) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        }, 100);
      });
    }
  }, [initialized]);

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
        <Route path="/admin/edit" element={<EditModeUnlock />} />
      </Routes>
    </Router>
  );
}
