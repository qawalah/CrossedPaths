// Renders the CrossPaths icon and writes every PNG the app, web client and store listing use.
// Run from the repo root:
//   node store-listing/icon-src/make-icons.js --design trails         write all icon files
//   node store-listing/icon-src/make-icons.js --preview sheet.png     compare every design
// Designs live in designs.js. Needs Playwright + Chromium (preinstalled in Claude cloud
// sessions; elsewhere `npm i playwright && npx playwright install chromium`).
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const RES = "mobile/android/app/src/main/res";
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const targets = [
  ["mobile/assets/icon.png", 1024, "full", "rgb"], // Expo uses this for iOS too
  ["mobile/assets/adaptive-icon.png", 1024, "adaptive"],
  ["mobile/assets/notification-icon.png", 48, "mono"],
  ["mobile/ios/CrossPaths/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png", 1024, "full", "rgb"], // iOS rejects alpha
  ["server/server/static/icon-192.png", 192, "full"],
  ["server/server/static/icon-512.png", 512, "full"],
  ["server/server/static/icon-maskable-512.png", 512, "maskable"],
  ["store-listing/icon-512.png", 512, "full"],
  ["store/icon.png", 512, "full"],
];
for (const [d, m] of Object.entries(DENSITIES)) {
  targets.push([`${RES}/mipmap-${d}/ic_launcher.png`, 108 * m, "full"]);
  targets.push([`${RES}/mipmap-${d}/ic_launcher_round.png`, 108 * m, "round"]);
  targets.push([`${RES}/mipmap-${d}/ic_launcher_foreground.png`, 108 * m, "adaptive"]);
  targets.push([`${RES}/drawable-${d}/notification_icon.png`, 24 * m, "mono"]);
}

// Encodes RGBA pixels as an RGB PNG (no alpha channel) for icons that must be opaque.
function rgbPng(rgba, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, o = y * (w * 3 + 1) + 1 + x * 3;
    raw[o] = rgba[i]; raw[o + 1] = rgba[i + 1]; raw[o + 2] = rgba[i + 2];
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([len, t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Comparison sheet: each design as the store icon, under Android launcher masks, at home-screen
// size on dark and light wallpaper, and as a notification glyph.
function buildSheet() {
  const img = (name, size, kind, css = "") => {
    const i = new Image(); i.src = renderIcon(name, size * 2, kind).toDataURL(); i.style.cssText = `width:${size}px;height:${size}px;${css}`; return i;
  };
  const el = (tag, css, kids = []) => { const e = document.createElement(tag); e.style.cssText = css; kids.forEach(k => e.append(k)); return e; };
  const cell = (caption, node, bg = "transparent") => el("div", "display:flex;flex-direction:column;align-items:center;gap:10px", [
    el("div", `display:grid;place-items:center;width:200px;height:200px;border-radius:20px;background:${bg}`, [node]),
    Object.assign(el("div", "font:500 13px/1.3 Inter,system-ui;color:#8a97b4"), { textContent: caption }),
  ]);
  document.body.style.cssText = "margin:0;background:#0f1729;padding:40px 48px;display:flex;flex-direction:column;gap:36px";
  Object.entries(ICON_DESIGNS).forEach(([name, d], n) => {
    const home = (wall, fg) => el("div", "display:flex;gap:22px;align-items:flex-start", [56, 40].map(s =>
      el("div", "display:flex;flex-direction:column;align-items:center;gap:6px", [img(name, s, "adaptive", "border-radius:50%"),
        Object.assign(el("div", `font:500 11px Inter,system-ui;color:${fg}`), { textContent: s + "dp" })])));
    const notif = el("div", "display:flex;gap:18px;align-items:center", [24, 48].map(s => img(name, s, "mono")));
    document.body.append(el("section", "display:flex;align-items:center;gap:28px", [
      Object.assign(el("div", "width:180px;font:700 22px/1.2 Inter,system-ui;color:#e8eefc"), { textContent: `${n + 1}. ${d.label}` }),
      cell("Store / full", img(name, 180, "full", "border-radius:36px")),
      cell("Adaptive · circle", img(name, 150, "adaptive", "border-radius:50%")),
      cell("Adaptive · squircle", img(name, 150, "adaptive", "border-radius:34%")),
      cell("Home screen · dark", home("#1e293b", "#cbd5e1"), "linear-gradient(160deg,#334155,#0f172a)"),
      cell("Home screen · light", home("#e2e8f0", "#334155"), "linear-gradient(160deg,#f8fafc,#cbd5e1)"),
      cell("Notification", notif, "#1f2937"),
    ]));
  });
}

(async () => {
  const arg = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : null; };
  const design = arg("--design"), preview = arg("--preview");
  if (!design && !preview) { console.error("usage: make-icons.js --design <name> | --preview <out.png>"); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1640, height: 900 } });
  await page.setContent("<!doctype html><meta charset=utf-8><body></body>");
  await page.addScriptTag({ path: path.join(__dirname, "designs.js") });
  if (preview) {
    await page.evaluate(`(${buildSheet})()`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve(preview), fullPage: true });
    console.log("wrote", preview);
  }
  if (design) {
    const known = await page.evaluate(() => Object.keys(ICON_DESIGNS));
    if (!known.includes(design)) throw new Error(`unknown design "${design}"; pick one of ${known.join(", ")}`);
    for (const [rel, size, kind, format] of targets) {
      let out;
      if (format === "rgb") {
        const px = await page.evaluate(([d, s, k]) => Array.from(renderIcon(d, s, k).getContext("2d").getImageData(0, 0, s, s).data), [design, size, kind]);
        out = rgbPng(px, size, size);
      } else {
        const url = await page.evaluate(([d, s, k]) => renderIcon(d, s, k).toDataURL("image/png"), [design, size, kind]);
        out = Buffer.from(url.split(",")[1], "base64");
      }
      fs.writeFileSync(path.join(ROOT, rel), out);
    }
    console.log(`wrote ${targets.length} files for "${design}"`);
  }
  await browser.close();
})();
