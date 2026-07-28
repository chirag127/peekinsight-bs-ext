/**
 * PeekInsight — Popup script
 */

const LABELS = {
  pollinations: "Pollinations",
  openrouter: "OpenRouter",
  gemini: "Gemini",
  custom: "Custom",
};

document.getElementById("ver").textContent =
  "v" + chrome.runtime.getManifest().version;

// Load settings
chrome.storage.sync.get(
  { enabled: true, aiEnabled: true, provider: "pollinations" },
  (s) => {
    document.getElementById("enabled").checked = s.enabled;
    document.getElementById("aiEnabled").checked = s.aiEnabled;
    document.getElementById("providerBadge").textContent =
      LABELS[s.provider] ?? s.provider;
  }
);

// Persist toggles immediately
function save(key, val) {
  chrome.storage.sync.set({ [key]: val });
}

document.getElementById("enabled").addEventListener("change", (e) =>
  save("enabled", e.target.checked)
);
document.getElementById("aiEnabled").addEventListener("change", (e) =>
  save("aiEnabled", e.target.checked)
);

// Open options
document.getElementById("openOpts").addEventListener("click", () =>
  chrome.runtime.openOptionsPage()
);

// Show summary of current active tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab?.url || tab.url.startsWith("chrome://") || tab.url.startsWith("about:")) return;
  const el = document.getElementById("summary");
  el.innerHTML = '<div class="spin"></div>';
  el.classList.add("show");
  chrome.runtime.sendMessage({ action: "getPreview", url: tab.url }, (resp) => {
    if (chrome.runtime.lastError || !resp?.ok) {
      el.textContent = resp?.error ?? "Could not load preview.";
      return;
    }
    const { og, summary } = resp.data;
    const title = og?.title ? `<strong>${esc(og.title)}</strong><br>` : "";
    const sum = summary ? esc(summary) : "No summary available.";
    el.innerHTML = title + sum;
  });
});

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
