import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found in index.html");

/*
 * Registered after load so it never competes with the first paint, and
 * only in production — in dev it would serve a stale bundle back over
 * Vite's HMR and make every edit look like it did nothing.
 */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").catch((error: unknown) => {
      // A failed registration costs offline support and nothing else, so
      // it must never take the app down with it.
      console.warn("[Ekusupo] service worker registration failed", error);
    });
  });
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
