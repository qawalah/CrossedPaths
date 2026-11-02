// Renders the step illustrations: node docs/wiki/tools/render.js  (needs Playwright + Chromium)
const { chromium } = require("playwright");
const path = require("path");
const STEPS = require("./steps");
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
function html(s, n) {
  const rows = (s.crop ? s.rows.slice(0, s.crop) : s.rows).map((r, i) => {
    r = typeof r === "string" ? { t: r } : r;
    const cls = ["row", r.btn && "btn", r.link && "link", r.warn && "warn", r.search && "search", i === s.tap && "tap"].filter(Boolean).join(" ");
    return `<div class="${cls}">${r.icon ? `<span class="ic">${r.icon}</span>` : ""}<div><div>${esc(r.t)}</div>${r.sub ? `<div class="sub">${esc(r.sub)}</div>` : ""}</div>${i === s.tap ? `<span class="badge">${n}</span>` : ""}</div>`;
  }).join("");
  const top = s.frame === "web"
    ? `<div class="url">🔒 ${esc(s.app)}</div>`
    : `<div class="status"><span>9:41</span><span>${esc(s.app)}</span><span>▮▮ 🔋</span></div>`;
  return `<!doctype html><meta charset=utf-8><style>
  body{margin:0;background:#eef1f5;font:15px system-ui,"Noto Color Emoji",sans-serif;display:flex;justify-content:center;padding:20px}
  .dev{width:${s.frame === "web" ? 520 : 320}px;background:#fff;border:10px solid #1f2430;border-radius:${s.frame === "web" ? 12 : 34}px;overflow:hidden;box-shadow:0 6px 20px #0002}
  .status{display:flex;justify-content:space-between;padding:8px 16px;font-size:12px;color:#555}
  .url{background:#e9ecf1;margin:8px;padding:6px 12px;border-radius:16px;font-size:13px;color:#444}
  h1{font-size:22px;margin:6px 16px 10px}
  .map{height:200px;background:linear-gradient(135deg,#cfe8d5,#e8eedf 40%,#d7e6f5);position:relative}
  .av{position:absolute;right:14px;top:12px;width:34px;height:34px;border-radius:50%;background:#7a5cff;outline:4px solid #e5383b;outline-offset:3px}
  .av+.badge{right:4px;top:4px}
  .row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-top:1px solid #eee;position:relative}
  .row .ic{font-size:20px}.sub{font-size:12px;color:#777}
  .btn{justify-content:center;margin:10px 16px;border:0;border-radius:22px;background:#2b6de8;color:#fff;font-weight:600}
  .link>div{color:#2b6de8}.warn{color:#b3261e}.search{margin:10px;border:1px solid #ddd;border-radius:22px;color:#888}
  .tap{outline:4px solid #e5383b;outline-offset:-4px;border-radius:10px;background:#fff4f4}.btn.tap{background:#2b6de8;outline-offset:3px}
  .badge{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:#e5383b;color:#fff;font-weight:700;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:14px}
  .map .badge{transform:none}
  .pad{height:${s.crop ? 0 : 40}px}
  </style><div class="dev">${top}${s.map ? `<div class="map">${s.avatar ? `<div class="av"></div><span class="badge">${n}</span>` : ""}</div>` : `<h1>${esc(s.title)}</h1>`}${rows}<div class="pad"></div></div>`;
}
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 2 });
  for (const [g, list] of Object.entries(STEPS)) for (const [i, s] of list.entries()) {
    await p.setContent(html(s, i + 1));
    await (await p.$(".dev")).screenshot({ path: path.join(__dirname, "..", "images", `${g}-${i + 1}.png`) });
  }
  await b.close();
})();
