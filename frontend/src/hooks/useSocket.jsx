// src/hooks/useSocket.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { socketService } from '../services/socket';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastLogs, setLastLogs] = useState([]);
  const [workerStatus, setWorkerStatus] = useState({
    isProcessing: false,
    lastProcessed: null,
    tasksProcessed: 0
  });

  useEffect(() => {
    // Connect to socket
    socketService.connect('https://heek-e-scrapper.onrender.com');

    // Listen for connection changes
    socketService.on('connectionChange', (connected) => {
      setIsConnected(connected);
    });

    // Listen for initial logs
    socketService.on('initialLogs', (logs) => {
      setLastLogs(logs);
    });

    // Listen for new logs
    socketService.on('newLog', (log) => {
      setLastLogs(prev => {
        const newLogs = [log, ...prev];
        return newLogs.slice(0, 100);
      });
      
      // Update worker status based on logs
      if (log.source === 'worker') {
        if (log.message.includes('Processing task')) {
          setWorkerStatus(prev => ({
            ...prev,
            isProcessing: true,
            lastProcessed: new Date()
          }));
        } else if (log.message.includes('completed')) {
          setWorkerStatus(prev => ({
            ...prev,
            isProcessing: false,
            tasksProcessed: prev.tasksProcessed + 1,
            lastProcessed: new Date()
          }));
        }
      }
    });

    // Cleanup on unmount
    return () => {
      socketService.disconnect();
    };
  }, []);

  const value = {
    isConnected,
    lastLogs,
    workerStatus
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};