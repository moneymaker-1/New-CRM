/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * عميل API: إدارة توكن المصادقة وحقنه تلقائياً في كل طلبات /api،
 * مع التعامل الموحّد مع انتهاء الجلسة (401).
 */

const TOKEN_KEY = "expo_auth_token";
let inMemoryToken: string | null = null;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* تجاهل (وضع التصفح الخاص) */
  }
}
function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* تجاهل */
  }
}

export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  inMemoryToken = safeGet(TOKEN_KEY);
  return inMemoryToken;
}

export function setAuthToken(token: string) {
  inMemoryToken = token;
  safeSet(TOKEN_KEY, token);
}

export function clearAuthToken() {
  inMemoryToken = null;
  safeRemove(TOKEN_KEY);
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

/**
 * تثبيت اعتراض fetch لحقن ترويسة Authorization تلقائياً في طلبات /api،
 * والتعامل مع 401 بإنهاء الجلسة مرة واحدة.
 */
export function installApiAuth() {
  const w = window as any;
  if (w.__apiAuthInstalled) return;
  w.__apiAuthInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    let url = "";
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.toString();
    else url = (input as Request).url || "";

    const isApi = url.startsWith("/api") || url.includes("/api/");
    // لا نحقن التوكن في نداءات Google الخارجية
    const isExternal = /^https?:\/\//.test(url) && !url.includes(window.location.host);

    if (isApi && !isExternal) {
      const token = getAuthToken();
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      init = { ...init, headers };
    }

    const res = await originalFetch(input as any, init);

    if (isApi && !isExternal && res.status === 401) {
      clearAuthToken();
      if (onUnauthorized) onUnauthorized();
    }
    return res;
  };
}
