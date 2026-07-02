/**
 * Hybrid storage: LocalStorage (sync primary) + IndexedDB mirror (larger capacity, safer offline).
 * Sync API to keep existing code unchanged; IDB mirror happens in the background.
 */
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from "idb-keyval";

const IDB_MIRROR = true;

/** Load a value synchronously from LocalStorage (with JSON parse). */
export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Save a value to LocalStorage and mirror to IndexedDB in the background. */
export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("localStorage full, using IDB only", e);
  }
  if (IDB_MIRROR) {
    idbSet(key, value).catch((e) => console.warn("IDB mirror failed", e));
  }
}

/** On app boot: hydrate LocalStorage from IDB if a key is missing (recovery). */
export async function hydrateFromIDB(keys: string[]): Promise<void> {
  try {
    for (const k of keys) {
      if (localStorage.getItem(k) == null) {
        const v = await idbGet(k);
        if (v != null) localStorage.setItem(k, JSON.stringify(v));
      }
    }
  } catch (e) {
    console.warn("IDB hydration skipped", e);
  }
}

/** Export all app data as a downloadable JSON backup (saves to phone Downloads). */
export function downloadBackup(filename = "roster-backup.json"): void {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    try { data[k] = JSON.parse(localStorage.getItem(k) || "null"); }
    catch { data[k] = localStorage.getItem(k); }
  }
  const payload = { version: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Restore app data from a user-selected JSON backup. Returns count of keys restored. */
export async function restoreBackup(file: File): Promise<number> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const data = parsed?.data ?? parsed;
  if (!data || typeof data !== "object") throw new Error("ملف غير صالح");
  let count = 0;
  for (const [k, v] of Object.entries(data)) {
    const serialized = typeof v === "string" ? v : JSON.stringify(v);
    localStorage.setItem(k, serialized);
    if (IDB_MIRROR) idbSet(k, v).catch(() => {});
    count++;
  }
  return count;
}

export { idbGet, idbSet, idbDel, idbKeys };
