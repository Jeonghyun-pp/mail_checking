// Service worker — proxies API calls so requests carry extension permissions
// (host_permissions) instead of the host page's CORS context.

const DEFAULT_BASE = "http://localhost:3000";

async function getConfig() {
  const { apiBase, apiKey } = await chrome.storage.local.get([
    "apiBase",
    "apiKey",
  ]);
  return { apiBase: apiBase || DEFAULT_BASE, apiKey: apiKey || "" };
}

async function apiCall(path, body) {
  const { apiBase, apiKey } = await getConfig();
  if (!apiKey) return { error: "No API key set — open the extension popup." };
  try {
    const res = await fetch(apiBase + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || "HTTP " + res.status };
    return { data };
  } catch (e) {
    return { error: "Request failed: " + (e && e.message) };
  }
}

const ROUTES = {
  find: "/api/v1/find",
  verify: "/api/v1/verify",
  saveLead: "/api/v1/leads",
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const path = ROUTES[msg && msg.type];
  if (!path) {
    sendResponse({ error: "Unknown request" });
    return false;
  }
  apiCall(path, msg.payload).then(sendResponse);
  return true; // keep the channel open for the async response
});
