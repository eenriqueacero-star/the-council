import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';
import App from './App.jsx';
import AuthGate from './components/AuthGate.jsx';
import './index.css';

function Root() {
  const [user, setUser] = useState(undefined); // undefined = still resolving

  useEffect(() => {
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

  // Don't flash the login screen while Firebase resolves auth state
  if (user === undefined) return null;

  return (
    <AuthGate user={user}>
      <App />
    </AuthGate>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
