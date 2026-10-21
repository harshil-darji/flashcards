import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { applyTheme } from './ui/lib/theme';
import './ui/theme.css';

// Apply system theme immediately; the stored preference is applied once settings load.
applyTheme('system');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
