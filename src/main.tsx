import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider } from './AuthContext.tsx';
import './index.css';

createRoot(document.getElementById('app')!).render(
    <StrictMode>
        <ErrorBoundary>
            <AuthProvider>
                <App />
            </AuthProvider>
        </ErrorBoundary>
    </StrictMode>,
);
