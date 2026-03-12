// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/layout/Layout.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Channels } from './pages/Channels.jsx';
import { Queue } from './pages/Queue.jsx';
import { Logs } from './pages/Logs.jsx';
import { ChannelDetails } from './pages/ChannelDetails.jsx';
import { SocketProvider } from './hooks/useSocket.jsx';
import './index.css';

function App() {
  return (
    <Router>
      <SocketProvider>
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              icon: '✅',
            },
            error: {
              duration: 4000,
              icon: '❌',
            },
          }}
        />
        
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="channels" element={<Channels />} />
            <Route path="channels/:id" element={<ChannelDetails />} />
            <Route path="queue" element={<Queue />} />
            <Route path="logs" element={<Logs />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </SocketProvider>
    </Router>
  );
}

export default App;