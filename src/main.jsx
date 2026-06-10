import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';
import App from './App.jsx';
import AuthGate from './components/AuthGate.jsx';
import { registerSW } from './push.js';
import './index.css';

// Keep the service worker fresh on every load so subscribed devices stay reachable
registerSW();

function Root() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

  if (user === undefined) return null;

  return (
    <AuthGate user={user}>
      <App />
    </AuthGate>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
