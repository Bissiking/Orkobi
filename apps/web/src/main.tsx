import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource-variable/manrope';
import App from './App';
import { PreferencesProvider } from './preferences';
import { BootstrapProvider } from './api';
import AppErrorBoundary from './ErrorBoundary';
import ErrorBanner from './ErrorBanner';
import { installGlobalErrorHandlers } from './errors';
import { PlatformProvider } from './platform/provider';
import './platform/styles.css';
import './styles.css';

installGlobalErrorHandlers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <PreferencesProvider>
        <ErrorBanner />
        <BootstrapProvider>
          <BrowserRouter>
            <PlatformProvider>
              <App />
            </PlatformProvider>
          </BrowserRouter>
        </BootstrapProvider>
      </PreferencesProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
