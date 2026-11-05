import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { RouteFailure } from './RouteFailure';
import '@fontsource-variable/manrope';
import App from './App';
import { PreferencesProvider } from './preferences';
import { BootstrapProvider } from './api';
import AppErrorBoundary from './ErrorBoundary';
import ErrorBanner from './ErrorBanner';
import { installGlobalErrorHandlers } from './errors';
import { PlatformProvider } from './platform/provider';
import { ConfirmProvider } from './platform/confirm';
import '@orkobi/sdk-ui/styles.css';
import './platform/styles.css';
import './styles.css';
import './platform/business.css';

installGlobalErrorHandlers();
const router = createBrowserRouter([
  { path: '*', element: <App />, errorElement: <RouteFailure /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <PreferencesProvider>
        <ErrorBanner />
        <BootstrapProvider>
          <PlatformProvider>
            <ConfirmProvider>
              <RouterProvider router={router} />
            </ConfirmProvider>
          </PlatformProvider>
        </BootstrapProvider>
      </PreferencesProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
