import { loadApp } from './loadRecovery.js';

// The page's entry point. ui/start.js opens storage, chooses the language
// and loads the app. When that fails because modules did not download,
// loadApp() reloads the page once, and after that shows a message with a
// Reload button rather than leaving the page blank (ui/loadRecovery.js).
// Only loadRecovery.js is imported here, so it is there even when every
// other module failed.
await loadApp(() => import('./start.js'));
