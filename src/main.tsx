import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/editor.css';
import './styles/editor-sources.css';
import './styles/editor-stage.css';
import './styles/editor-pages.css';
import './styles/editor-output.css';
import './styles/merge.css';
import './styles/home.css';
import './styles/settings.css';
import './styles/dialogs.css';
import {App} from './App';
import {startup} from './shell/route';

void startup();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
