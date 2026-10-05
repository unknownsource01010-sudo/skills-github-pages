const express = require("express");
const archiver = require("archiver");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const rateBuckets = new Map();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

function apiLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.started >= RATE_WINDOW_MS) {
    bucket = { started: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (rateBuckets.size > 1000) {
    for (const [ip, entry] of rateBuckets) {
      if (now - entry.started >= RATE_WINDOW_MS) rateBuckets.delete(ip);
    }
  }
  if (bucket.count > RATE_MAX) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests. Please try again shortly." });
  }
  next();
}

app.use(express.json({ limit: "64kb", type: "application/json" }));
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "1h"
}));

const MODULES = {
  appointments: { label: "Appointments", note: "Scheduling, availability and booking status." },
  estimates: { label: "Estimates", note: "Create customer estimates and turn approved work into jobs." },
  invoices: { label: "Invoices", note: "Invoice workspace with payment-status tracking." },
  crm: { label: "Customer CRM", note: "Customer records, notes and recent activity." },
  inventory: { label: "Inventory", note: "Item catalog, quantity tracking and low-stock views." },
  portal: { label: "Customer Portal", note: "Customer-facing status and request area." },
  team: { label: "Team Operations", note: "Assignments, roles and daily work views." },
  reports: { label: "Reports", note: "Operational summary cards and export-ready data." }
};

function clean(value, max = 120) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}

function normalize(body) {
  const business = clean(body.business, 80) || "Your Business";
  const industry = clean(body.industry, 80) || "Service Business";
  const goal = clean(body.goal, 500) || "Run core operations from one focused workspace.";
  const modules = Array.isArray(body.modules)
    ? body.modules.filter((m) => MODULES[m]).slice(0, 8)
    : [];
  return { business, industry, goal, modules: modules.length ? modules : ["crm", "estimates", "invoices"] };
}

function blueprint(spec) {
  return {
    project: spec.business + " Operations",
    business: spec.business,
    industry: spec.industry,
    objective: spec.goal,
    architecture: {
      client: "Responsive progressive web app",
      data: "Local-first starter data layer with clear API upgrade path",
      security: "Role-ready structure, no embedded credentials, CSP-ready deployment",
      deployment: "Node-hosted static application package"
    },
    modules: spec.modules.map((id) => ({ id, ...MODULES[id] })),
    delivery: [
      "Business brief normalized",
      "Application modules selected",
      "Navigation and starter workflows generated",
      "PWA shell packaged",
      "README and deployment notes included"
    ]
  };
}

function safeFileName(name) {
  return clean(name, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business-app";
}

function generatedIndex(spec) {
  const nav = spec.modules.map((id) => `<button class="nav-item" data-view="${id}">${MODULES[id].label}</button>`).join("");
  const sections = spec.modules.map((id, index) => `
    <section class="view ${index === 0 ? "active" : ""}" id="view-${id}">
      <div class="section-head">
        <div><span class="eyebrow">MODULE</span><h2>${MODULES[id].label}</h2></div>
        <button class="secondary" data-add="${id}">Add record</button>
      </div>
      <p class="muted">${MODULES[id].note}</p>
      <div class="cards">
        <article class="card"><span>Open</span><strong data-count="${id}">0</strong><small>local records</small></article>
        <article class="card"><span>Today</span><strong>Ready</strong><small>workspace initialized</small></article>
        <article class="card"><span>Status</span><strong>Local</strong><small>safe demo storage</small></article>
      </div>
      <div class="panel">
        <div class="panel-title">Recent activity</div>
        <div class="empty" data-activity="${id}">No records yet. Use “Add record” to create your first local item.</div>
      </div>
    </section>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0b1016">
  <title>${spec.business} Operations</title>
  <link rel="manifest" href="./manifest.json">
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div class="app-shell">
    <aside>
      <div class="brand"><span class="mark">VS</span><div><strong>${spec.business}</strong><small>${spec.industry}</small></div></div>
      <nav>${nav}</nav>
      <div class="aside-foot">Generated starter workspace</div>
    </aside>
    <main>
      <header><div><span class="eyebrow">OPERATIONS</span><h1>${spec.business}</h1></div><div class="status"><i></i> Ready</div></header>
      ${sections}
    </main>
  </div>
  <script src="./app.js"></script>
</body>
</html>`;
}

function generatedCss() {
  return `:root{--bg:#0b1016;--panel:#111922;--line:#243140;--text:#f5f7f9;--muted:#93a2b2;--accent:#7db1e8}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.app-shell{min-height:100vh;display:grid;grid-template-columns:260px 1fr}aside{padding:24px 18px;border-right:1px solid var(--line);background:#0d131a;display:flex;flex-direction:column}.brand{display:flex;gap:12px;align-items:center;margin-bottom:30px}.mark{width:42px;height:42px;border:1px solid #3b4d60;border-radius:12px;display:grid;place-items:center;font-weight:800}.brand strong,.brand small{display:block}.brand small,.muted,.aside-foot,small{color:var(--muted)}nav{display:grid;gap:6px}.nav-item,.secondary{appearance:none;border:1px solid transparent;background:transparent;color:var(--text);font:inherit;text-align:left;border-radius:10px;padding:10px 12px;cursor:pointer}.nav-item:hover,.nav-item.active{background:#151f2a;border-color:#253547}.aside-foot{margin-top:auto;font-size:12px}main{padding:38px;max-width:1300px;width:100%}header,.section-head{display:flex;align-items:center;justify-content:space-between;gap:20px}h1,h2{margin:4px 0 0;letter-spacing:-.03em}h1{font-size:34px}h2{font-size:27px}.eyebrow{font-size:11px;letter-spacing:.16em;color:#91a6bb}.status{border:1px solid #2c3c4e;border-radius:999px;padding:8px 12px;color:#c8d5e1}.status i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#7fc59b;margin-right:7px}.view{display:none;padding-top:30px}.view.active{display:block}.secondary{border-color:#33475c;text-align:center}.secondary:hover{background:#14202b}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:26px 0}.card,.panel{border:1px solid var(--line);background:var(--panel);border-radius:16px;padding:20px}.card span,.card small{display:block}.card strong{display:block;font-size:24px;margin:10px 0}.panel-title{font-weight:700}.empty{padding:38px 0 14px;color:var(--muted)}@media(max-width:760px){.app-shell{display:block}aside{position:sticky;top:0;z-index:2;border-right:0;border-bottom:1px solid var(--line);padding:14px}.brand{margin:0 0 12px}.aside-foot{display:none}nav{display:flex;overflow:auto}.nav-item{white-space:nowrap}main{padding:24px 16px}.cards{grid-template-columns:1fr}h1{font-size:28px}}`;
}

function generatedAppJs() {
  return `const buttons=[...document.querySelectorAll(".nav-item")];const views=[...document.querySelectorAll(".view")];
function rowsFor(id){try{return JSON.parse(localStorage.getItem("generated-"+id)||"[]")}catch{return[]}}
function renderModule(id){const rows=rowsFor(id);const count=document.querySelector('[data-count="'+id+'"]');const activity=document.querySelector('[data-activity="'+id+'"]');if(count)count.textContent=String(rows.length);if(activity){activity.textContent=rows.length?rows.slice(-5).reverse().map(r=>new Date(r.created).toLocaleString()+" — "+r.title).join(" · "):"No records yet. Use “Add record” to create your first local item."}}
function openView(id){buttons.forEach(b=>b.classList.toggle("active",b.dataset.view===id));views.forEach(v=>v.classList.toggle("active",v.id==="view-"+id));renderModule(id)}
buttons.forEach(b=>b.addEventListener("click",()=>openView(b.dataset.view)));if(buttons[0])openView(buttons[0].dataset.view);
document.querySelectorAll("[data-add]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.add;const title=prompt("Record name");if(!title)return;const rows=rowsFor(id);rows.push({created:new Date().toISOString(),title:title.trim().slice(0,100)||"New record"});localStorage.setItem("generated-"+id,JSON.stringify(rows));renderModule(id)}));`;
}

app.post("/api/blueprint", apiLimit, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(blueprint(normalize(req.body || {})));
});

app.post("/api/build", apiLimit, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const spec = normalize(req.body || {});
  const folder = safeFileName(spec.business);
  const archive = archiver("zip", { zlib: { level: 9 } });

  res.attachment(folder + "-starter.zip");
  archive.on("error", (err) => {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Build failed." });
    else res.end();
  });

  archive.pipe(res);
  archive.append(generatedIndex(spec), { name: folder + "/index.html" });
  archive.append(generatedCss(), { name: folder + "/styles.css" });
  archive.append(generatedAppJs(), { name: folder + "/app.js" });
  archive.append(JSON.stringify(blueprint(spec), null, 2), { name: folder + "/blueprint.json" });
  archive.append(JSON.stringify({
    name: spec.business + " Operations",
    short_name: spec.business.slice(0, 18),
    start_url: "./",
    display: "standalone",
    background_color: "#0b1016",
    theme_color: "#0b1016"
  }, null, 2), { name: folder + "/manifest.json" });
  archive.append("# " + spec.business + " Operations\n\nGenerated starter application for " + spec.industry + ".\n\nObjective: " + spec.goal + "\n\nSelected modules:\n" + spec.modules.map((m) => "- " + MODULES[m].label).join("\n") + "\n\nThis package is a starter PWA. Review, test, configure authentication/data services, and deploy before production use.\n", { name: folder + "/README.md" });
  archive.finalize();
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "venture-systems", version: "1.1.0" }));

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log("Venture Systems listening on " + PORT));
