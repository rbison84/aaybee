import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';

// Import global CSS for web
if (Platform.OS === 'web') {
  require('./web/global.css');

  // Ensure viewport meta includes viewport-fit=cover for Safari safe areas
  const existingViewport = document.querySelector('meta[name="viewport"]');
  if (existingViewport) {
    const content = existingViewport.getAttribute('content') || '';
    if (!content.includes('viewport-fit')) {
      existingViewport.setAttribute('content', content + ', viewport-fit=cover');
    }
  }

  // PWA manifest
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.json';
  document.head.appendChild(link);

  // Apple PWA meta tags
  const meta = document.createElement('meta');
  meta.name = 'apple-mobile-web-app-capable';
  meta.content = 'yes';
  document.head.appendChild(meta);

  const statusBarMeta = document.createElement('meta');
  statusBarMeta.name = 'apple-mobile-web-app-status-bar-style';
  statusBarMeta.content = 'black-translucent';
  document.head.appendChild(statusBarMeta);

  // Service worker registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js');
    });
  }
}

registerRootComponent(App);
