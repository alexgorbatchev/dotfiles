import { hydrate } from 'preact';
import { prerender as ssr } from 'preact-iso';

// eslint-disable-next-line import/no-unassigned-import
import './styles/globals.css';
import { App } from './App';

if (typeof window !== 'undefined') {
  const appElement = document.getElementById('app');
  if (appElement) {
    hydrate(<App />, appElement);
  }
}

export async function prerender() {
  return await ssr(<App />);
}

import.meta.hot.accept();
