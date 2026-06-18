import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from '@/pages/HomePage';
import RecordPage from '@/pages/RecordPage';
import TimelinePage from '@/pages/TimelinePage';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/record" element={<RecordPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
      </Routes>
    </Router>
  );
}
