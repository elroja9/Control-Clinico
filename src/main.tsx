import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PublicBooking from './components/PublicBooking.tsx';
import './index.css';

const isPublicBooking = window.location.pathname.startsWith('/agendar');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPublicBooking ? <PublicBooking /> : <App />}
  </StrictMode>,
);
