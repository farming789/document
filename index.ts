import { getAllQueryString } from 'ranuts/utils';
import { initEmbedApi } from './lib/embed-api';
import { initEvents, setEventUICallbacks } from './lib/events';
import { onCreateNew, openDocumentFromUrl, setUICallbacks } from './lib/document';
import { parseReadonly } from '@ranuts/shared/document-utils';
import {
  createControlPanel,
  createFixedActionButton,
  hideControlPanel,
  showControlPanel,
  showMenuGuide,
} from './lib/ui';
import 'ranui/button';
import '@khmyznikov/pwa-install';
import './styles/base.css';

declare global {
  interface Window {
    onCreateNew: (ext: string) => Promise<void>;
    hideControlPanel?: () => void;
    showControlPanel?: () => void;
    DocsAPI: {
      DocEditor: new (elementId: string, config: any) => any;
    };
  }
}

// Initialize events
initEvents();
initEmbedApi();

// Set up UI callbacks to avoid circular dependency
setUICallbacks({
  hideControlPanel,
  showControlPanel,
  showMenuGuide,
});

// Set up UI callbacks for events module
setEventUICallbacks({
  hideControlPanel,
  showMenuGuide,
});

// Export onCreateNew to window
window.onCreateNew = onCreateNew;

// Export control panel functions for use in other modules
window.hideControlPanel = hideControlPanel;
window.showControlPanel = showControlPanel;

// Initialize UI components
createFixedActionButton();
createControlPanel();

// Check for file or src parameter in URL
// Both parameters support opening document from URL
// Priority: file > src (for backward compatibility)
// Examples:
//   ?file=https://example.com/doc.docx
//   ?src=https://example.com/doc.docx
//   ?file=doc1.docx&src=doc2.xlsx (will use file: doc1.docx)
const { file, src, readonly, agent } = getAllQueryString();
const documentUrl = file || src;
// Pure preview mode: ?readonly=true (also accepts ?readonly=1 or bare ?readonly).
// Opens the document with editing/download disabled (#25, #85, #87).
const isReadonly = parseReadonly(readonly);
// Experimental AI agent panel: opt-in via ?agent=1 (also ?agent=true or bare ?agent).
const agentEnabled = agent === '1' || agent === 'true' || agent === '';
// Expose the opt-in to the editor iframe (same-origin) so its injected patch only
// adds the "AI" button when the agent feature is enabled — otherwise the button
// stays hidden. See public/onlyoffice-v7-iframe-patch.js.
(window as unknown as { __agentEnabled?: boolean }).__agentEnabled = agentEnabled;
if (agentEnabled) {
  void import('./lib/agent-plugin').then(({ createAgentPanel }) => createAgentPanel());
}
// Bridge: the AI button injected into OnlyOffice's left menu lives inside the
// (same-origin) editor iframe. It toggles the panel either by calling this
// global directly or, as a fallback, by posting `agent:toggle` to this window.
const toggleAgentPanelLazy = (): void => {
  void import('./lib/agent-plugin').then(({ toggleAgentPanel }) => toggleAgentPanel());
};
(window as unknown as { __toggleAgentPanel?: () => void }).__toggleAgentPanel = toggleAgentPanelLazy;
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type === 'agent:toggle') toggleAgentPanelLazy();
});
if (documentUrl) {
  // Decode URL if it's encoded
  try {
    const decodedUrl = decodeURIComponent(documentUrl);
    // Open document from URL
    openDocumentFromUrl(decodedUrl, undefined, { readonly: isReadonly });
  } catch (error) {
    // If decoding fails, try using original URL
    console.warn('Failed to decode URL, using original:', error);
    openDocumentFromUrl(documentUrl, undefined, { readonly: isReadonly });
  }
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
        // Check for updates on every page load
        registration.update();
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Initialize PWA install component
const initPwaInstall = () => {
  const pwaInstall = document.createElement('pwa-install');
  pwaInstall.id = 'pwa-install';

  // Optimization: Only use attributes that enhance the specific project experience
  // Use local storage to avoid showing the prompt too often
  pwaInstall.setAttribute('use-local-storage', '');

  // Professional branding
  pwaInstall.setAttribute('name', 'Document Editor');
  pwaInstall.setAttribute('description', 'A privacy-focused, local web-based document editor.');
  pwaInstall.setAttribute('install-description', 'Install the App for a better offline experience and quick access.');

  // Use the browser's native resolution from the existing link tags
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

  if (manifest?.href) pwaInstall.setAttribute('manifest-url', manifest.href);
  if (icon?.href) pwaInstall.setAttribute('icon', icon.href);

  document.body.appendChild(pwaInstall);
};

// Start PWA initialization after short delay to ensure everything is settled
setTimeout(initPwaInstall, 1000);
