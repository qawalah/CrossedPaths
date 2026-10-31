// Browser-side icon drawing. Loaded into a page by make-icons.js; defines window.renderIcon.
// Every design draws on a 1024 x 1024 grid. Gaps (the space around the pin, the under/over
// break where one path crosses the other) are cut out, so the background shows through and the
// same drawing works as a white silhouette for Android notification icons.
(() => {
  const PIN = new Path2D("M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z");

  function tools(a, mono) {
    const op = o => { a.globalCompositeOperation = o; };
    const T = {
      mono,
      stroke(path, w, color) { op("source-over"); a.strokeStyle = mono ? "#fff" : color; a.lineWidth = w; a.lineCap = "round"; a.lineJoin = "round"; a.stroke(path); },
      cut(path, w) { op("destination-out"); a.strokeStyle = "#000"; a.lineWidth = w; a.lineCap = "round"; a.lineJoin = "round"; a.stroke(path); op("source-over"); },
      // A road edge: painted on light designs, cut on dark ones and in silhouettes.
      casing(path, w, color) { color && !mono ? T.stroke(path, w, color) : T.cut(path, w); },
      line(x1, y1, x2, y2) { const p = new Path2D(); p.moveTo(x1, y1); p.lineTo(x2, y2); return p; },
      // Google-Maps style pin standing with its tip on (x, y). s = size of one unit of the 24-grid.
      pin(x, y, s, body, gapPx) {
        a.save();
        a.translate(x - 12 * s, y - 22 * s); a.scale(s, s);
        op("destination-out"); a.lineWidth = gapPx / s; a.lineJoin = "round"; a.stroke(PIN);
        op("source-over"); a.fillStyle = mono ? "#fff" : body; a.fill(PIN);
        op("destination-out"); a.beginPath(); a.arc(12, 9, 2.75, 0, Math.PI * 2); a.fill();
        op("source-over");
        a.restore();
      },
    };
    return T;
  }

  const GREEN = "#16a34a", BLUE = "#2563eb", NAVY = "#0b1220", CORAL = "#f2513f";

  // A route that fades in from (x1, y1) and out towards (x2, y2), solid through the middle.
  const fade = (a, x1, y1, x2, y2, color, from = 0.32, to = 0.68) => {
    const g = a.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, color + "00"); g.addColorStop(from, color); g.addColorStop(to, color); g.addColorStop(1, color + "00");
    return g;
  };
  const inGrid = (a, x, y, s, fn) => { a.save(); a.translate(x - 12 * s, y - 22 * s); a.scale(s, s); fn(); a.restore(); };

  const WEAVE_C = [512, 690];
  const WEAVE_GREEN = "M-20 840 C240 840 400 750 512 690 S790 590 1044 590";
  const WEAVE_BLUE = "M-20 560 C240 560 400 630 512 690 S790 820 1044 820";
  // Short line along the blue route at the crossing, cut out so blue reads as passing over green.
  const overpass = (T, half = 120) => T.line(WEAVE_C[0] - half * 0.9, WEAVE_C[1] - half * 0.44, WEAVE_C[0] + half * 0.9, WEAVE_C[1] + half * 0.44);

  const DESIGNS = {
    // Cream tile, dashed ~100 m match radius, two fading routes swapping lanes, hollow pin.
    weave: {
      label: "Weave",
      bg: "#f6f1e7",
      extent: 380,
      draw(a, T) {
        a.translate(0, -20);
        const [cx, cy] = WEAVE_C, s = 25;
        a.strokeStyle = "rgba(11,18,32,0.26)"; a.lineWidth = 9;
        a.setLineDash([30, 20]); a.beginPath(); a.arc(cx, cy, 168, 0, Math.PI * 2); a.stroke(); a.setLineDash([]);
        T.stroke(new Path2D(WEAVE_GREEN), 62, fade(a, -20, 840, 1044, 590, GREEN));
        T.cut(overpass(T), 62 + 38);
        T.stroke(new Path2D(WEAVE_BLUE), 62, fade(a, -20, 560, 1044, 820, BLUE));
        inGrid(a, cx, cy - 1.1 * s, s, () => {
          a.globalCompositeOperation = "destination-out";
          a.fill(PIN); a.lineWidth = 3.4; a.lineJoin = "round"; a.stroke(PIN);
          a.globalCompositeOperation = "source-over";
          a.strokeStyle = NAVY; a.lineWidth = 1.9; a.stroke(PIN);
          a.beginPath(); a.arc(12, 9, 2.7, 0, Math.PI * 2); a.lineWidth = 1.6; a.stroke();
        });
      },
    },
    // Apple-flavoured: soft lit tile, a translucent accuracy disc, routes and pin with real depth.
    apple: {
      label: "Apple-style",
      bg(g, size) { const v = g.createLinearGradient(0, 0, 0, size); v.addColorStop(0, "#ffffff"); v.addColorStop(1, "#ece6da"); return v; },
      extent: 380,
      draw(a, T) {
        a.translate(0, -20);
        const [cx, cy] = WEAVE_C, s = 25, px = a.getTransform().a; // shadows are in device pixels
        const shadow = (blur, dy, alpha) => { a.shadowColor = `rgba(11,18,32,${alpha})`; a.shadowBlur = blur * px; a.shadowOffsetY = dy * px; };
        const noShadow = () => { a.shadowColor = "transparent"; a.shadowBlur = 0; a.shadowOffsetY = 0; };
        const disc = a.createRadialGradient(cx, cy, 0, cx, cy, 190);
        disc.addColorStop(0, "rgba(0,122,255,0.26)"); disc.addColorStop(1, "rgba(0,122,255,0.15)");
        a.fillStyle = disc; a.beginPath(); a.arc(cx, cy, 190, 0, Math.PI * 2); a.fill();
        a.strokeStyle = "rgba(0,122,255,0.38)"; a.lineWidth = 6; a.stroke();
        shadow(16, 8, 0.16);
        T.stroke(new Path2D(WEAVE_GREEN), 60, fade(a, -20, 840, 1044, 590, "#34c759"));
        noShadow();
        T.cut(overpass(T), 60 + 26);
        shadow(18, 10, 0.22);
        T.stroke(new Path2D(WEAVE_BLUE), 60, fade(a, -20, 560, 1044, 820, "#007aff"));
        noShadow();
        a.save(); a.filter = `blur(${10 * px}px)`; a.fillStyle = "rgba(11,18,32,0.30)";
        a.beginPath(); a.ellipse(cx, cy + 4, 58, 16, 0, 0, Math.PI * 2); a.fill(); a.restore();
        inGrid(a, cx, cy - 1.4 * s, s, () => {
          shadow(26, 16, 0.26);
          a.fillStyle = "#ffffff"; a.fill(PIN);
          noShadow();
          const rim = a.createLinearGradient(0, 2, 0, 22); rim.addColorStop(0, "#2c3a55"); rim.addColorStop(1, NAVY);
          a.strokeStyle = rim; a.lineWidth = 1.6; a.lineJoin = "round"; a.stroke(PIN);
          a.beginPath(); a.arc(12, 9, 2.7, 0, Math.PI * 2); a.lineWidth = 1.4; a.stroke();
        });
      },
    },
    // Google-flavoured (Material): flat white tile, bold solid routes with round ends, flat halo.
    google: {
      label: "Google-style",
      bg: "#ffffff",
      extent: 380,
      draw(a, T) {
        a.translate(0, -20);
        const [cx, cy] = WEAVE_C, s = 25;
        a.fillStyle = "#e8f0fe"; a.beginPath(); a.arc(cx, cy, 200, 0, Math.PI * 2); a.fill();
        T.stroke(new Path2D(WEAVE_GREEN), 74, "#34a853");
        T.cut(overpass(T, 130), 74 + 40);
        T.stroke(new Path2D(WEAVE_BLUE), 74, "#4285f4");
        inGrid(a, cx, cy - 1.2 * s, s, () => {
          a.globalCompositeOperation = "destination-out";
          a.fill(PIN); a.lineWidth = 3.8; a.lineJoin = "round"; a.stroke(PIN);
          a.globalCompositeOperation = "source-over";
          a.fillStyle = "#ffffff"; a.fill(PIN);
          a.strokeStyle = "#202124"; a.lineWidth = 2.2; a.stroke(PIN);
          a.beginPath(); a.arc(12, 9, 2.7, 0, Math.PI * 2); a.lineWidth = 1.9; a.stroke();
        });
      },
    },
  };

  // Notification glyph, shared by every design: a pin with the crossing cut into its head.
  // (A pin above a small X reads as skull-and-crossbones at 24 px.)
  function drawGlyph(a) {
    const s = 45;
    a.save(); a.translate(512 - 12 * s, 512 + 10 * s - 22 * s); a.scale(s, s);
    a.fillStyle = "#fff"; a.fill(PIN);
    a.globalCompositeOperation = "destination-out"; a.strokeStyle = "#000"; a.lineWidth = 1.7; a.lineCap = "round";
    a.beginPath(); a.moveTo(9.4, 6.4); a.lineTo(14.6, 11.6); a.moveTo(14.6, 6.4); a.lineTo(9.4, 11.6); a.stroke();
    a.restore();
  }

  // kind: full | round | adaptive (Android 66/108 safe zone) | maskable (web, 80% zone) | mono (notification)
  window.renderIcon = (name, size, kind) => {
    const d = DESIGNS[name];
    const fit = r => Math.min(1, r / d.extent);
    const k = { full: 1, round: fit(470), adaptive: fit(320), maskable: fit(400), mono: 1 }[kind];
    const layer = document.createElement("canvas");
    layer.width = layer.height = size;
    const a = layer.getContext("2d");
    a.scale(size / 1024, size / 1024);
    a.translate(512, 512); a.scale(k, k); a.translate(-512, -512);
    if (kind === "mono") drawGlyph(a); else d.draw(a, tools(a, false));

    const out = document.createElement("canvas");
    out.width = out.height = size;
    const g = out.getContext("2d");
    if (kind === "mono") return layer;

    if (kind === "round") { g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.clip(); }
    g.fillStyle = typeof d.bg === "function" ? d.bg(g, size) : d.bg; g.fillRect(0, 0, size, size);
    g.drawImage(layer, 0, 0);
    return out;
  };
  window.ICON_DESIGNS = Object.fromEntries(Object.entries(DESIGNS).map(([k, v]) => [k, { label: v.label }]));
})();
