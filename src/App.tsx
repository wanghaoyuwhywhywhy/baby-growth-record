import { useEffect, useState, useCallback } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { isAuthenticated, clearAuthInfo, verifyAuth, type AuthRole, isEditMode, setAuthBabyRelations, setAuthBabyLinkRoles, setAuthBabies } from '@/lib/auth';
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

// 路由切换时滚动到顶部 + 验证账号
function ScrollToTop({ onVerifyAccount }: { onVerifyAccount: () => void }) {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    onVerifyAccount();
  }, [pathname, onVerifyAccount]);
  return null;
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [verifying, setVerifying] = useState(true); // 首次加载时先验证
  const initApp = useAppStore((s) => s.initApp);
  const initialized = useAppStore((s) => s.initialized);

  useEffect(() => {
    checkStaleCache();
    setupAutoUpdate();
  }, []);

  // 验证当前账号是否仍存在且状态为approved
  const verifyAccount = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setVerifying(false);
      return;
    }
    try {
      const result = await verifyAuth();
      console.log('[verifyAccount] API返回:', result);
      if (result.ok) {
        setAuthed(true);
        // Store baby relations and link roles from verify result
        if (result.babies) {
          const relations: Record<string, string> = {};
          const linkRoles: Record<string, string> = {};
          for (const baby of result.babies) {
            if (baby.record_id && baby.relation) {
              relations[baby.record_id] = baby.relation;
            }
            if (baby.record_id && baby.linkRole) {
              linkRoles[baby.record_id] = baby.linkRole;
            }
          }
          setAuthBabyRelations(relations);
          setAuthBabyLinkRoles(linkRoles);
          setAuthBabies(result.babies);
        }
      } else {
        console.log('[verifyAccount] 验证失败:', result.error, result.code);
        // 仅在明确的账号状态异常时登出，其他错误保持登录避免临时网络问题导致登出
        const shouldLogout = ['pending', 'frozen', 'deleted', 'rejected', 'account_not_found'].includes(result.code || '');
        if (shouldLogout) {
          clearAuthInfo();
          setAuthed(false);
        }
        // 非明确错误时保持登录
      }
    } catch (e) {
      console.log('[verifyAccount] 请求异常:', e);
      // 网络错误时，如果有格式正确的token则放行（离线可用），否则登出
      const parts = token.split(':');
      if (parts.length >= 3 && parts[1]) {
        setAuthed(true);
      } else {
        clearAuthInfo();
        setAuthed(false);
      }
    }
    setVerifying(false);
  }, []);

  // 首次加载：验证token有效性
  useEffect(() => {
    verifyAccount();
  }, [verifyAccount]);

  // authed变为true时初始化数据
  useEffect(() => {
    if (authed) {
      initApp();
    }
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

  // 首次验证token时显示加载
  if (verifying) {
    return (
      <div className="page-container flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-coral/30 border-t-coral rounded-full animate-spin" />
          <p className="text-sm text-muted">验证中...</p>
        </div>
      </div>
    );
  }

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
      <ScrollToTop onVerifyAccount={verifyAccount} />
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
