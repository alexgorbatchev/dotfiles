import { h, hydrate } from "preact";
import { prerender as ssr } from "preact-iso";

import "./styles/globals.css";
import { App } from "./App";

type DashboardPrerenderResult = Awaited<ReturnType<typeof ssr>>;

if (typeof window !== "undefined") {
  const appElement = document.getElementById("app");
  if (appElement) {
    hydrate(h(App, {}), appElement);
  }
}

export async function prerender(): Promise<DashboardPrerenderResult> {
  return await ssr(h(App, {}));
}

import.meta.hot.accept();
