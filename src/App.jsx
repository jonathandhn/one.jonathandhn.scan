import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import Settings from './pages/Settings';
import EventList from './pages/EventList';
import ParticipantList from './pages/ParticipantList';
import Scanner from './pages/Scanner';
import AddParticipant from './pages/AddParticipant';
import Callback from './pages/Callback';
import Layout from './components/Layout';

function App() {
  return (
    <ToastProvider>
      <Router basename="/scan">
        <Routes>
          <Route path="/" element={<Layout><EventList /></Layout>} />
          <Route path="/settings" element={<Layout><Settings /></Layout>} />
          <Route path="/event/:eventId" element={<Layout><ParticipantList /></Layout>} />
          <Route path="/event/:eventId/scan" element={<Scanner />} />
          <Route path="/event/:eventId/add" element={<Layout><AddParticipant /></Layout>} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
