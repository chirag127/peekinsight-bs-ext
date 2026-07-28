/**
 * PeekInsight — AI provider abstraction
 * All providers expose: summarize(pageText, url) → Promise<string>
 */

const POLLINATIONS_URL = "https://text.pollinations.ai/";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function buildMessages(pageText, url) {
  return [
    {
      role: "system",
      content: "You are a concise summariser. Given webpage text, write 2-3 sentence summary. Be factual, terse, no filler.",
    },
    {
      role: "user",
      content: `URL: ${url}\n\nPage text (truncated):\n${pageText.slice(0, 4000)}`,
    },
  ];
}

async function pollinations(pageText, url) {
  const res = await fetch(POLLINATIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: buildMessages(pageText, url),
      model: "openai",
      private: true,
    }),
  });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  const text = await res.text();
  // Pollinations returns plain text or JSON depending on model
  try {
    const j = JSON.parse(text);
    return j?.choices?.[0]?.message?.content ?? j?.text ?? text;
  } catch {
    return text;
  }
}

async function openrouter(pageText, url, apiKey) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/chirag127/peekinsight-bs-ext",
      "X-Title": "PeekInsight",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      messages: buildMessages(pageText, url),
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const j = await res.json();
  return j.choices[0].message.content;
}

async function gemini(pageText, url, apiKey) {
  const res = await fetch(`${GEMINI_BASE}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `You are a concise summariser. URL: ${url}\n\nPage text:\n${pageText.slice(0, 4000)}\n\nWrite a 2-3 sentence summary. Be factual, terse.`,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const j = await res.json();
  return j.candidates[0].content.parts[0].text;
}

async function custom(pageText, url, apiKey, baseUrl) {
  const endpoint = baseUrl.replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "default",
      messages: buildMessages(pageText, url),
    }),
  });
  if (!res.ok) throw new Error(`Custom endpoint ${res.status}`);
  const j = await res.json();
  return j.choices[0].message.content;
}

/**
 * Main entry point used by background.js
 * @param {string} pageText
 * @param {string} url
 * @param {object} settings  { provider, apiKey, customUrl }
 * @returns {Promise<{summary: string, provider: string}>}
 */
export async function summarize(pageText, url, settings) {
  const { provider = "pollinations", apiKey = "", customUrl = "" } = settings;

  let summary;
  switch (provider) {
    case "openrouter":
      summary = await openrouter(pageText, url, apiKey);
      break;
    case "gemini":
      summary = await gemini(pageText, url, apiKey);
      break;
    case "custom":
      summary = await custom(pageText, url, apiKey, customUrl);
      break;
    default:
      summary = await pollinations(pageText, url);
  }
  return { summary: summary.trim(), provider };
}

/**
 * Extract OG meta tags from raw HTML (called from background.js)
 */
export function extractOGMeta(html) {
  const get = (prop) => {
    const m = html.match(
      new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i")
    ) || html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i")
    );
    return m ? m[1] : "";
  };
  return {
    title: get("title") || extractTitle(html),
    description: get("description"),
    image: get("image"),
  };
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : "";
}

/**
 * Strip HTML to plain text (for background.js — no DOM available)
 */
export function htmlToText(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, "");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ");
  return t.replace(/\s+/g, " ").trim();
}
