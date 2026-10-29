const ENDPOINT = "/api/ferrari/models";
const CACHE_KEY = "ferrari-board:last";
const $ = (id) => document.getElementById(id);

function readSettings() {
  const s = (typeof screenly !== "undefined" && screenly.settings) || {};
  return {
    apiUrl: String(s.api_url || "").trim().replace(/\/+$/, ""),
    token: String(s.api_token || "").trim(),
    authStyle: String(s.auth_style || "query").trim().toLowerCase(),
    useProxy: String(s.use_cors_proxy || "false").trim().toLowerCase() === "true",
    refreshMs: Math.max(15, parseInt(s.refresh_seconds, 10) || 60) * 1000,
  };
}

function buildRequest(cfg) {
  let url = cfg.apiUrl + ENDPOINT;
  const headers = {};
  if (cfg.authStyle === "header") {
    // Triggers a CORS preflight, which Replit's access shield rejects when called directly.
    headers.Authorization = `Bearer ${cfg.token}`;
  } else {
    url += `?project-protection-bypass=${encodeURIComponent(cfg.token)}`;
  }
  if (cfg.useProxy) url = `${screenly.cors_proxy_url}/${url}`;
  return { url, headers };
}

async function fetchModels(cfg) {
  const { url, headers } = buildRequest(cfg);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.dataset.kind = kind;
}

function render(data) {
  const models = (data.models || []).slice(0, 5);
  const max = Math.max(...models.map((m) => m.estimatedUnits), 1);
  const board = $("board");
  board.replaceChildren();
  for (const m of models) {
    const row = document.createElement("li");
    row.className = "row";

    const rank = document.createElement("div");
    rank.className = "rank";
    rank.textContent = m.rank;

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = m.model;
    const years = document.createElement("small");
    years.textContent = m.years;
    name.append(years);

    const track = document.createElement("div");
    track.className = "track";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = `${(m.estimatedUnits / max) * 100}%`;
    const value = document.createElement("div");
    value.className = "value";
    value.textContent = m.estimateLabel;
    track.append(bar, value);

    row.append(rank, name, track);
    board.append(row);
  }
}

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* storage can be unavailable; the screen still works without it */
  }
}

async function refresh() {
  const cfg = readSettings();
  if (!cfg.apiUrl || !cfg.token) {
    setStatus("Setup needed: add the API base URL and token in this app's settings.", "error");
    return;
  }
  try {
    const data = await fetchModels(cfg);
    render(data);
    saveCache(data);
    setStatus("Live data", "live");
    $("updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (err) {
    console.warn("Ferrari board fetch failed:", err);
    const cached = loadCache();
    if (cached) {
      render(cached);
      setStatus("Can't reach the API. Showing the last saved data.", "stale");
    } else {
      setStatus("Can't reach the API. Check the URL, token and auth style in settings.", "error");
    }
  }
}

refresh();
setInterval(refresh, readSettings().refreshMs);
