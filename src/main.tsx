import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import { prepareUpdates } from './app/updates';
createRoot(document.getElementById('root')!).render(<App />);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void prepareUpdates();
}
