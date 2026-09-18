import { h, hydrate } from "preact";

import "./styles/globals.css";
import { App } from "./layouts/App";

if (typeof window !== "undefined") {
  const appElement = document.getElementById("app");
  if (appElement) {
    hydrate(h(App, {}), appElement);
  }
}

import.meta.hot.accept();
