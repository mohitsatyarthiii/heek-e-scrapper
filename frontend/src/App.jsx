import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard1';
import Creators from './pages/Creators';

function App() {
  return (
    <Routes>
      {/* Default route redirects to dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      {/* Dashboard page */}
      <Route path="/dashboard" element={<Dashboard />} />
      
      {/* Creators page */}
      <Route path="/creators" element={<Creators />} />
      
      {/* Catch all - redirect to dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;