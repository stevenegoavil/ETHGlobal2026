// src/App.jsx
import { Routes, Route } from 'react-router-dom';
import ReportPage from '@/pages/ReportPage';
import InfoPage from '@/pages/InfoPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ReportPage />} />
      <Route path="/info" element={<InfoPage />} />
    </Routes>
  );
}