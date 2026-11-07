/* The ship's overview board: line art of the ship with a stamp per site, each stamp's clock round its
   plate, a report card and a status panel. One SVG, redrawn only when the state or the selection
   changes. The state is board.json, written by the GM's control page (never on this site); the
   report cards for states not reached aren't here, but each site's effects at half and when lost
   are (the AT RISK panel), and GUIDE swaps the board for the players' rules. While open it checks
   for a new state every 20 s, and nothing is repainted unless it changed (Firefox). */
(function () {
  "use strict";
  var AMB = "#ffb347", DIM = "#96682a", GRN = "#78ffa0", BLK = "#070502";
  var TERM = "VT323, monospace", MONO = "'Share Tech Mono', monospace";

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function half(n) { return Math.ceil(n / 2); }
  function rad(a) { return a * Math.PI / 180; }
  function n1(v) { return Math.round(v * 10) / 10; }

  function tag(site, s) {
    if (s.secured) return s.v >= site.size ? "RETAKEN" : "SECURE";
    if (s.v >= site.size) return "LOST";
    if (s.held) return "HELD";
    return "";
  }

  function wrap(text, width) {
    var lines = [], line = "";
    String(text).split(/\s+/).forEach(function (w) {
      if (line && (line + " " + w).length > width) { lines.push(line); line = w; }
      else line = line ? line + " " + w : w;
    });
    if (line) lines.push(line);
    return lines;
  }

  function text(x, y, s, size, col, font, anchor) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + col + '" font-family="' + (font || TERM) +
      '"' + (anchor ? ' text-anchor="' + anchor + '"' : "") + ">" + esc(s) + "</text>";
  }

  function octagon(cx, cy, r) {
    var p = [];
    for (var i = 0; i < 8; i++) p.push(n1(cx + r * Math.cos(rad(22.5 + 45 * i))) + "," + n1(cy + r * Math.sin(rad(22.5 + 45 * i))));
    return p.join(" ");
  }

  function sector(cx, cy, r0, r1, a0, a1) {
    function pt(r, a) { return n1(cx + r * Math.cos(rad(a))) + " " + n1(cy + r * Math.sin(rad(a))); }
    var big = a1 - a0 > 180 ? 1 : 0;
    return "M" + pt(r1, a0) + " A" + r1 + " " + r1 + " 0 " + big + " 1 " + pt(r1, a1) +
      " L" + pt(r0, a1) + " A" + r0 + " " + r0 + " 0 " + big + " 0 " + pt(r0, a0) + " Z";
  }

  function icon(kind, cx, cy, col) {
    var line = 'fill="none" stroke="' + col + '" stroke-width="3"', o = "", i, a;
    if (kind === "astrolabe") {
      o += '<circle cx="' + cx + '" cy="' + cy + '" r="34" ' + line + '/><circle cx="' + cx + '" cy="' + cy + '" r="9" ' + line + "/>";
      for (i = 0; i < 4; i++) {
        a = rad(90 * i);
        o += '<path d="M' + n1(cx + 9 * Math.cos(a)) + " " + n1(cy + 9 * Math.sin(a)) + " L" + n1(cx + 44 * Math.cos(a)) + " " + n1(cy + 44 * Math.sin(a)) + '" ' + line + "/>";
        a = rad(45 + 90 * i);
        o += '<path d="M' + n1(cx + 27 * Math.cos(a)) + " " + n1(cy + 27 * Math.sin(a)) + " L" + n1(cx + 34 * Math.cos(a)) + " " + n1(cy + 34 * Math.sin(a)) + '" ' + line + "/>";
      }
    } else if (kind === "people") {
      [[-24, 0.85], [24, 0.85], [0, 1]].forEach(function (p) {
        var x = cx + p[0], k = p[1], top = cy - 22 * k, sh = 19 * k;
        o += '<path d="M' + n1(x - sh) + " " + n1(top + 36 * k) + " A" + n1(sh) + " " + n1(22 * k) + " 0 0 1 " + n1(x + sh) + " " + n1(top + 36 * k) + ' Z" fill="' + BLK + '" stroke="' + col + '" stroke-width="3"/>';
        o += '<circle cx="' + x + '" cy="' + n1(top) + '" r="' + n1(10 * k) + '" fill="' + BLK + '" stroke="' + col + '" stroke-width="3"/>';
      });
      o += '<path d="' + "M" + (cx - 36) + " " + (cy + 18) + " L" + (cx + 36) + " " + (cy + 18) + '" ' + line + "/>";
      o += '<path d="M' + n1(cx + 44 * Math.cos(rad(195))) + " " + n1(cy + 44 * Math.sin(rad(195))) + " A44 44 0 0 1 " + n1(cx + 44 * Math.cos(rad(345))) + " " + n1(cy + 44 * Math.sin(rad(345))) + '" ' + line + "/>";
    } else if (kind === "reactor") {
      [-90, 30, 150].forEach(function (b) { o += '<path d="' + sector(cx, cy, 13, 38, b - 30, b + 30) + '" fill="' + col + '"/>'; });
      o += '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="' + col + '"/><circle cx="' + cx + '" cy="' + cy + '" r="43" ' + line + "/>";
    } else {
      var p = [];
      for (i = 0; i < 10; i++) {
        [[-13, 30], [-8, 41], [8, 41], [13, 30]].forEach(function (t) {
          p.push(n1(cx + t[1] * Math.cos(rad(36 * i + t[0]))) + "," + n1(cy + t[1] * Math.sin(rad(36 * i + t[0]))));
        });
      }
      o += '<polygon points="' + p.join(" ") + '" ' + line + "/>";
      o += '<rect x="' + (cx - 9) + '" y="' + (cy - 16) + '" width="18" height="18" ' + line + "/>";
      o += '<path d="M' + (cx - 9) + " " + (cy + 2) + " L" + cx + " " + (cy + 16) + " L" + (cx + 9) + " " + (cy + 2) + '" ' + line + "/>";
    }
    return o;
  }

  function stamp(site, s, col) {
    var cx = site.stamp[0], cy = site.stamp[1], n = site.size, o = "", i;
    o += '<polygon points="' + octagon(cx, cy, 78) + '" fill="' + BLK + '" stroke="' + col + '" stroke-width="3"/>';
    o += '<polygon points="' + octagon(cx, cy, 70) + '" fill="none" stroke="' + col + '" stroke-width="1"/>';
    o += icon(site.icon, cx, cy, col);
    for (i = 0; i < n; i++) {
      var a0 = -90 + 360 * i / n + 3.5, a1 = -90 + 360 * (i + 1) / n - 3.5;
      o += '<path d="' + sector(cx, cy, 88, 106, a0, a1) + '" ' +
        (i < s.v ? 'fill="' + col + '"' : 'fill="' + BLK + '" stroke="' + col + '" stroke-width="2"') + "/>";
    }
    // the half mark: reaching it is when the site's trouble starts
    var ah = rad(-90 + 360 * half(n) / n);
    o += '<path d="M' + n1(cx + 82 * Math.cos(ah)) + " " + n1(cy + 82 * Math.sin(ah)) + " L" + n1(cx + 116 * Math.cos(ah)) + " " + n1(cy + 116 * Math.sin(ah)) +
      '" stroke="' + col + '" stroke-width="4"/>';
    if (s.held) o += '<circle cx="' + cx + '" cy="' + cy + '" r="122" fill="none" stroke="' + col + '" stroke-width="2" stroke-dasharray="10 8"/>';
    var t = tag(site, s), label = site.name + (t ? " // " + t : ""), w = label.length * 13.6 + 32;
    var dark = t === "LOST";
    o += '<rect x="' + n1(cx - w / 2) + '" y="' + (cy + 112) + '" width="' + n1(w) + '" height="36" fill="' + (dark ? col : BLK) + '" stroke="' + col + '" stroke-width="2"/>';
    o += text(cx, cy + 140, label, 34, dark ? BLK : col, TERM, "middle");
    return o;
  }

  function beam(cx, cy, ax, ay) {
    var o = "", y0 = 112, y1 = cy + 200;
    [[96, 186, 0.10], [78, 150, 0.12], [58, 112, 0.14], [36, 72, 0.14]].forEach(function (b) {
      o += '<polygon points="' + (cx - b[0]) + "," + y0 + " " + (cx + b[0]) + "," + y0 + " " + (cx + b[1]) + "," + y1 + " " + (cx - b[1]) + "," + y1 +
        '" fill="url(#bd-fall)" opacity="' + b[2] * 3 + '"/>';
    });
    o += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="240" ry="170" fill="url(#bd-pool)"/>';
    o += '<ellipse cx="' + ax + '" cy="' + ay + '" rx="150" ry="90" fill="url(#bd-pool)"/>';
    return o;
  }

  function render(L, S, sel) {
    var o = '<svg class="board-svg" viewBox="0 0 1800 1150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ship overview">';
    o += '<defs><linearGradient id="bd-fall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + GRN + '" stop-opacity="0.9"/>' +
      '<stop offset="0.55" stop-color="' + GRN + '" stop-opacity="0.5"/><stop offset="1" stop-color="' + GRN + '" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="bd-pool"><stop offset="0" stop-color="' + GRN + '" stop-opacity="0.26"/><stop offset="1" stop-color="' + GRN + '" stop-opacity="0"/></radialGradient></defs>';
    o += '<image href="' + esc(L.image) + '" x="0" y="0" width="1800" height="1150"/>';
    var chosen = null;
    L.sites.forEach(function (site) { if (site.name === sel) chosen = site; });
    if (chosen) o += beam(chosen.stamp[0], chosen.stamp[1], chosen.anchor[0], chosen.anchor[1]);

    L.sites.forEach(function (site) {
      var cx = site.stamp[0], cy = site.stamp[1], ax = site.anchor[0], ay = site.anchor[1];
      var col = site.name === sel ? GRN : AMB, a = Math.atan2(ay - cy, ax - cx);
      var sx = ay > cy ? cx : n1(cx + 108 * Math.cos(a)), sy = ay > cy ? cy + 148 : n1(cy + 108 * Math.sin(a));
      o += '<path d="M' + sx + " " + sy + " L" + ax + " " + ay + '" stroke="' + col + '" stroke-width="2" fill="none"/>';
      o += '<circle cx="' + ax + '" cy="' + ay + '" r="9" fill="none" stroke="' + col + '" stroke-width="2"/>';
      o += '<path d="M' + (ax - 15) + " " + ay + " H" + (ax + 15) + " M" + ax + " " + (ay - 15) + " V" + (ay + 15) + '" stroke="' + col + '" stroke-width="1"/>';
    });
    L.sites.forEach(function (site) {
      o += '<g class="board-hit" data-site="' + esc(site.name) + '">' + stamp(site, S.sites[site.name], site.name === sel ? GRN : AMB) + "</g>";
    });

    // frame and title
    o += '<rect x="28" y="28" width="1744" height="1094" fill="none" stroke="' + AMB + '" stroke-width="2"/>';
    o += '<rect x="34" y="34" width="1732" height="1082" fill="none" stroke="' + DIM + '" stroke-width="1"/>';
    o += '<rect x="35" y="35" width="1730" height="75" fill="' + BLK + '"/><path d="M34 110 H1766" stroke="' + AMB + '" stroke-width="2"/>';
    o += text(60, 92, L.title, 56, AMB);
    o += text(1740, 80, L.subtitle, 20, DIM, MONO, "end");

    // the report card
    var cs = chosen ? S.sites[chosen.name] : null;
    o += '<rect x="60" y="130" width="360" height="256" fill="' + BLK + '" stroke="' + (chosen ? GRN : AMB) + '" stroke-width="2"/>';
    o += '<rect x="60" y="130" width="360" height="42" fill="' + (chosen ? GRN : AMB) + '"/>';
    o += text(76, 162, chosen ? chosen.name : "SITE REPORT", 34, BLK);
    wrap(cs ? cs.card : "Press a site for its report.", 29).slice(0, 7).forEach(function (t, i) {
      o += text(76, 204 + i * 26, t, 20, chosen ? GRN : AMB, MONO);
    });

    // what goes wrong at the chosen site: public, unlike the cards (the GM's), so the choice is an informed one
    var ex = 1262, ey = 828, ew = 478, ef = chosen && chosen.effects, ecol = chosen ? GRN : AMB, ty = ey + 72;
    o += '<rect x="' + ex + '" y="' + ey + '" width="' + ew + '" height="262" fill="' + BLK + '" stroke="' + ecol + '" stroke-width="2"/>';
    o += '<rect x="' + ex + '" y="' + ey + '" width="' + ew + '" height="42" fill="' + ecol + '"/>';
    o += text(ex + 16, ey + 32, chosen ? chosen.name + " // AT RISK" : "AT RISK", 34, BLK);
    if (ef) {
      var reached = cs.v >= half(chosen.size), lost = cs.v >= chosen.size;
      [[reached && !cs.secured ? "AT HALF // NOW" : "AT HALF", ef.half], [lost ? "IF LOST // LOST" : "IF LOST", ef.full]].forEach(function (e) {
        o += text(ex + 16, ty, e[0], 26, ecol);
        ty += 26;
        wrap(e[1], 40).slice(0, 4).forEach(function (t) { o += text(ex + 16, ty, t, 18, ecol, MONO); ty += 21; });
        ty += 10;
      });
    } else {
      wrap("Press a site to see what goes wrong there. GUIDE explains how the boarding runs.", 40).forEach(function (t) {
        o += text(ex + 16, ty - 4, t, 18, AMB, MONO); ty += 21;
      });
    }

    // the status panel
    var x0 = 60, y0 = 690, x1 = 470, y = y0 + 58;
    o += '<rect x="' + x0 + '" y="' + y0 + '" width="' + (x1 - x0) + '" height="400" fill="' + BLK + '" stroke="' + AMB + '" stroke-width="2"/>';
    o += '<rect x="' + x0 + '" y="' + y0 + '" width="' + (x1 - x0) + '" height="44" fill="' + AMB + '"/>';
    o += text(x0 + 16, y0 + 33, "SHIP STATUS", 36, BLK);
    L.sites.forEach(function (site) {
      var s = S.sites[site.name], on = site.name === sel, col = on ? GRN : AMB, n = site.size, i, t = tag(site, s);
      o += '<g class="board-hit" data-site="' + esc(site.name) + '"><rect x="' + (x0 + 8) + '" y="' + (y - 4) + '" width="' + (x1 - x0 - 16) + '" height="46" fill="' + BLK + '"' +
        (on ? ' stroke="' + col + '" stroke-width="2"' : "") + "/>";
      o += text(x0 + 20, y + 30, site.name, 34, col);
      if (t) o += text(x1 - 26 - n * 26 - 8, y + 27, t, 15, col, MONO, "end");
      for (i = 0; i < n; i++) {
        o += '<rect x="' + (x1 - 26 - (n - i) * 26) + '" y="' + (y + 9) + '" width="20" height="22" stroke="' + col + '" stroke-width="2" fill="' + (i < s.v ? col : "none") + '"/>';
      }
      o += "</g>";
      y += 46;
    });
    o += '<path d="M' + (x0 + 12) + " " + (y + 2) + " H" + (x1 - 12) + '" stroke="' + DIM + '" stroke-width="1"/>';
    y += 34;
    [["SEGMENT", ("0" + S.segment).slice(-2)], ["LANCE", S.lance], ["INFANTRY", S.infantry],
      ["JUMP RIG", S.jumps + " USED / RISK " + S.risk + "%"]].forEach(function (r) {
      o += text(x0 + 20, y, r[0], 30, DIM);
      o += text(x1 - 20, y, r[1], 30, AMB, TERM, "end");
      y += 34;
    });
    return o + "</svg>";
  }

  window.ShipBoard = { render: render, half: half, tag: tag };

  /* ---------- on the receiver ---------- */

  var B = (window.RECEIVER_DATA || {}).board;
  var btn = document.getElementById("btn-board");
  if (!btn || !B) return;
  btn.hidden = false;
  var overlay = document.getElementById("board"), host = document.getElementById("board-host");
  var state = B.initial, raw = "", selected = null, timer = 0, guide = false;
  var guideBtn = document.getElementById("board-guide-btn");

  function draw() { host.innerHTML = guide ? '<div class="board-guide">' + B.guide + "</div>" : render(B, state, selected); }
  if (guideBtn && B.guide) {
    guideBtn.hidden = false;
    guideBtn.addEventListener("pointerdown", function () {
      guide = !guide;
      guideBtn.textContent = guide ? "BOARD" : "GUIDE";
      if (window.Sound && Sound.toggle) Sound.toggle();
      draw();
    });
  }
  function atSite() {
    return B.sites.some(function (s) { return s.name === state.lance; }) ? state.lance : null;
  }
  function poll() {
    fetch("board.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      return r.ok ? r.text() : "";
    }).then(function (t) {
      if (!t || t === raw) return;
      raw = t;
      state = JSON.parse(t);
      if (!overlay.hidden && !guide) draw();       // leave the guide (and where it's scrolled to) alone
    }).catch(function () { /* opened from disk: stay on the state in the build */ });
  }
  function open() {
    overlay.hidden = false;
    document.body.classList.add("modal-open");
    if (window.Sound && Sound.toggle) Sound.toggle();
    if (!selected) selected = atSite();
    draw();
    poll();
    timer = setInterval(poll, 20000);
  }
  function close() {
    overlay.hidden = true;
    document.body.classList.remove("modal-open");
    clearInterval(timer);
  }
  btn.addEventListener("pointerdown", open);
  document.getElementById("board-close").addEventListener("click", close);
  host.addEventListener("click", function (e) {
    var g = e.target.closest && e.target.closest("[data-site]");
    if (!g) return;
    selected = g.getAttribute("data-site");
    if (window.Sound && Sound.toggle) Sound.toggle();
    draw();
  });
  document.addEventListener("keydown", function (e) { if (!overlay.hidden && e.key === "Escape") close(); });
  var pick = /[?&]site=([A-Z]+)/.exec(location.search);            // previews: ?board&site=REACTOR
  if (pick) selected = pick[1];
  if (/[?&]board\b/.test(location.search)) open();
  if (/[?&]board=guide\b/.test(location.search) && guideBtn && B.guide) guideBtn.dispatchEvent(new Event("pointerdown"));
})();
