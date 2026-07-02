/**
 * Storage helpers — re-exported from the hybrid IDB+LocalStorage layer.
 * Kept as a thin compatibility layer so existing imports don't break.
 */
export { loadFromStorage, saveToStorage } from "./storage";
