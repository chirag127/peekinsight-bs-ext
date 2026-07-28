/**
 * PeekInsight — Service Worker (background.js)
 * All AI calls and page fetches happen here to avoid CORS in content scripts.
 */

import { summarize, extractOGMeta, htmlToText } from "./ai-providers.js";

const CACHE_TTL = 30 * 60 * 1000; // 30 min
const previewCache = new Map();

// ─── settings ───────────────────────────────────────────────────────────────

let settings = {
  provider: "pollinations",
  apiKey: "",
  customUrl: "",
  enabled: true,
  aiEnabled: true,
  hoverDelay: 500,
};

async function loadSettings() {
  const stored = await chrome.storage.sync.get(null);
  settings = { ...settings, ...stored };
}

loadSettings();

chrome.storage.onChanged.addListener((changes) => {
  for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
});

// ─── message router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "getPreview") {
    if (!settings.enabled) {
      sendResponse({ ok: false, error: "Extension disabled" });
      return true;
    }
    getPreview(msg.url)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.action === "getSettings") {
    sendResponse(settings);
    return true;
  }
});

// ─── preview logic ────────────────────────────────────────────────────────────

async function getPreview(url) {
  const hit = previewCache.get(url);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  const { html, ok } = await safeFetch(url);

  const og = extractOGMeta(html || "");
  const pageText = html ? htmlToText(html) : "";

  let summary = "";
  let provider = "none";

  if (ok && settings.aiEnabled && pageText.length > 50) {
    try {
      ({ summary, provider } = await summarize(pageText, url, settings));
    } catch (e) {
      summary = `AI unavailable: ${e.message}`;
    }
  } else if (!ok) {
    summary = "Could not fetch page content.";
  }

  const data = { og, summary, provider, url };
  previewCache.set(url, { data, ts: Date.now() });
  return data;
}

async function safeFetch(url) {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      credentials: "omit",
      headers: { Accept: "text/html" },
    });
    clearTimeout(tid);
    if (!res.ok) return { html: "", ok: false };
    const html = await res.text();
    return { html, ok: true };
  } catch {
    return { html: "", ok: false };
  }
}
