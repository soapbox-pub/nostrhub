import { createRoot } from 'react-dom/client';

// Import polyfills first
import './lib/polyfills.ts';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { hydrateNip05Cache } from '@/lib/nip05Cache';
import App from './App.tsx';
import './index.css';

// Warm the in-memory NIP-05 cache from IndexedDB so verified handles render
// without a loading skeleton on first paint.
hydrateNip05Cache();

import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/space-grotesk';

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
