export const CAREER_STORAGE_PREFIX = "morethan-career-copilot";
const LEGACY_KEYS = Object.freeze(["morethan-career-copilot-prototype"]);

/**
 * Tracks ephemeral resources owned by one career-copilot page session.
 * Aborting a controller also terminates parser/extractor workers through their
 * existing signal cleanup paths.
 * @param {{ revokeObjectURL?: (url: string) => void }=} options
 */
export function createCareerSessionResourceRegistry(options = {}) {
  const controllers = new Set();
  const objectUrls = new Set();
  const disposers = new Set();
  const revokeObjectURL = options.revokeObjectURL ?? ((url) => globalThis.URL?.revokeObjectURL?.(url));

  return {
    /** @param {AbortController} controller */
    registerAbortController(controller) {
      controllers.add(controller);
      return () => controllers.delete(controller);
    },
    /** @param {string} url */
    trackObjectUrl(url) {
      if (typeof url === "string" && url.startsWith("blob:")) objectUrls.add(url);
      return url;
    },
    /** @param {() => void} disposer */
    registerDisposer(disposer) {
      disposers.add(disposer);
      return () => disposers.delete(disposer);
    },
    /** @param {string=} reason */
    clear(reason = "session_cleared") {
      let aborted = 0;
      let revoked = 0;
      let disposed = 0;
      controllers.forEach((controller) => {
        if (!controller.signal.aborted) {
          controller.abort(reason);
          aborted += 1;
        }
      });
      disposers.forEach((dispose) => {
        try { dispose(); disposed += 1; } catch { /* cleanup is best effort */ }
      });
      objectUrls.forEach((url) => {
        try { revokeObjectURL(url); revoked += 1; } catch { /* cleanup is best effort */ }
      });
      controllers.clear();
      disposers.clear();
      objectUrls.clear();
      return { aborted, disposed, revoked };
    },
    snapshot() { return { controllers: controllers.size, disposers: disposers.size, objectUrls: objectUrls.size }; },
  };
}

/**
 * Removes only MoreThan career-copilot namespaced browser data. Other brand or
 * site data is intentionally untouched.
 * @param {{ sessionStorage?: Storage, localStorage?: Storage, caches?: CacheStorage, indexedDB?: IDBFactory, document?: Document }=} browser
 */
export async function clearCareerCopilotBrowserData(browser = {}) {
  const sessionRemoved = clearNamespacedStorage(browser.sessionStorage);
  const localRemoved = clearNamespacedStorage(browser.localStorage);
  const cachesRemoved = await clearNamespacedCaches(browser.caches);
  const databasesRemoved = await clearNamespacedDatabases(browser.indexedDB);
  const cookiesRemoved = clearNamespacedCookies(browser.document);
  return { sessionRemoved, localRemoved, cachesRemoved, databasesRemoved, cookiesRemoved };
}

/** @param {Storage | undefined} storage */
function clearNamespacedStorage(storage) {
  if (!storage) return 0;
  /** @type {string[]} */
  const keys = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && isCareerKey(key)) keys.push(key);
    }
    LEGACY_KEYS.forEach((key) => { if (!keys.includes(key) && storage.getItem(key) !== null) keys.push(key); });
    keys.forEach((key) => storage.removeItem(key));
    return keys.length;
  } catch {
    return 0;
  }
}

/** @param {CacheStorage | undefined} cacheStorage */
async function clearNamespacedCaches(cacheStorage) {
  if (!cacheStorage?.keys) return 0;
  try {
    const keys = (await cacheStorage.keys()).filter(isCareerKey);
    const results = await Promise.all(keys.map((key) => cacheStorage.delete(key)));
    return results.filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** @param {IDBFactory | undefined} indexedDb */
async function clearNamespacedDatabases(indexedDb) {
  if (!indexedDb?.databases || !indexedDb?.deleteDatabase) return 0;
  try {
    const databases = await indexedDb.databases();
    const names = databases.map((database) => database.name).filter((name) => typeof name === "string" && isCareerKey(name));
    /** @type {string[]} */
    const validNames = names.filter((name) => typeof name === "string");
    await Promise.all(validNames.map((name) => deleteDatabase(indexedDb, name)));
    return validNames.length;
  } catch {
    return 0;
  }
}

/** @param {IDBFactory} indexedDb @param {string} name */
function deleteDatabase(indexedDb, name) {
  return new Promise((resolve) => {
    try {
      const request = indexedDb.deleteDatabase(name);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    } catch { resolve(false); }
  });
}

/** @param {Document | undefined} documentRef */
function clearNamespacedCookies(documentRef) {
  if (!documentRef) return 0;
  try {
    const names = documentRef.cookie.split(";").map((entry) => entry.split("=")[0]?.trim()).filter((name) => name && isCareerKey(name));
    names.forEach((name) => { documentRef.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`; });
    return names.length;
  } catch { return 0; }
}

/** @param {string} key */
function isCareerKey(key) { return key === CAREER_STORAGE_PREFIX || key.startsWith(`${CAREER_STORAGE_PREFIX}-`) || LEGACY_KEYS.includes(key); }
