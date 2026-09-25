/* Field Receiver — handout viewer behaviour. Data comes from data.js (built by tools/build_handouts.py),
   sound from sound.js. */
(function () {
  "use strict";

  var DATA = window.RECEIVER_DATA || { config: {}, handouts: [] };
  var CFG = DATA.config || {};
  var ITEMS = DATA.handouts || [];               // chronological, oldest first
  var Sound = window.ReceiverSound;
  var TYPE_NAME = { comms: "TRANSMISSION", intel: "RECOVERED DATA", map: "CHART" };
  var TYPE_SHORT = { comms: "COMMS", intel: "INTEL", map: "CHART" };
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NOBOOT = /[?&]noboot\b/.test(location.search);  // skip start-up and print-out (GM previews)

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- per-viewer storage (may be unavailable) ---------- */

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  var seen = {};
  store.get("receiver.seen", []).forEach(function (id) { seen[id] = true; });
  function markSeen(id) {
    if (seen[id]) return;
    seen[id] = true;
    store.set("receiver.seen", Object.keys(seen));
  }

  /* ---------- physical keys ---------- */

  // Mouse and pen act on PRESS, like a real key. Touch acts on tap (click), so that scrolling
  // the log with a finger doesn't fire keys. Keyboard activation also arrives as a click.
  function pressable(el, action) {
    var pressedAt = -1e9;
    el.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch" || e.button !== 0 || el.disabled) return;
      pressedAt = performance.now();
      el.classList.add("is-down");
      Sound.down();
      action();
    });
    function release() {
      if (!el.classList.contains("is-down")) return;
      el.classList.remove("is-down");
      Sound.up();
    }
    el.addEventListener("pointerup", release);
    el.addEventListener("pointerleave", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("click", function () {
      if (performance.now() - pressedAt < 1000) return;   // already handled on press
      el.classList.add("is-down");
      Sound.down();
      setTimeout(function () { el.classList.remove("is-down"); Sound.up(); }, 85);
      action();
    });
  }

  // Knob and toggle: same press-or-tap rule as keys, with their own sounds and no press animation.
  function onPress(el, action) {
    var pressedAt = -1e9;
    el.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch" || e.button !== 0) return;
      pressedAt = performance.now();
      action();
    });
    el.addEventListener("click", function () {
      if (performance.now() - pressedAt < 1000) return;
      action();
    });
  }

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function pad3(n) { return ("00" + n).slice(-3); }
  function byId(id) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i];
    return null;
  }

  /* ---------- state ---------- */

  var filter = "all";
  var current = null;
  var typing = null;

  function filtered() {
    return ITEMS.filter(function (h) { return filter === "all" || h.type === filter; });
  }

  /* ---------- header, clock, ticker ---------- */

  if (CFG.title) { $("brand-title").textContent = CFG.title; document.title = CFG.title; }
  if (CFG.model) $("brand-model").textContent = CFG.model;
  if (CFG.station) $("brand-station").textContent = CFG.station;

  var clockEl = $("clock");
  function tickClock() {
    var d = new Date();
    clockEl.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(function (n) { return ("0" + n).slice(-2); }).join(":");
  }
  tickClock();
  setInterval(tickClock, 1000);

  var tickerText = "";
  function updateTicker() {
    var unread = ITEMS.filter(function (h) { return !seen[h.id]; }).length;
    var parts = [
      ITEMS.length ? "CARRIER LOCKED" : "NO CARRIER",
      ITEMS.length + " SIGNALS IN LOG",
      unread + " UNREAD"
    ];
    if (CFG.ticker) parts.push(CFG.ticker);
    var line = parts.join("  ···  ") + "  ···  ";
    if (line + line !== tickerText) {
      tickerText = line + line;
      $("ticker").textContent = tickerText;
    }
  }

  /* ---------- signal gauge ---------- */

  (function drawTicks() {
    var html = "";
    for (var v = 0; v <= 100; v += 5) {
      var a = (-70 + v * 1.4) * Math.PI / 180;
      var major = v % 25 === 0, r1 = 70, r2 = major ? 60 : 65;
      var x1 = 80 + r1 * Math.sin(a), y1 = 92 - r1 * Math.cos(a);
      var x2 = 80 + r2 * Math.sin(a), y2 = 92 - r2 * Math.cos(a);
      html += '<line class="gauge-tick' + (v < 25 ? " red" : "") + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
        '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke-width="' + (major ? 1.8 : 1) + '"/>';
      if (major) {
        var xn = 80 + 52 * Math.sin(a), yn = 92 - 52 * Math.cos(a) + 3;
        html += '<text class="gauge-num" x="' + xn.toFixed(1) + '" y="' + yn.toFixed(1) + '">' + v + "</text>";
      }
    }
    $("gauge-ticks").innerHTML = html;
  })();

  // The needle's travel (CSS transition) and tremble (CSS animation, stronger on weak signals) both
  // run on the compositor. No script timers: they forced redraws that made the ticker stutter.
  var needle = $("needle");
  function setSignal(v) {
    needle.style.setProperty("--a", (-70 + v * 1.4) + "deg");
    needle.classList.toggle("tr-hi", v < 40);
    needle.classList.toggle("tr-mid", v >= 40 && v < 75);
  }

  /* ---------- static burst ---------- */

  var staticCanvas = $("static"), sctx = staticCanvas.getContext("2d");
  var staticImg = sctx.createImageData(staticCanvas.width, staticCanvas.height);
  var staticUntil = 0;
  function staticBurst(ms) {
    Sound.static();
    if (REDUCED) return;
    var running = performance.now() < staticUntil;
    staticUntil = performance.now() + ms;
    if (running) return;
    staticCanvas.classList.add("is-on");
    (function frame() {
      var d = staticImg.data;
      for (var i = 0; i < d.length; i += 4) {
        var v = Math.random() * 255 | 0;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      sctx.putImageData(staticImg, 0, 0);
      if (performance.now() < staticUntil) requestAnimationFrame(frame);
      else staticCanvas.classList.remove("is-on");
    })();
  }

  /* ---------- typewriter ---------- */

  var skipKey = $("btn-skip");
  function typeOut(root, onDone) {
    var nodes = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, total = 0;
    while ((n = walker.nextNode())) {
      nodes.push({ node: n, text: n.nodeValue });
      total += n.nodeValue.length;
      n.nodeValue = "";
    }
    var cps = Math.max(260, total / 3.5), idx = 0, pos = 0, last = performance.now(), budget = 0, done = false;
    function finish() {
      if (done) return;
      done = true;
      for (var i = idx; i < nodes.length; i++) nodes[i].node.nodeValue = nodes[i].text;
      typing = null;
      skipKey.disabled = true;
      if (onDone) onDone();
    }
    function frame(now) {
      if (done) return;
      budget += (now - last) / 1000 * cps;
      last = now;
      var chars = Math.floor(budget);
      budget -= chars;
      if (chars > 0) Sound.tty();
      while (chars > 0 && idx < nodes.length) {
        var item = nodes[idx], take = Math.min(chars, item.text.length - pos);
        pos += take; chars -= take;
        item.node.nodeValue = item.text.slice(0, pos);
        if (pos >= item.text.length) { idx++; pos = 0; }
      }
      if (idx >= nodes.length) finish();
      else requestAnimationFrame(frame);
    }
    typing = { finish: finish };
    skipKey.disabled = false;
    requestAnimationFrame(frame);
  }

  /* ---------- corrupted text ---------- */

  // Runs only while the screen shows corrupted text (see render()).
  var GLYPHS = "#%&@$/\\|<>?!=+*▓▒░";
  var screen = $("screen");
  var corruptTimer = null, corruptSpans = [];
  function updateCorruption() {
    corruptSpans = screen.querySelectorAll(".corrupt");
    if (corruptSpans.length && !corruptTimer && !REDUCED) corruptTimer = setInterval(glitch, 140);
    if (!corruptSpans.length && corruptTimer) { clearInterval(corruptTimer); corruptTimer = null; }
  }
  function glitch() {
    if (typing || document.hidden) return;
    for (var i = 0; i < corruptSpans.length; i++) {
      var s = corruptSpans[i];
      if (s.dataset.orig === undefined) s.dataset.orig = s.textContent;
      var orig = s.dataset.orig;
      if (Math.random() < 0.45) {
        var chars = orig.split(""), k = 1 + (Math.random() * 3 | 0);
        while (k--) {
          var p = Math.random() * chars.length | 0;
          if (chars[p] !== " ") chars[p] = GLYPHS[Math.random() * GLYPHS.length | 0];
        }
        s.textContent = chars.join("");
      } else if (s.textContent !== orig) {
        s.textContent = orig;
      }
    }
  }

  /* ---------- screen rendering ---------- */

  function render(item) {
    var head = TYPE_NAME[item.type] + " " + esc(item.id);
    var meta = "";
    if (item.from) meta += "<dt>FROM</dt><dd>" + esc(item.from) + "</dd>";
    if (item.date) meta += "<dt>DATE</dt><dd>" + esc(item.date) + "</dd>";
    meta += "<dt>SUBJ</dt><dd>" + esc(item.title) + "</dd>";
    meta += "<dt>SIGNAL</dt><dd>" + esc(item.signal) + "%</dd>";
    var chart = "";
    if (item.type === "map" && item.image) {
      chart = '<figure class="scr-chart" data-src="' + esc(item.image) + '"><img src="' + esc(item.image) +
        '" alt="' + esc(item.title) + '"><figcaption class="scr-map-hint">[ PRESS CHART TO MAGNIFY ]</figcaption></figure>';
    }
    screen.innerHTML =
      '<div class="scr-head">▌' + head + "</div>" +
      '<dl class="scr-meta">' + meta + "</dl>" +
      chart +
      '<div class="scr-body">' + item.html + "</div>" +
      '<div class="scr-end">— END OF ' + TYPE_NAME[item.type] + " —</div>";
    screen.scrollTop = 0;
    updateCorruption();
  }

  function idle(lines) {
    if (typing) typing.finish();
    screen.innerHTML = lines.map(function (l) { return '<div class="boot-line">' + (l || " ") + "</div>"; }).join("") +
      '<div class="boot-line"><span class="cursor"></span></div>';
    updateCorruption();
  }

  function show(id, opts) {
    opts = opts || {};
    var item = byId(id);
    if (!item) return;
    if (typing) typing.finish();
    var firstTime = !seen[id];
    current = id;
    markSeen(id);
    setSignal(item.signal);
    staticBurst(opts.quiet ? 110 : 190);
    render(item);
    if (firstTime && !REDUCED && !NOBOOT && !opts.instant) typeOut(screen);
    try { history.replaceState(null, "", location.search + "#" + encodeURIComponent(id)); } catch (e) { /* file:// may refuse */ }
    markList();
  }

  /* ---------- log list + controls ---------- */

  // The list is rebuilt only when the channel changes. Selecting a signal just updates classes,
  // so the key under the cursor is never replaced mid-press.
  var logBox = $("log-list"), logKeys = {}, filterKeys = document.querySelectorAll(".channel-keys .key");

  function buildList() {
    var list = filtered();
    logBox.innerHTML = "";
    logKeys = {};
    if (!list.length) {
      logBox.innerHTML = '<div class="log-empty">' + (ITEMS.length ? "NO TRAFFIC ON THIS CHANNEL" : "LOG EMPTY") + "</div>";
    }
    list.slice().reverse().forEach(function (h) {
      var b = document.createElement("button");
      b.className = "key log-key";
      b.innerHTML =
        '<span class="lamp"></span>' +
        '<span class="log-meta"><span>' + esc(h.id) + '</span><span class="log-type">' + TYPE_SHORT[h.type] + "</span>" +
        (h.date ? "<span>" + esc(h.date) + "</span>" : "") + "</span>" +
        '<span class="log-title">' + esc(h.title) + "</span>" +
        '<span class="log-from">' + esc(h.from || "UNKNOWN SOURCE") + "</span>";
      pressable(b, function () { if (h.id !== current) show(h.id); });
      logBox.appendChild(b);
      logKeys[h.id] = b;
    });
    markList();
  }

  function markList() {
    Object.keys(logKeys).forEach(function (id) {
      var b = logKeys[id], on = id === current, lamp = b.firstChild;
      b.classList.toggle("is-latched", on);
      b.setAttribute("aria-current", on ? "true" : "false");
      lamp.className = "lamp" + (on ? " lamp-green is-on" : (!seen[id] ? " is-on" : ""));
    });
    for (var i = 0; i < filterKeys.length; i++) {
      var sel = filterKeys[i].dataset.filter === filter;
      filterKeys[i].classList.toggle("is-latched", sel);
      filterKeys[i].setAttribute("aria-checked", sel ? "true" : "false");
    }
    var list = filtered(), pos = -1;
    for (var j = 0; j < list.length; j++) if (list[j].id === current) pos = j;
    $("counter").textContent = pos < 0 ? "---/" + pad3(list.length) : pad3(pos + 1) + "/" + pad3(list.length);
    $("btn-older").disabled = pos <= 0;
    $("btn-newer").disabled = pos < 0 || pos >= list.length - 1;
    updateTicker();
  }

  function step(dir) {
    var list = filtered(), pos = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === current) pos = i;
    var next = list[pos + dir];
    if (next) show(next.id);
  }

  Array.prototype.forEach.call(filterKeys, function (k) {
    pressable(k, function () {
      if (filter === k.dataset.filter) return;
      filter = k.dataset.filter;
      var list = filtered();
      var inList = list.some(function (h) { return h.id === current; });
      buildList();
      if (!inList && list.length) show(list[list.length - 1].id, { quiet: true });
      else if (!list.length) {
        current = null;
        setSignal(0);
        staticBurst(140);
        idle(["TUNING ...", "", "NO TRAFFIC ON THIS CHANNEL."]);
        markList();
      }
    });
  });
  pressable($("btn-older"), function () { step(-1); });
  pressable($("btn-newer"), function () { step(1); });
  pressable(skipKey, function () { if (typing) typing.finish(); });
  skipKey.disabled = true;

  screen.addEventListener("click", function (e) {
    if (typing) { typing.finish(); return; }
    var fig = e.target.closest && e.target.closest(".scr-chart");
    if (fig) openLoupe(fig.getAttribute("data-src"));
  });

  /* ---------- phosphor knob ---------- */

  var PHOSPHORS = [["", -40], ["ph-green", 0], ["ph-white", 40]];
  var phosphor = Math.min(2, Math.max(0, store.get("receiver.phosphor", 0) | 0));
  function applyPhosphor() {
    var crt = $("crt");
    crt.classList.remove("ph-green", "ph-white");
    if (PHOSPHORS[phosphor][0]) crt.classList.add(PHOSPHORS[phosphor][0]);
    $("knob").style.setProperty("--angle", PHOSPHORS[phosphor][1] + "deg");
  }
  applyPhosphor();
  onPress($("knob"), turnKnob);
  function turnKnob() {
    phosphor = (phosphor + 1) % PHOSPHORS.length;
    store.set("receiver.phosphor", phosphor);
    Sound.detent();
    applyPhosphor();
  }

  /* ---------- sound toggle ---------- */

  var toggle = $("toggle-sound");
  function applySound() { toggle.setAttribute("aria-checked", Sound.isOn() ? "true" : "false"); }
  applySound();
  function flipToggle() {
    if (Sound.isOn()) { Sound.toggle(); Sound.setOn(false); }
    else { Sound.setOn(true); Sound.toggle(); }
    applySound();
  }
  onPress(toggle, flipToggle);

  /* ---------- chart viewer ---------- */

  var loupe = $("loupe"), view = $("loupe-view"), limg = $("loupe-img"), zoom = 1;
  function setZoom(z, keepCenter) {
    if (!limg.naturalWidth) return;
    var cx = view.scrollLeft + view.clientWidth / 2, cy = view.scrollTop + view.clientHeight / 2;
    var old = zoom;
    zoom = Math.max(0.1, Math.min(6, z));
    var ratio = zoom / old;
    limg.style.width = Math.round(limg.naturalWidth * zoom) + "px";
    if (keepCenter) {
      view.scrollLeft = cx * ratio - view.clientWidth / 2;
      view.scrollTop = cy * ratio - view.clientHeight / 2;
    }
  }
  function fitZoom() {
    return Math.min(view.clientWidth / limg.naturalWidth, view.clientHeight / limg.naturalHeight, 1);
  }
  function openLoupe(src) {
    loupe.hidden = false;
    Sound.toggle();
    limg.onload = function () { zoom = fitZoom(); limg.style.width = Math.round(limg.naturalWidth * zoom) + "px"; };
    limg.src = src;
    $("loupe-close").focus();
  }
  function closeLoupe() { loupe.hidden = true; screen.focus(); }
  pressable($("zoom-in"), function () { setZoom(zoom * 1.25, true); });
  pressable($("zoom-out"), function () { setZoom(zoom / 1.25, true); });
  pressable($("loupe-close"), closeLoupe);
  loupe.addEventListener("click", function (e) { if (e.target === loupe) closeLoupe(); });
  view.addEventListener("wheel", function (e) {
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), true);
  }, { passive: false });
  var drag = null;
  view.addEventListener("pointerdown", function (e) {
    drag = { x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop };
    view.setPointerCapture(e.pointerId);
    view.classList.add("is-dragging");
  });
  view.addEventListener("pointermove", function (e) {
    if (!drag) return;
    view.scrollLeft = drag.sl - (e.clientX - drag.x);
    view.scrollTop = drag.st - (e.clientY - drag.y);
  });
  function endDrag() { drag = null; view.classList.remove("is-dragging"); }
  view.addEventListener("pointerup", endDrag);
  view.addEventListener("pointercancel", endDrag);

  /* ---------- keyboard ---------- */

  document.addEventListener("keydown", function (e) {
    if (!loupe.hidden) {
      if (e.key === "Escape") closeLoupe();
      return;
    }
    if (typing && (e.key === " " || e.key === "Enter" || e.key === "Escape") && document.activeElement === screen) {
      e.preventDefault();
      typing.finish();
      return;
    }
    if (e.target && e.target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
  });

  window.addEventListener("hashchange", function () {
    var id = decodeURIComponent(location.hash.slice(1));
    if (id && id !== current && byId(id)) show(id);
  });

  /* ---------- boot ---------- */

  function pickStart() {
    var fromHash = decodeURIComponent(location.hash.slice(1));
    if (fromHash && byId(fromHash)) return fromHash;
    for (var i = ITEMS.length - 1; i >= 0; i--) if (!seen[ITEMS[i].id]) return ITEMS[i].id;
    return ITEMS.length ? ITEMS[ITEMS.length - 1].id : null;
  }

  function boot() {
    buildList();
    setSignal(0);
    var unread = ITEMS.filter(function (h) { return !seen[h.id]; }).length;
    var lines = (CFG.boot || ["SELF TEST .............. OK", "PHOSPHOR WARM-UP ....... OK"]).map(esc);
    lines.push(ITEMS.length ? "CARRIER SEARCH ......... LOCKED" : "CARRIER SEARCH ......... NO SIGNAL");
    lines.push("");
    lines.push(ITEMS.length ? ITEMS.length + " SIGNALS IN LOG — " + unread + " UNREAD" : "AWAITING TRANSMISSION.");
    var start = pickStart();
    var booted = NOBOOT;
    try { booted = booted || sessionStorage.getItem("receiver.booted") === "1"; sessionStorage.setItem("receiver.booted", "1"); } catch (e) { /* ignore */ }

    if (booted && start) { show(start, { quiet: true }); return; }
    idle(lines);
    if (REDUCED || NOBOOT) { if (start) show(start, { instant: true }); return; }
    typeOut(screen, function () {
      if (start) setTimeout(function () { if (!current) show(start); }, 700);
    });
  }

  boot();
})();
