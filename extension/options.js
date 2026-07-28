/**
 * PeekInsight — Options page script
 */

const $ = (id) => document.getElementById(id);

const HINTS = {
  openrouter: "Get a free key at openrouter.ai",
  gemini: "Get a free key at aistudio.google.com",
  custom: "API key for your custom endpoint",
};

let hoverDelay = 500;

function renderProvider(p) {
  const needKey = p !== "pollinations";
  $("keyField").classList.toggle("show", needKey);
  $("urlField").classList.toggle("show", p === "custom");
  $("keyHint").textContent = HINTS[p] ?? "";
}

function setDelay(ms) {
  hoverDelay = ms;
  ["d300", "d500", "d1000"].forEach((id) => $( id).classList.remove("active"));
  $("d" + ms).classList.add("active");
}

// Load
chrome.storage.sync.get(
  { enabled: true, aiEnabled: true, provider: "pollinations", apiKey: "", customUrl: "", hoverDelay: 500 },
  (s) => {
    $("enabled").checked = s.enabled;
    $("aiEnabled").checked = s.aiEnabled;
    $("provider").value = s.provider;
    $("apiKey").value = s.apiKey;
    $("customUrl").value = s.customUrl;
    renderProvider(s.provider);
    setDelay(s.hoverDelay);
  }
);

$("provider").addEventListener("change", () => renderProvider($("provider").value));

document.querySelectorAll(".delay-opts button").forEach((btn) => {
  btn.addEventListener("click", () => setDelay(Number(btn.dataset.ms)));
});

$("save").addEventListener("click", () => {
  const settings = {
    enabled: $("enabled").checked,
    aiEnabled: $("aiEnabled").checked,
    provider: $("provider").value,
    apiKey: $("apiKey").value.trim(),
    customUrl: $("customUrl").value.trim(),
    hoverDelay,
  };
  chrome.storage.sync.set(settings, () => {
    $("savedMsg").textContent = "Saved!";
    setTimeout(() => { $("savedMsg").textContent = ""; }, 2000);
  });
});
