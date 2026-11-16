import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { migrateBrowserStorage } from './lib/storageMigration.ts';

// Πριν ζωγραφιστεί οτιδήποτε: τα κλειδιά που κράτησε ο browser με το παλιό όνομα περνούν στο νέο.
migrateBrowserStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
