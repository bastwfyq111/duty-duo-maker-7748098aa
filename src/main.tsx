import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateFromIDB } from "./lib/storage";

// Recover known keys from IndexedDB before mounting (offline safety net)
hydrateFromIDB(["rosterData", "shifts_v1"]).finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});

// Guard: don't register SW in iframes or preview hosts
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
} else if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}
