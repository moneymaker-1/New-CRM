import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import Toaster from './components/Toaster.tsx';
import {installApiAuth} from './lib/apiClient.ts';
import './index.css';

// تثبيت حقن توكن المصادقة في طلبات الـ API قبل أي نداء
installApiAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster />
    </ErrorBoundary>
  </StrictMode>,
);
