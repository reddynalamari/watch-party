import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// No <StrictMode> here on purpose — it double-mounts components in dev,
// which makes react-player register the YouTube IFrame API twice and
// YouTube blocks the second registration as a violation.
createRoot(document.getElementById('root')).render(<App />);
