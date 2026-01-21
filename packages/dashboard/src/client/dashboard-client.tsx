import { hydrate, prerender as ssr } from 'preact-iso';
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
