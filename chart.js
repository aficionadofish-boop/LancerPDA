/* The astrogation chart: the Lantern Cluster in 3D over a tilted reference plane, each system's
   map, and the survey cards. Data: RECEIVER_DATA.chart (built by tools/build_handouts.py from
   handouts/chart/, only what this group has been shown). Drawn on a canvas in the phosphor colour,
   and only when something changes: nothing animates while it sits open (Firefox). */
(function () {
  "use strict";
  var CH = (window.RECEIVER_DATA || {}).chart;
  var $ = function (id) { return document.getElementById(id); };
  var btn = $("btn-chart");
  if (!btn) return;
  if (!CH || !CH.systems || !CH.systems.length) { btn.disabled = true; return; }
  btn.disabled = false;

  var overlay = $("astro"), canvas = $("astro-canvas"), panel = $("astro-panel");
  var titleEl = $("astro-title"), backKey = $("astro-back"), ctx = canvas.getContext("2d");
  var SYS = {};
  CH.systems.forEach(function (s) { SYS[s.id] = s; });

  // Travel times use the ship's current cruise speed (the route's leg; 0.995 c, the Illéri alone, by
  // default). At v: years aboard per light year = sqrt(1 - v^2) / v, Union years = 1 / v.
  function cruise() {
    var r = CH.route, leg = r && r.legs && r.legs[r.legs.length - 1];
    return leg && leg.speed ? leg.speed : 0.995;
  }
  function span(years) {
    if (years < 8 / 52.18) return fmt(years * 365.25, 0) + " days";
    if (years < 0.5) return fmt(years * 52.18, 1) + " wk";
    if (years < 2) return fmt(years * 12, 1) + " mo";
    return fmt(years, 1) + " yr";
  }
  function trip(d) {
    var v = cruise();
    return { ship: span(d * Math.sqrt(1 - v * v) / v), union: span(d / v) };
  }
  var view = "cluster", selSys = null, selBody = null;
  var cam = { yaw: -0.55, pitch: 0.78, zoom: 1.7 }, scam = { yaw: 0.3, pitch: 1.0, zoom: 1 };
  var W = 0, H = 0, DPR = 1, hits = [], pending = false;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function md(s) { return esc(s).replace(/\*(.+?)\*/g, "<i>$1</i>"); }
  function name(s) { return s.name || s.designation; }
  function bodyName(s, b) { return name(s) + " " + b.id; }
  function fmt(v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }); }

  /* ---------- geometry ---------- */

  var centre = (function () {
    var n = 0, c = [0, 0, 0];
    CH.systems.forEach(function (s) { n++; c[0] += s.pos[0]; c[1] += s.pos[1]; c[2] += s.pos[2]; });
    return n ? [c[0] / n, 0, c[2] / n] : [0, 0, 0];
  })();
  var focus = centre.slice();      // where the camera looks; the reference plane stays round `centre`

  function shipPos() {
    var r = CH.route;
    if (!r || !r.legs || !r.legs.length) return r && r.arrived ? SYS[r.arrived.system].pos : null;
    var leg = r.legs[r.legs.length - 1], a = SYS[leg.from].pos, b = SYS[leg.to].pos, t = leg.progress || 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  // world (light years, y up) -> screen. The camera orbits the cluster's centre.
  function project(p, c, scale) {
    var x = p[0] - focus[0], y = p[1] - focus[1], z = p[2] - focus[2];
    var cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    var x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    var D = 7, k = D / (D + z2) * scale;
    return { x: W / 2 + x1 * k, y: H / 2 - y2 * k, z: z2, k: k };
  }

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

  /* ---------- drawing ---------- */

  function colours() {
    var cs = getComputedStyle(document.documentElement);
    var ph = (cs.getPropertyValue("--ph") || "#ffb347").trim();
    return { ph: ph, bg: (cs.getPropertyValue("--ph-bg-edge") || "#050402").trim() };
  }

  function line(pts, a, w, dash) {
    ctx.globalAlpha = a;
    ctx.lineWidth = w;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.stroke();
  }

  function glowLine(pts, a, w, dash) { line(pts, a * 0.25, w + 3, dash); line(pts, a, w, dash); }

  function text(t, x, y, a, size, align) {
    ctx.globalAlpha = a;
    ctx.font = (size || 12) + "px 'Share Tech Mono', monospace";
    ctx.textAlign = align || "left";
    ctx.fillText(t, x, y);
  }

  function dot(x, y, r, a) {
    ctx.globalAlpha = a * 0.25;
    ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function brackets(x, y, r, a) {
    var s = r + 6, l = 5;
    ctx.globalAlpha = a; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
      ctx.beginPath();
      ctx.moveTo(x + q[0] * s, y + q[1] * (s - l));
      ctx.lineTo(x + q[0] * s, y + q[1] * s);
      ctx.lineTo(x + q[0] * (s - l), y + q[1] * s);
      ctx.stroke();
    });
  }

  function starRadius(st) {
    var t = (st.type || "").toLowerCase();
    if (t.indexOf("giant") >= 0) return 5.5;
    if (t.indexOf("brown") >= 0 || t.indexOf("white dwarf") >= 0) return 1.6;
    if (/^[BA]/.test(st["class"])) return 4.2;
    if (/^[FG]/.test(st["class"])) return 3.4;
    if (/^K/.test(st["class"])) return 3;
    return 2.3;
  }

  function drawCluster() {
    var scale = Math.min(W, H) / 7 * cam.zoom;
    var col = colours();
    ctx.strokeStyle = ctx.fillStyle = col.ph;
    // the reference plane: rings every half light year, spokes, a scale note
    for (var r = 0.5; r <= 3.01; r += 0.5) {
      var ring = [];
      for (var i = 0; i <= 72; i++) {
        var a = i / 72 * Math.PI * 2;
        ring.push(project([centre[0] + Math.cos(a) * r, 0, centre[2] + Math.sin(a) * r], cam, scale));
      }
      line(ring, r % 1 === 0 ? 0.22 : 0.11, 1);
    }
    for (var s = 0; s < 12; s++) {
      var an = s / 12 * Math.PI * 2;
      line([project(centre, cam, scale), project([centre[0] + Math.cos(an) * 3, 0, centre[2] + Math.sin(an) * 3], cam, scale)], 0.08, 1);
    }
    // a measuring line from the Illéri to the selected star, with the distance and travel time
    var sp = shipPos();
    if (sp && selSys && SYS[selSys]) {
      var ps = project(sp, cam, scale), pt = project(SYS[selSys].pos, cam, scale), dd = dist(sp, SYS[selSys].pos);
      line([ps, pt], 0.55, 1, [2, 4]);
      var tr = trip(dd);
      text((fmt(dd, 2) + " LY · " + tr.ship + " SHIP / " + tr.union + " UNION · AT " + fmt(cruise(), 2) + " C").toUpperCase(),
           (ps.x + pt.x) / 2 + 6, (ps.y + pt.y) / 2 + 14, 0.7, 10);
    }
    // the Illéri's track
    var rt = CH.route;
    if (rt && rt.arrived) {
      var home = SYS[rt.arrived.system], u = CH.union_dir || [-1, 0, 0];
      var un = Math.hypot(u[0], u[1], u[2]);
      var from = [home.pos[0] + u[0] / un * 1.3, home.pos[1] + u[1] / un * 1.3, home.pos[2] + u[2] / un * 1.3];
      var pf = project(from, cam, scale), ph = project(home.pos, cam, scale);
      glowLine([pf, ph], 0.55, 1.5, [6, 4]);
      text("FROM UNION SPACE", pf.x + 6, pf.y - 6, 0.6, 11);
      (rt.legs || []).forEach(function (leg) {
        var a = SYS[leg.from].pos, b = SYS[leg.to].pos, t = leg.progress || 0;
        var m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        var p0 = project(a, cam, scale), pm = project(m, cam, scale), p1 = project(b, cam, scale);
        glowLine([p0, pm], 0.95, 2);
        line([pm, p1], 0.7, 1.5, [6, 4]);
        // the ship: a chevron pointing along the leg
        var ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        ctx.save(); ctx.translate(pm.x, pm.y); ctx.rotate(ang);
        ctx.globalAlpha = 1; ctx.beginPath();
        ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-2, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
        ctx.restore();
        text("UNS ILLÉRI", pm.x - 8, pm.y - 30, 1, 12);
        text(Math.round(t * 100) + "% · ETA " + (leg.eta_ship || "?"), pm.x - 8, pm.y - 17, 0.75, 11);
        line([{ x: pm.x - 2, y: pm.y - 14 }, { x: pm.x, y: pm.y - 7 }], 0.6, 1);
        hits.push({ x: pm.x, y: pm.y, r: 12, kind: "ship" });
      });
    }
    // stars, far to near: stem down to the plane, a ring where it meets it
    var list = CH.systems.map(function (s) {
      return { s: s, p: project(s.pos, cam, scale), b: project([s.pos[0], 0, s.pos[2]], cam, scale) };
    }).sort(function (a, b) { return b.p.z - a.p.z; });
    var showAll = cam.zoom > 2.6;                     // filler stars are labelled when zoomed in close
    list.forEach(function (it) {
      // emphasis follows what the ship knows: a named system, or any class but F
      var s = it.s, p = it.p, b = it.b, sel = selSys === s.id;
      var notable = !!s.name || (s.classes || []).some(function (c) { return c !== "F"; });
      var a = notable ? 1 : 0.6, above = s.pos[1] >= 0;
      line([b, p], (notable ? 0.45 : 0.22) * (above ? 1 : 0.7), 1, above ? [] : [2, 2]);
      ctx.globalAlpha = notable ? 0.5 : 0.25;
      ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 4, 4 * Math.abs(Math.sin(cam.pitch)) + 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      var rad = starRadius(s.star) * (notable ? 1 : 0.8);
      dot(p.x, p.y, rad, a);
      if (s.star.companion) dot(p.x + rad + 3, p.y - 2, Math.max(1.2, rad * 0.55), a * 0.9);
      if (sel) brackets(p.x, p.y, rad, 1);
      if (notable || showAll || sel) {
        text(name(s), p.x + rad + 7, p.y - 6, notable ? 1 : 0.7, notable ? 13 : 11);
        var cls = s.classes ? "CLASS " + s.classes.join(", ") : "";
        if (cls && (notable || sel)) text(cls, p.x + rad + 7, p.y + 8, 0.55, 10);
      }
      hits.push({ x: p.x, y: p.y, r: Math.max(10, rad + 6), kind: "sys", id: s.id });
    });
    ctx.globalAlpha = 0.55;
    text("DRAG: ROTATE  ·  WHEEL / PINCH: ZOOM  ·  SELECT A STAR", 14, H - 14, 0.45, 11);
  }

  function orbitScale(sys) {
    var as = (sys.bodies || []).filter(function (b) { return b.kind !== "moon" && b.a; }).map(function (b) { return b.a; });
    if (sys.star.companion) as.push(sys.star.companion.sep);
    var lo = Math.min.apply(null, as.length ? as : [1]), hi = Math.max.apply(null, as.length ? as : [1]);
    var r0 = Math.min(W, H) * 0.09, r1 = Math.min(W, H) * 0.44;
    return function (a) {
      if (hi === lo) return (r0 + r1) / 2;
      return r0 + (r1 - r0) * (Math.log(a) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
    };
  }

  function angleOf(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
    return h / 997 * Math.PI * 2;
  }

  function sysProject(x, z, zoom) {
    var cy = Math.cos(scam.yaw), sy = Math.sin(scam.yaw), sp = Math.sin(scam.pitch);
    var x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    return { x: W / 2 + x1 * zoom, y: H / 2 + z1 * sp * zoom };
  }

  function bodyRadius(b) {
    if (b.kind === "moon") return 2.2;
    if (/giant/i.test(b.type)) return 6 + Math.min(4, Math.log10((b.mass || 50) / 20) * 2);
    return 3 + Math.min(2.5, (b.mass || 0.5) * 1.5);
  }

  function drawSystem() {
    var sys = SYS[selSys], col = colours();
    ctx.strokeStyle = ctx.fillStyle = col.ph;
    var R0 = orbitScale(sys), z = scam.zoom, R = function (a) { return R0(a) * z; };
    var star = sysProject(0, 0, 1);
    dot(star.x, star.y, starRadius(sys.star) * 1.8, 1);
    text(name(sys), star.x, star.y - starRadius(sys.star) * 1.8 - 12, 1, 14, "center");
    text(sys.star["class"] + " · " + sys.star.type, star.x, star.y + starRadius(sys.star) * 1.8 + 18, 0.6, 11, "center");
    hits.push({ x: star.x, y: star.y, r: 14, kind: "star" });
    // a binary's second star, on its orbit at its real separation (same scale as the planets)
    var comp = sys.star.companion;
    if (comp) {
      var cr = R(comp.sep), corbit = [];
      for (var ci = 0; ci <= 96; ci++) {
        var ca = ci / 96 * Math.PI * 2;
        corbit.push(sysProject(Math.cos(ca) * cr, Math.sin(ca) * cr, 1));
      }
      line(corbit, 0.35, 1, [6, 5]);
      var cp = sysProject(Math.cos(-0.7) * cr, Math.sin(-0.7) * cr, 1), crad = starRadius(comp) * 1.5;
      dot(cp.x, cp.y, crad, 1);
      text(name(sys) + " SECONDARY", cp.x, cp.y - crad - 10, 0.9, 12, "center");
      text(comp["class"] + " · " + comp.type, cp.x, cp.y + crad + 16, 0.55, 11, "center");
      if (selBody === "__companion") brackets(cp.x, cp.y, crad, 1);
      hits.push({ x: cp.x, y: cp.y, r: crad + 8, kind: "body", id: "__companion" });
    }
    var bodies = sys.bodies || [];
    if (!bodies.length) text(comp ? "NO PLANETS DETECTED" : "NO BODIES DETECTED", star.x, star.y + 70, 0.6, 12, "center");
    var place = {};
    bodies.filter(function (b) { return b.kind !== "moon"; }).forEach(function (b, idx) {
      var r = R(b.a), orbit = [];
      for (var i = 0; i <= 96; i++) {
        var a = i / 96 * Math.PI * 2;
        orbit.push(sysProject(Math.cos(a) * r, Math.sin(a) * r, 1));
      }
      if (b.kind === "belt") {
        line(orbit, b.est ? 0.4 : 0.6, 2, [1, 4]);
        var lp = sysProject(Math.cos(-0.6) * r, Math.sin(-0.6) * r, 1);
        text(bodyName(sys, b), lp.x + 6, lp.y, 0.6, 11);
        hits.push({ x: lp.x, y: lp.y, r: 12, kind: "body", id: b.id });
        if (selBody === b.id) brackets(lp.x, lp.y, 3, 1);
        return;
      }
      line(orbit, b.est ? 0.25 : 0.4, 1, b.est ? [3, 4] : []);
      // spread round the star by the golden angle, so neighbours never bunch on one side
      var ang = 0.9 + idx * 2.39996 + angleOf(sys.id + b.id) * 0.12, p = sysProject(Math.cos(ang) * r, Math.sin(ang) * r, 1);
      place[b.id] = p;
      var br = bodyRadius(b);
      ctx.fillStyle = col.bg; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, br + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col.ph;
      if (b.est) { ctx.globalAlpha = 0.9; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(p.x, p.y, br, 0, Math.PI * 2); ctx.stroke(); }
      else dot(p.x, p.y, br, 1);
      if (b.rings) { ctx.globalAlpha = 0.7; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, br * 2, br * 0.6, -0.3, 0, Math.PI * 2); ctx.stroke(); }
      text(b.id, p.x, p.y - br - 7, 1, 12, "center");
      if (selBody === b.id) brackets(p.x, p.y, br, 1);
      hits.push({ x: p.x, y: p.y, r: br + 8, kind: "body", id: b.id });
    });
    // moons round their planet
    var count = {};
    bodies.filter(function (b) { return b.kind === "moon"; }).forEach(function (b) {
      var p = place[b.parent];
      if (!p) return;
      var n = count[b.parent] = (count[b.parent] || 0) + 1, rr = 14 + n * 9;
      ctx.globalAlpha = 0.3; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rr, rr * Math.sin(scam.pitch), 0, 0, Math.PI * 2); ctx.stroke();
      var ang = angleOf(b.id) + n, mx = p.x + Math.cos(ang) * rr, my = p.y + Math.sin(ang) * rr * Math.sin(scam.pitch);
      dot(mx, my, 2.2, 1);
      text(b.id, mx + 5, my - 4, 0.8, 10);
      if (selBody === b.id) brackets(mx, my, 2, 1);
      hits.push({ x: mx, y: my, r: 9, kind: "body", id: b.id });
    });
    text("DRAG: TILT / TURN  ·  SELECT A BODY  ·  BACK: CLUSTER", 14, H - 14, 0.45, 11);
  }

  function draw() {
    pending = false;
    hits = [];
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    if (view === "cluster") drawCluster(); else drawSystem();
    ctx.globalAlpha = 1;
  }

  function redraw() { if (!pending) { pending = true; requestAnimationFrame(draw); } }

  function resize() {
    var r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    redraw();
  }

  /* ---------- cards ---------- */

  function row(k, v) { return v === undefined || v === null || v === "" ? "" : "<tr><th>" + esc(k) + "</th><td>" + v + "</td></tr>"; }

  function classLine(s) {
    var c = s.classes && s.classes.length ? "CLASS " + s.classes.join(", ") : "UNCLASSIFIED";
    return '<div class="ac-class">' + esc(c) + " · " + esc((s.survey || "Unsurveyed").toUpperCase()) + "</div>";
  }

  function travel(d) {
    var t = trip(d);
    return fmt(d, 2) + " LY · " + t.ship + " ship / " + t.union + " Union (at " + fmt(cruise(), cruise() < 0.99 ? 2 : 3) + " c)";
  }

  function systemCard(s) {
    var st = s.star, sp = shipPos(), h = "";
    h += '<div class="ac-kicker">' + (s.name ? esc(s.designation) + " · " : "") + "STAR SYSTEM</div>";
    h += '<h2 class="ac-title">' + esc(name(s)) + "</h2>" + classLine(s);
    if (s.faction) h += '<div class="ac-faction">' + esc(s.faction.name.toUpperCase()) + " · " + esc(s.faction.standing.toUpperCase()) + "</div>";
    h += '<table class="ac-table">';
    h += row("Star", esc(st["class"] + " · " + st.type));
    if (st.companion) h += row("Companion", esc(st.companion["class"] + " · " + st.companion.type + " · " + fmt(st.companion.sep, 1) + " AU"));
    h += row("Solar masses", fmt(st.mass, 2)) + row("Solar radius", fmt(st.radius, st.radius < 1 ? 3 : 1));
    h += row("Surface temp.", fmt(st.temp, 0) + " K") + row("Age", fmt(st.age, 1) + " billion yr") + row("Abs. magnitude", fmt(st.absmag, 1));
    if (sp) h += row("From the Illéri", esc(travel(dist(sp, s.pos))));
    h += "</table>";
    if (s.note) h += '<p class="ac-note">' + md(s.note) + "</p>";
    var bodies = (s.bodies || []).filter(function (b) { return b.kind !== "moon"; });
    if (bodies.length || st.companion) {
      h += '<div class="ac-sub">BODIES</div><ul class="ac-list">';
      if (st.companion) h += '<li><button class="ac-link" data-body="__companion">' + esc(name(s)) + " Secondary</button> " +
        '<span class="ac-dim">' + esc(st.companion.type) + "</span></li>";
      (s.bodies || []).forEach(function (b) {
        h += '<li><button class="ac-link" data-body="' + esc(b.id) + '">' + esc(bodyName(s, b)) + "</button> " +
          '<span class="ac-dim">' + esc(b.type) + "</span></li>";
      });
      h += "</ul>";
    }
    if (view === "cluster") h += '<button class="key key-small key-cream ac-open" data-open="1">SYSTEM MAP</button>';
    return h;
  }

  function bodyCard(s, b) {
    var h = '<div class="ac-kicker">' + esc(name(s)) + " · " + (b.kind === "moon" ? "MOON" : b.kind === "belt" ? "BELT" : "PLANET") + "</div>";
    h += '<h2 class="ac-title">' + esc(bodyName(s, b)) + "</h2>";
    var typeLine = b.faction ? b.faction.name + " · " + (b.role || "") + " · " + b.type : b.type;
    h += '<div class="ac-class">' + esc(typeLine.toUpperCase()) + "</div>";
    if (b.faction && b.faction.standing) h += '<div class="ac-faction">STANDING: ' + esc(b.faction.standing.toUpperCase()) + "</div>";
    if (b.est) h += '<div class="ac-est">REMOTE ESTIMATES · UNSURVEYED</div>';
    h += '<table class="ac-table">';
    if (b.a) h += row("Semi-major axis", fmt(b.a, 2) + " AU");
    if (b.a_km) h += row("Orbit", fmt(b.a_km, 0) + " km");
    if (b.period) h += row("Orbital period", b.period > 400 ? fmt(b.period / 365.25, 1) + " yr" : fmt(b.period, 1) + " days");
    if (b.ecc !== undefined) h += row("Eccentricity", fmt(b.ecc, 3));
    if (b.inc !== undefined) h += row("Inclination", fmt(b.inc, 1) + "°");
    if (b.rot !== undefined) h += row("Rotation", fmt(b.rot, 2) + " days" + (b.locked ? " (tidally locked)" : ""));
    else if (b.locked) h += row("Rotation", "Tidally locked");
    if (b.tilt !== undefined) h += row("Axial tilt", fmt(b.tilt, 1) + "°");
    if (b.mass !== undefined) h += row("Earth masses", (b.est ? "~" : "") + fmt(b.mass, b.mass < 1 ? 3 : 1));
    if (b.radius !== undefined) h += row("Radius", (b.est ? "~" : "") + fmt(b.radius, 0) + " km");
    if (b.g !== undefined) h += row("Surface gravity", (b.est ? "~" : "") + fmt(b.g, 2) + " G");
    if (b.temp !== undefined) h += row(/giant/i.test(b.type) ? "Temperature" : "Surface temp.", (b.est ? "~" : "") + fmt(b.temp, 0) + " K");
    if (b.pressure !== undefined) h += row("Surface pressure", fmt(b.pressure, 2) + " atm");
    h += row("Volcanism", b.volcanism ? esc(b.volcanism) : "");
    h += row("Atmosphere", b.atmos ? esc(b.atmos) : "");
    if (b.atmos_comp) h += row("Atmosphere composition", b.atmos_comp.map(function (m) { return esc(m[0]) + " " + fmt(m[1], 1) + "%"; }).join("<br>"));
    if (b.comp) h += row("Composition", "Rock " + b.comp.rock + "% · Metal " + b.comp.metal + "% · Ice " + b.comp.ice + "%");
    if (b.reserves) h += row("Reserves", esc(b.reserves));
    h += row("Rings", b.rings ? esc(b.rings) : "");
    if (b.landable !== undefined) h += row("Landable", b.landable ? "Yes" : "No");
    h += row("Terraforming", b.terraform ? esc(b.terraform) : "");
    h += "</table>";
    if (b.materials) {
      h += '<div class="ac-sub">MATERIALS</div><table class="ac-table ac-mats">';
      b.materials.forEach(function (m) { h += row(m[0], fmt(m[1], 1) + "%"); });
      h += "</table>";
    } else if (b.kind !== "belt" && !/giant/i.test(b.type)) {
      h += '<div class="ac-sub">MATERIALS</div><p class="ac-dim">Unsurveyed: requires a survey on site.</p>';
    }
    if (b.note) h += '<p class="ac-note">' + md(b.note) + "</p>";
    return h;
  }

  function companionCard(s) {
    var c = s.star.companion, h = '<div class="ac-kicker">' + esc(name(s)) + " · STAR</div>";
    h += '<h2 class="ac-title">' + esc(name(s)) + " Secondary</h2>" + classLine(s);
    h += '<table class="ac-table">' + row("Star", esc(c["class"] + " · " + c.type)) +
      row("Separation", fmt(c.sep, 1) + " AU from the primary") + "</table>";
    h += '<p class="ac-dim">Further data requires a survey on site.</p>';
    return h;
  }

  function routeCard() {
    var r = CH.route, h = '<div class="ac-kicker">ROUTE TRACKER</div><h2 class="ac-title">UNS Illéri</h2>';
    if (r.arrived) h += '<div class="ac-class">ARRIVED ' + esc(name(SYS[r.arrived.system]).toUpperCase()) + " · " + esc(r.arrived.date) + "</div>";
    h += '<table class="ac-table">';
    (r.legs || []).forEach(function (leg) {
      var a = SYS[leg.from], b = SYS[leg.to], d = dist(a.pos, b.pos);
      h += row("Leg", esc(name(a) + " → " + name(b)));
      h += row("Distance", fmt(d, 2) + " LY");
      h += row("Departed", esc(leg.departed || "")) + row("Progress", Math.round((leg.progress || 0) * 100) + "%");
      if (leg.speed) h += row("Cruise", fmt(leg.speed, 3) + " c");
      h += row("ETA (ship)", esc(leg.eta_ship || "")) + row("ETA (Union)", esc(leg.eta_union || ""));
      if (leg.note) h += row("Note", esc(leg.note));
    });
    if (r.now) h += row("Ship date", esc(r.now));
    h += "</table>";
    var v = cruise();
    h += '<p class="ac-dim">Travel times on this chart use the current cruise of ' + fmt(v, v < 0.99 ? 2 : 3) + " c: " +
      span(Math.sqrt(1 - v * v) / v) + " aboard and " + span(1 / v) + " Union per light year." +
      (v < 0.99 ? " The Illéri alone can make 0.995 c: about five weeks aboard per light year." : "") + "</p>";
    return h;
  }

  function showCard() {
    var h;
    if (selBody === "__companion" && selSys) h = companionCard(SYS[selSys]);
    else if (selBody && selSys) h = bodyCard(SYS[selSys], (SYS[selSys].bodies || []).filter(function (b) { return b.id === selBody; })[0]);
    else if (selSys === "__ship") h = routeCard();
    else if (selSys) h = systemCard(SYS[selSys]);
    else h = '<div class="ac-kicker">ASTROGATION</div><h2 class="ac-title">' + esc(CH.name || "Cluster") + "</h2>" +
      '<p class="ac-dim">' + CH.systems.length + " catalogued stars. Select a star for its survey record, or the Illéri for the route.</p>" +
      (CH.route ? '<button class="key key-small key-cream ac-open" data-ship="1">ROUTE TRACKER</button>' : "");
    panel.innerHTML = h;
    panel.scrollTop = 0;
  }

  panel.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.body) { if (view === "cluster") enterSystem(selSys); selBody = t.dataset.body; showCard(); redraw(); }
    else if (t.dataset.open) enterSystem(selSys);
    else if (t.dataset.ship) { selSys = "__ship"; showCard(); }
  });

  /* ---------- views ---------- */

  function enterSystem(id) {
    view = "system"; selSys = id; selBody = null;
    titleEl.textContent = "SYSTEM MAP // " + name(SYS[id]).toUpperCase();
    backKey.hidden = false;
    showCard(); redraw();
  }

  function toCluster() {
    view = "cluster"; selBody = null;
    titleEl.textContent = "ASTROGATION // " + (CH.name || "").toUpperCase();
    backKey.hidden = true;
    showCard(); redraw();
  }

  function pick(x, y) {
    var best = null, bd = 1e9;
    hits.forEach(function (h) {
      var d = Math.hypot(h.x - x, h.y - y);
      if (d < h.r && d < bd) { bd = d; best = h; }
    });
    return best;
  }

  function click(x, y) {
    var h = pick(x, y);
    if (view === "cluster") {
      if (!h) { selSys = null; }
      else if (h.kind === "ship") selSys = "__ship";
      else if (h.kind === "sys") {
        if (selSys === h.id && ((SYS[h.id].bodies || []).length || SYS[h.id].star.companion)) { enterSystem(h.id); return; }
        selSys = h.id;
      }
    } else {
      selBody = h && h.kind === "body" ? h.id : null;
    }
    if (window.Sound && Sound.toggle) Sound.toggle();
    showCard(); redraw();
  }

  /* ---------- input: drag to rotate, wheel / pinch to zoom, tap to select ---------- */

  var pointers = {}, dragStart = null, pinch = null;
  function camNow() { return view === "cluster" ? cam : scam; }
  canvas.addEventListener("pointerdown", function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 1) dragStart = { x: e.clientX, y: e.clientY, yaw: camNow().yaw, pitch: camNow().pitch, moved: false };
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: camNow().zoom };
      dragStart = null;
    }
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!pointers[e.pointerId]) {
      var r0 = canvas.getBoundingClientRect(), hv = pick(e.clientX - r0.left, e.clientY - r0.top);
      canvas.style.cursor = hv ? "pointer" : "grab";
      return;
    }
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var c = camNow(), ids = Object.keys(pointers);
    if (pinch && ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      c.zoom = Math.max(0.5, Math.min(6, pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      redraw();
    } else if (dragStart) {
      var dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragStart.moved = true;
      c.yaw = dragStart.yaw + dx * 0.008;
      // the cluster can be seen from above or below the plane; a system map only from above
      c.pitch = Math.max(view === "cluster" ? -1.5 : 0.25, Math.min(1.5, dragStart.pitch + dy * 0.006));
      canvas.style.cursor = "grabbing";
      redraw();
    }
  });
  function up(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    if (dragStart && !dragStart.moved) {
      var r = canvas.getBoundingClientRect();
      click(e.clientX - r.left, e.clientY - r.top);
    }
    if (!Object.keys(pointers).length) { dragStart = null; pinch = null; canvas.style.cursor = "grab"; }
  }
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var c = camNow();
    c.zoom = Math.max(0.5, Math.min(6, c.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    redraw();
  }, { passive: false });

  /* ---------- open / close ---------- */

  function open() {
    overlay.hidden = false;
    document.body.classList.add("modal-open");
    if (window.Sound && Sound.toggle) Sound.toggle();
    toCluster();
    resize();
    $("astro-close").focus();
  }
  function close() { overlay.hidden = true; document.body.classList.remove("modal-open"); }
  function press(el, fn) { el.addEventListener("click", function (e) { e.preventDefault(); fn(); }); }
  press(btn, open);
  press($("astro-close"), close);
  press(backKey, toCluster);
  press($("astro-reset"), function () {
    if (view === "cluster") { cam.yaw = -0.55; cam.pitch = 0.78; cam.zoom = 1.7; focus = centre.slice(); }
    else { scam.yaw = 0.3; scam.pitch = 1.0; scam.zoom = 1; }
    redraw();
  });
  // CENTRE: swing the view onto the selected star (or the Illéri) and zoom in, keeping the angle;
  // on a system map, back to the whole system at the current tilt
  press($("astro-centre"), function () {
    if (view === "cluster") {
      var target = selSys && SYS[selSys] ? SYS[selSys].pos : shipPos() || centre;
      focus = target.slice();
      cam.zoom = Math.max(cam.zoom, 3.2);
    } else {
      scam.zoom = 1;
    }
    redraw();
  });
  window.addEventListener("resize", function () { if (!overlay.hidden) resize(); });
  document.addEventListener("keydown", function (e) {
    if (overlay.hidden) return;
    if (e.key === "Tab") return;
    e.stopPropagation();
    if (e.key === "Escape") { if (view === "system") toCluster(); else close(); }
  }, true);
  // ?chart opens the chart; ?chart=lc01 a system's map; &body=B a body's card (GM previews, screenshots)
  var q = location.search.match(/[?&]chart(?:=(\w+))?/);
  if (q) {
    open();
    if (q[1] && SYS[q[1]]) {
      enterSystem(q[1]);
      var qb = location.search.match(/[?&]body=([\w%]+)/);
      if (qb) { selBody = decodeURIComponent(qb[1]); showCard(); redraw(); }
    }
  }
})();
