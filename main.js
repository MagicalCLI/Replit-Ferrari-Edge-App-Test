const ENDPOINT = "/api/ferrari/models";
const CACHE_KEY = "ferrari-board:last";
const BAR_COLORS = ["#bd2535", "#c66a49", "#d39552", "#738a85", "#a6a092"];
const nf = new Intl.NumberFormat("en-US");
const $ = (id) => document.getElementById(id);

/* ---------- Settings and requests ---------- */

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

/* ---------- Small DOM helper ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- Chart (sorted high to low, like the Replit page) ---------- */

function tickStep(max) {
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function renderChart(models) {
  const chart = $("chart");
  chart.replaceChildren();
  const sorted = [...models].sort((a, b) => b.estimatedUnits - a.estimatedUnits);
  if (!sorted.length) {
    chart.append(el("p", "sub", "No model estimates are available."));
    return;
  }
  const max = sorted[0].estimatedUnits;
  const step = tickStep(max);
  const tickValues = [];
  for (let v = 0; v <= max; v += step) tickValues.push(v);

  const body = el("div", "plot-body");
  const grid = el("div", "gridlines");
  for (const v of tickValues) {
    const line = el("div", "gridline");
    line.style.left = `${(v / max) * 100}%`;
    grid.append(line);
  }
  body.append(grid);

  sorted.forEach((m, i) => {
    const row = el("div", "bar-row");
    const lane = el("div", "bar-lane");
    const bar = el("div", "bar");
    bar.style.width = `${(m.estimatedUnits / max) * 100}%`;
    bar.style.background = BAR_COLORS[i % BAR_COLORS.length];
    bar.append(el("span", "bar-value", nf.format(m.estimatedUnits)));
    lane.append(bar);
    row.append(el("div", "bar-label", m.model), lane, el("div"));
    body.append(row);
  });

  const ticks = el("div", "ticks");
  const lane = el("div", "ticks-lane");
  for (const v of tickValues) {
    const t = el("span", "tick", `${(v / 1000).toFixed(0)}k`);
    t.style.left = `${(v / max) * 100}%`;
    lane.append(t);
  }
  ticks.append(el("div"), lane, el("div"));
  chart.append(body, ticks);
}

/* ---------- Model register (API order, like the Replit page) ---------- */

function renderRegister(models) {
  const list = $("register");
  list.replaceChildren();
  for (const m of models) {
    const entry = el("div", "entry");

    const main = el("div", "entry-main");
    const name = el("div", "entry-name");
    name.append(el("span", "model", m.model), el("span", "years", m.years));
    main.append(name, el("p", "variants", m.variants));

    const units = el("div", "entry-units");
    units.append(el("span", "units", nf.format(m.estimatedUnits)), el("span", "units-label", m.estimateLabel));

    entry.append(main, units);
    list.append(entry);
  }
}

function render(data) {
  const models = data.models || [];
  $("count").textContent = models.length;
  renderChart(models);
  renderRegister(models);
}

/* ---------- Status, cache, refresh loop ---------- */

function setStatus(text, kind) {
  const node = $("status");
  node.textContent = text;
  node.dataset.kind = kind;
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
    $("updated").textContent = `Updated ${new Date().toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    })}`;
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
