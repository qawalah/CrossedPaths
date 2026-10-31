// Draws the CrossPaths icon (map pin over a green/blue cross) and writes every PNG the
// app, web client and store listing use. Run from the repo root:  node store-listing/icon-src/make-icons.js
// Needs Playwright + Chromium (preinstalled in Claude cloud sessions; otherwise `npm i playwright`).
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const RES = "mobile/android/app/src/main/res";
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// kind: full = artwork on navy square; round = same, clipped to a circle;
// adaptive = artwork shrunk into Android's 66/108 safe zone; maskable = web maskable safe zone;
// notify = white silhouette on transparent (Android tints notification icons).
// alpha: keep transparency (otherwise flattened to RGB like the originals).
const targets = [
  ["mobile/assets/icon.png", 1024, "full"],
  ["mobile/assets/adaptive-icon.png", 1024, "adaptive"],
  ["mobile/assets/notification-icon.png", 48, "notify"],
  ["mobile/ios/CrossPaths/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png", 1024, "full"],
  ["server/server/static/icon-192.png", 192, "full"],
  ["server/server/static/icon-512.png", 512, "full"],
  ["server/server/static/icon-maskable-512.png", 512, "maskable"],
  ["store-listing/icon-512.png", 512, "full"],
];
for (const [d, m] of Object.entries(DENSITIES)) {
  targets.push([`${RES}/mipmap-${d}/ic_launcher.png`, 108 * m, "full"]);
  targets.push([`${RES}/mipmap-${d}/ic_launcher_round.png`, 108 * m, "round"]);
  targets.push([`${RES}/mipmap-${d}/ic_launcher_foreground.png`, 108 * m, "adaptive"]);
  targets.push([`${RES}/drawable-${d}/notification_icon.png`, 24 * m, "notify"]);
}

// Runs in the browser. Design grid is 1024 x 1024.
function draw(size, kind) {
  const BG = "#0b1220", GREEN = "#22c55e", BLUE = "#3b82f6";
  const PIN_TOP = "#f25c4a", PIN_BOT = "#d93025", PIN_DOT = "#8f1d14";
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");

  // Artwork layer: gaps are cut out (transparent) so they show whatever sits behind.
  const L = document.createElement("canvas");
  L.width = L.height = size;
  const a = L.getContext("2d");
  const k = { full: 1, round: 0.92, adaptive: 0.68, maskable: 0.88, notify: 1.12 }[kind];
  a.scale(size / 1024, size / 1024);
  a.translate(512, 512); a.scale(k, k); a.translate(-512, -512);
  a.translate(0, -40); // optically centre pin + cross
  a.lineCap = "round";

  const line = (x1, y1, x2, y2, w, color, cut) => {
    a.globalCompositeOperation = cut ? "destination-out" : "source-over";
    a.strokeStyle = color; a.lineWidth = w;
    a.beginPath(); a.moveTo(x1, y1); a.lineTo(x2, y2); a.stroke();
  };
  // Cross: two paths meeting at (512, 760). Blue passes over green.
  line(252, 650, 772, 870, 62, GREEN);
  line(772, 650, 252, 870, 62 + 44, "#000", true);
  line(772, 650, 252, 870, 62, BLUE);

  // Pin: Material "place" shape (24-unit grid), tip at (512, 760).
  const s = 26;
  const pin = new Path2D("M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z");
  a.save();
  a.translate(512 - 12 * s, 760 - 22 * s); a.scale(s, s);
  a.globalCompositeOperation = "destination-out";
  a.lineWidth = 0.9; a.lineJoin = "round"; a.stroke(pin); // gap around the pin
  a.globalCompositeOperation = "source-over";
  const grad = a.createLinearGradient(0, 2, 0, 22);
  grad.addColorStop(0, PIN_TOP); grad.addColorStop(1, PIN_BOT);
  a.fillStyle = grad; a.fill(pin);
  a.beginPath(); a.arc(12, 9, 2.6, 0, Math.PI * 2);
  if (kind === "notify") a.globalCompositeOperation = "destination-out";
  a.fillStyle = PIN_DOT; a.fill();
  a.restore();

  if (kind === "notify") {
    g.drawImage(L, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#fff"; g.fillRect(0, 0, size, size);
    return c.toDataURL("image/png");
  }
  if (kind === "round") { g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.clip(); }
  const bg = g.createRadialGradient(size / 2, size * 0.42, 0, size / 2, size / 2, size * 0.72);
  bg.addColorStop(0, "#16243f"); bg.addColorStop(1, BG);
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  g.drawImage(L, 0, 0);
  return c.toDataURL("image/png");
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [rel, size, kind] of targets) {
    const url = await page.evaluate(([fn, s, k]) => new Function(`return (${fn})`)()(s, k), [draw.toString(), size, kind]);
    fs.writeFileSync(path.join(ROOT, rel), Buffer.from(url.split(",")[1], "base64"));
    console.log(`${rel}  ${size}px  ${kind}`);
  }
  await browser.close();
})();
