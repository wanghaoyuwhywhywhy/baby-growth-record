import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from '@/pages/HomePage';
import RecordPage from '@/pages/RecordPage';
import TimelinePage from '@/pages/TimelinePage';
import BabyDetailPage from '@/pages/BabyDetailPage';
import BabyEditPage from '@/pages/BabyEditPage';
import GrowthPage from '@/pages/GrowthPage';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/record" element={<RecordPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/baby/detail" element={<BabyDetailPage />} />
        <Route path="/baby/edit" element={<BabyEditPage />} />
        <Route path="/growth" element={<GrowthPage />} />
      </Routes>
    </Router>
  );
}
