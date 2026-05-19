// Injects a small mailchecking panel onto LinkedIn profile pages.
(function () {
  if (window.__mailcheckingInjected) return;
  window.__mailcheckingInjected = true;

  function send(type, payload) {
    return new Promise((resolve) =>
      chrome.runtime.sendMessage({ type, payload }, resolve),
    );
  }

  function detectName() {
    const h1 = document.querySelector("main h1") || document.querySelector("h1");
    const full = (h1 ? h1.textContent : "").trim().replace(/\s+/g, " ");
    const parts = full.split(" ").filter(Boolean);
    return {
      firstName: parts[0] || "",
      lastName: parts.length > 1 ? parts[parts.length - 1] : "",
    };
  }

  const css = `
    #mc-panel{position:fixed;bottom:20px;right:20px;width:280px;z-index:99999;
      background:#fff;border:1px solid #e5e7eb;border-radius:12px;
      box-shadow:0 8px 28px rgba(0,0,0,.18);font-family:Arial,sans-serif;
      color:#1a1d21;padding:12px}
    #mc-panel h3{margin:0 0 8px;font-size:13px}
    #mc-panel h3 span{color:#4f46e5}
    #mc-panel input{width:100%;box-sizing:border-box;border:1px solid #d1d5db;
      border-radius:7px;padding:5px 7px;font-size:12px;margin-bottom:5px}
    #mc-panel button{background:#4f46e5;color:#fff;border:0;border-radius:7px;
      padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer}
    #mc-panel .mc-close{position:absolute;top:8px;right:10px;background:none;
      color:#9ca3af;font-size:14px;padding:0;cursor:pointer}
    #mc-res{margin-top:8px;font-size:12px}
    #mc-res .mono{font-family:monospace}
    #mc-res .err{color:#dc2626}`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const name = detectName();
  const panel = document.createElement("div");
  panel.id = "mc-panel";
  panel.innerHTML =
    '<button class="mc-close" title="Close">✕</button>' +
    "<h3>mail<span>checking</span> — find email</h3>" +
    '<input id="mc-first" placeholder="First name">' +
    '<input id="mc-last" placeholder="Last name">' +
    '<input id="mc-domain" placeholder="company.com">' +
    '<button id="mc-find">Find email</button>' +
    '<div id="mc-res"></div>';
  document.body.appendChild(panel);

  panel.querySelector("#mc-first").value = name.firstName;
  panel.querySelector("#mc-last").value = name.lastName;
  panel.querySelector(".mc-close").addEventListener("click", () =>
    panel.remove(),
  );

  panel.querySelector("#mc-find").addEventListener("click", async () => {
    const firstName = panel.querySelector("#mc-first").value.trim();
    const lastName = panel.querySelector("#mc-last").value.trim();
    const domain = panel.querySelector("#mc-domain").value.trim();
    const res = panel.querySelector("#mc-res");
    if (!firstName || !domain) {
      res.innerHTML = '<span class="err">First name and domain required.</span>';
      return;
    }
    res.textContent = "Searching…";
    const out = await send("find", { firstName, lastName, domain });
    if (out.error) {
      res.innerHTML = '<span class="err">' + out.error + "</span>";
      return;
    }
    const best = out.data.best;
    if (!best) {
      res.textContent = out.data.reason || "No match found";
      return;
    }
    res.innerHTML =
      '<div><span class="mono"><b>' +
      best.email +
      "</b></span><br>" +
      best.verify.status +
      " · confidence " +
      best.confidence +
      "</div>";
    const save = document.createElement("button");
    save.textContent = "Save as lead";
    save.style.marginTop = "6px";
    save.addEventListener("click", async () => {
      save.textContent = "Saving…";
      const r = await send("saveLead", {
        email: best.email,
        firstName,
        lastName,
        company: domain,
        source: "extension",
      });
      save.textContent = r.error ? "Error" : "Saved ✓";
      save.disabled = !r.error;
    });
    res.appendChild(save);
  });
})();
