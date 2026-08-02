import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Der Server ist im selben Netz und antwortet in Millisekunden.
      // Wiederholungsversuche wuerden Fehler nur verzoegern sichtbar machen.
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
});

// Theme vor dem ersten Rendern setzen, sonst blitzt kurz das helle Design auf.
if (
  localStorage.getItem('haeppi-theme') === 'dark' ||
  (!localStorage.getItem('haeppi-theme') &&
    window.matchMedia('(prefers-color-scheme: dark)').matches)
) {
  document.documentElement.classList.add('dark');
}

const container = document.getElementById('root');
if (!container) throw new Error('Wurzelelement #root fehlt in index.html');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
