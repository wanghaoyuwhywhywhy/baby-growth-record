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

export default function App() {
  const initApp = useAppStore((s) => s.initApp);
  const initialized = useAppStore((s) => s.initialized);

  useEffect(() => {
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
