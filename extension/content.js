/**
 * PeekInsight — Content Script
 * Hover detection + tooltip display. All heavy lifting delegated to background.js.
 */

const DEFAULTS = { hoverDelay: 500, enabled: true, aiEnabled: true };

let cfg = { ...DEFAULTS };
let tooltip = null;
let hoverTimer = null;
let activeUrl = null;
let mouseOverTooltip = false;
const localCache = new Map();

// ─── init ────────────────────────────────────────────────────────────────────

chrome.storage.sync.get(DEFAULTS, (items) => { cfg = { ...cfg, ...items }; });
chrome.storage.onChanged.addListener((changes) => {
  for (const [k, v] of Object.entries(changes)) cfg[k] = v.newValue;
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "settingsChanged") cfg = { ...cfg, ...msg.settings };
});

createTooltip();
hookLinks(document.querySelectorAll("a[href]"));

new MutationObserver((muts) => {
  muts.forEach((m) => {
    m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches("a[href]")) hookLinks([n]);
      hookLinks(n.querySelectorAll("a[href]"));
    });
  });
}).observe(document.documentElement, { childList: true, subtree: true });

// ─── tooltip DOM ─────────────────────────────────────────────────────────────

function createTooltip() {
  tooltip = document.createElement("div");
  tooltip.className = "pi-tooltip";
  tooltip.innerHTML = `
    <div class="pi-header">
      <span class="pi-brand">PeekInsight</span>
      <span class="pi-close" role="button" aria-label="Close">&#x2715;</span>
    </div>
    <div class="pi-body"></div>
    <div class="pi-footer"></div>
  `;
  tooltip.querySelector(".pi-close").addEventListener("click", hide);
  tooltip.addEventListener("mouseenter", () => { mouseOverTooltip = true; });
  tooltip.addEventListener("mouseleave", () => {
    mouseOverTooltip = false;
    scheduleHide();
  });
  document.documentElement.appendChild(tooltip);
}

// ─── link hooks ──────────────────────────────────────────────────────────────

function hookLinks(links) {
  links.forEach((a) => {
    if (a.dataset.piHooked) return;
    a.dataset.piHooked = "1";
    a.addEventListener("mouseenter", onEnter);
    a.addEventListener("mouseleave", onLeave);
    a.addEventListener("mousemove", onMove);
  });
}

function onEnter(e) {
  if (!cfg.enabled) return;
  const a = e.currentTarget;
  const url = a.href;
  if (!url || url.startsWith("javascript:") || url.startsWith("#")) return;

  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => trigger(a, url), cfg.hoverDelay);
}

function onLeave() {
  clearTimeout(hoverTimer);
  scheduleHide();
}

function onMove(e) {
  if (tooltip.classList.contains("pi-visible")) position(e);
}

function scheduleHide() {
  setTimeout(() => { if (!mouseOverTooltip) hide(); }, 120);
}

// ─── trigger preview ─────────────────────────────────────────────────────────

function trigger(anchor, url) {
  activeUrl = url;
  position({ target: anchor });
  show();
  setBody(loadingHTML());

  if (localCache.has(url)) {
    setBody(previewHTML(localCache.get(url)));
    return;
  }

  chrome.runtime.sendMessage({ action: "getPreview", url }, (resp) => {
    if (url !== activeUrl) return;
    if (chrome.runtime.lastError || !resp) {
      setBody(errorHTML("Extension error. Reload the page."));
      return;
    }
    if (!resp.ok) { setBody(errorHTML(resp.error)); return; }
    localCache.set(url, resp.data);
    setBody(previewHTML(resp.data));
  });
}

// ─── tooltip helpers ─────────────────────────────────────────────────────────

function show() { tooltip.classList.add("pi-visible"); }
function hide() {
  tooltip.classList.remove("pi-visible");
  activeUrl = null;
}

function setBody(html) {
  tooltip.querySelector(".pi-body").innerHTML = html;
}

function position(e) {
  const anchor = e.target.closest ? e.target.closest("a") : e.target;
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const tw = tooltip.offsetWidth || 320;
  const th = tooltip.offsetHeight || 160;
  const pad = 8;
  let top = r.bottom + window.scrollY + pad;
  let left = r.left + window.scrollX;

  if (r.bottom + th + pad > window.innerHeight) top = r.top + window.scrollY - th - pad;
  if (left + tw > window.innerWidth) left = window.innerWidth - tw - pad;
  left = Math.max(pad, left);

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

// ─── HTML templates ───────────────────────────────────────────────────────────

function loadingHTML() {
  return `<div class="pi-spinner"></div>`;
}

function errorHTML(msg) {
  return `<div class="pi-error">${escHtml(msg)}</div>`;
}

function previewHTML(data) {
  const { og, summary, provider } = data;
  const title = og.title ? `<div class="pi-title">${escHtml(og.title)}</div>` : "";
  const desc = og.description ? `<div class="pi-desc">${escHtml(og.description)}</div>` : "";
  const img = og.image ? `<img class="pi-img" src="${escHtml(og.image)}" loading="lazy" alt="">` : "";
  const sum = summary ? `<div class="pi-summary">${escHtml(summary)}</div>` : "";
  const badge = provider && provider !== "none"
    ? `<span class="pi-badge">${escHtml(providerLabel(provider))}</span>` : "";

  const footer = tooltip.querySelector(".pi-footer");
  footer.innerHTML = badge;

  return `${img}${title}${desc}${sum}`;
}

function providerLabel(p) {
  return { pollinations: "Pollinations AI", openrouter: "OpenRouter", gemini: "Gemini", custom: "Custom", none: "" }[p] ?? p;
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
