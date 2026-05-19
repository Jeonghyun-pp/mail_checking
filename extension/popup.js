const $ = (id) => document.getElementById(id);

function send(type, payload) {
  return new Promise((resolve) =>
    chrome.runtime.sendMessage({ type, payload }, resolve),
  );
}

// --- Settings ---------------------------------------------------------------

chrome.storage.local.get(["apiBase", "apiKey"], (cfg) => {
  $("apiBase").value = cfg.apiBase || "http://localhost:3000";
  $("apiKey").value = cfg.apiKey || "";
  if (!cfg.apiKey) $("settings").open = true;
});

$("saveSettings").addEventListener("click", () => {
  chrome.storage.local.set(
    { apiBase: $("apiBase").value.trim(), apiKey: $("apiKey").value.trim() },
    () => {
      $("settingsMsg").textContent = "Saved ✓";
      setTimeout(() => ($("settingsMsg").textContent = ""), 2000);
    },
  );
});

// --- Find -------------------------------------------------------------------

$("findBtn").addEventListener("click", async () => {
  const payload = {
    firstName: $("firstName").value.trim(),
    lastName: $("lastName").value.trim(),
    domain: $("domain").value.trim(),
  };
  if (!payload.firstName || !payload.domain) {
    $("findResult").innerHTML =
      '<span class="err">First name and domain are required.</span>';
    return;
  }
  $("findResult").textContent = "Searching…";
  const res = await send("find", payload);
  if (res.error) {
    $("findResult").innerHTML = '<span class="err">' + res.error + "</span>";
    return;
  }
  const best = res.data.best;
  if (!best) {
    $("findResult").innerHTML =
      '<span class="muted">' + (res.data.reason || "No match") + "</span>";
    return;
  }
  $("findResult").innerHTML =
    '<div><span class="mono"><b>' +
    best.email +
    "</b></span> · " +
    best.verify.status +
    " (" +
    best.confidence +
    ")</div>";
  const save = document.createElement("button");
  save.className = "secondary";
  save.textContent = "Save as lead";
  save.style.marginTop = "6px";
  save.addEventListener("click", async () => {
    save.textContent = "Saving…";
    const r = await send("saveLead", {
      email: best.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      company: payload.domain,
      source: "extension",
    });
    save.textContent = r.error ? "Error" : "Saved ✓";
    save.disabled = !r.error;
  });
  $("findResult").appendChild(save);
});

// --- Verify -----------------------------------------------------------------

$("verifyBtn").addEventListener("click", async () => {
  const email = $("verifyEmail").value.trim();
  if (!email) return;
  $("verifyResult").textContent = "Verifying…";
  const res = await send("verify", { email });
  if (res.error) {
    $("verifyResult").innerHTML = '<span class="err">' + res.error + "</span>";
    return;
  }
  $("verifyResult").innerHTML =
    "<b>" +
    res.data.status +
    "</b> · score " +
    res.data.score +
    '<br><span class="muted">' +
    res.data.reason +
    "</span>";
});

// Pre-fill from the active LinkedIn tab, if any.
chrome.tabs &&
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0] && tabs[0].url;
    if (url && url.includes("linkedin.com/in/")) {
      $("findResult").innerHTML =
        '<span class="muted">Tip: use the in-page panel on this LinkedIn profile.</span>';
    }
  });
