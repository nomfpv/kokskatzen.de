/* FOG KIT — behaviour shared by all Kokskatzen sites.
   Site switch (set before this file loads):
     window.FOG = { season: "auto" | "on" | "off", options: true|false, site: "name" }
   season "auto" turns the December layer on from 1 to 26 December.
   Per-device override: the Extra Options menu, or the URL
     ?season=xmas   ?season=fog   ?season=auto     (remembered on this device)
     ?noise=on|low|off
   Everything here fails soft: no storage, no dialog element, no problem. */
(function () {
  "use strict";
  if (window.Fog && window.Fog.v) return;
  var cfg = window.FOG || {};
  var root = document.documentElement;
  var listeners = [];

  function get(k) { try { return localStorage.getItem("fog." + k); } catch (e) { return null; } }
  function set(k, v) { try { v == null ? localStorage.removeItem("fog." + k) : localStorage.setItem("fog." + k, v); } catch (e) {} }

  // URL parameters set the per-device override, so a preview link sticks
  try {
    var q = new URLSearchParams(location.search);
    var s = q.get("season"), n = q.get("noise");
    if (s === "xmas" || s === "fog") set("season", s); else if (s === "auto") set("season", null);
    if (n === "on" || n === "low" || n === "off") set("noise", n);
  } catch (e) {}

  var reducedMq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  function inDecember(d) { d = d || new Date(); return d.getMonth() === 11 && d.getDate() >= 1 && d.getDate() <= 26; }
  function season() {
    var o = get("season");
    if (o === "xmas" || o === "fog") return o;
    if (cfg.season === "on") return "xmas";
    if (cfg.season === "off") return "fog";
    return inDecember() ? "xmas" : "fog";
  }
  function noise() {
    var o = get("noise");
    if (o === "on" || o === "low" || o === "off") return o;
    return reducedMq.matches ? "low" : "on";
  }
  function apply() {
    root.setAttribute("data-fog-season", season());
    root.setAttribute("data-fog-noise", noise());
    if (!root.hasAttribute("data-fog-world")) root.setAttribute("data-fog-world", "fog");
    listeners.forEach(function (f) { try { f(Fog); } catch (e) {} });
  }

  var Fog = window.Fog = {
    v: 1,
    get season() { return season(); },
    get noise() { return noise(); },
    get xmas() { return season() === "xmas"; },
    /* true when things may animate */
    get moving() { return noise() === "on" && !document.hidden; },
    setSeason: function (v) { set("season", v === "auto" ? null : v); apply(); },
    setNoise: function (v) { set("noise", v); apply(); },
    seasonSetting: function () { return get("season") || "auto"; },
    onChange: function (f) { listeners.push(f); },
    /* Otherworld: only when something is actually wrong */
    world: function (w) { root.setAttribute("data-fog-world", w === "other" ? "other" : "fog"); listeners.forEach(function (f) { try { f(Fog); } catch (e) {} }); },

    /* "There is a ... here. Will you take it?  Yes / No" */
    confirm: function (text, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        if (!window.HTMLDialogElement) { resolve(window.confirm(text)); return; }
        var d = document.createElement("dialog");
        d.className = "fg-dialog";
        var b = document.createElement("div"); b.className = "fg-dialog__body"; b.textContent = text;
        if (opts.note) { var sm = document.createElement("small"); sm.textContent = opts.note; b.appendChild(sm); }
        var o = document.createElement("div"); o.className = "fg-dialog__opts";
        var yes = document.createElement("button"); yes.className = "fg-opt"; yes.type = "button"; yes.textContent = opts.yes || "Yes";
        var no = document.createElement("button"); no.className = "fg-opt"; no.type = "button"; no.textContent = opts.no || "No";
        o.appendChild(yes); o.appendChild(no); d.appendChild(b); d.appendChild(o);
        var done = function (v) { try { d.close(); } catch (e) {} d.remove(); resolve(v); };
        yes.onclick = function () { done(true); }; no.onclick = function () { done(false); };
        d.addEventListener("cancel", function (e) { e.preventDefault(); done(false); });
        d.addEventListener("click", function (e) { if (e.target === d) done(false); });
        d.addEventListener("keydown", function (e) {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") { (document.activeElement === yes ? no : yes).focus(); e.preventDefault(); }
        });
        document.body.appendChild(d); d.showModal(); yes.focus();
      });
    },
    /* item prompt wording; in December things are presents */
    pickup: function (thing, opts) {
      var t = Fog.xmas ? "There is a present here: " + thing + ". Will you take it?" : "There is " + thing + " here. Will you take it?";
      return Fog.confirm(t, opts);
    },

    toast: function (text, kind, ms) {
      var box = document.querySelector(".fg-toasts");
      if (!box) { box = document.createElement("div"); box.className = "fg-toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
      var t = document.createElement("div"); t.className = "fg-toast" + (kind === "bad" ? " fg-toast--bad" : ""); t.textContent = text;
      box.appendChild(t);
      setTimeout(function () { t.remove(); }, ms || 4200);
      return t;
    },

    /* a radio searching for a station */
    radio: function (label) {
      var r = document.createElement("div"); r.className = "fg-radio"; r.setAttribute("role", "status");
      var d = document.createElement("div"); d.className = "fg-radio__dial"; r.appendChild(d);
      var l = document.createElement("span"); l.textContent = label || "Searching for a signal"; r.appendChild(l);
      return r;
    },

    /* The Extra Options menu. mount: element to put the opener in (optional). */
    options: function (mount) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = mount ? "fg-link" : "fg-options-btn"; btn.textContent = "Extra options";
      btn.setAttribute("aria-haspopup", "dialog");
      btn.onclick = openOptions;
      (mount || document.body).appendChild(btn);
      return btn;
    },
    openOptions: openOptions
  };

  function openOptions() {
    if (!window.HTMLDialogElement) return;
    var old = document.querySelector("dialog.fg-options"); if (old) old.remove();
    var d = document.createElement("dialog"); d.className = "fg-options";
    d.innerHTML = '<h2>Extra options</h2>';
    function row(label, vals, cur, on) {
      var r = document.createElement("div"); r.className = "fg-options__row";
      var s = document.createElement("span"); s.textContent = label; r.appendChild(s);
      var g = document.createElement("div"); g.className = "fg-options__vals"; g.setAttribute("role", "group"); g.setAttribute("aria-label", label);
      vals.forEach(function (v) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = v[1]; b.setAttribute("aria-pressed", String(v[0] === cur()));
        b.onclick = function () { on(v[0]); [].forEach.call(g.children, function (c, i) { c.setAttribute("aria-pressed", String(vals[i][0] === cur())); }); };
        g.appendChild(b);
      });
      r.appendChild(g); d.appendChild(r);
    }
    row("Noise Effect", [["on", "On"], ["low", "Low"], ["off", "Off"]], noise, Fog.setNoise);
    row("Season", [["auto", "Auto"], ["fog", "Fog"], ["xmas", "December"]], Fog.seasonSetting, Fog.setSeason);
    var p = document.createElement("p"); p.className = "fg-options__note"; p.textContent = "Remembered on this device."; d.appendChild(p);
    var c = document.createElement("button"); c.type = "button"; c.className = "fg-btn fg-options__close"; c.textContent = "Return"; c.onclick = function () { d.close(); d.remove(); };
    d.appendChild(c);
    d.addEventListener("click", function (e) { if (e.target === d) { d.close(); d.remove(); } });
    d.addEventListener("close", function () { d.remove(); });
    document.body.appendChild(d); d.showModal();
  }

  /* ---------------------------------------------------------------- snow
     In SH1 it snows out of season. Drawn at low resolution into the
     backdrop, behind the content. Fog.snow(canvas) returns a stop(). */
  Fog.snow = function (canvas, opt) {
    opt = opt || {};
    var cx = canvas.getContext("2d"), W = 0, H = 0, flakes = [], raf = 0, last = 0, px = opt.pixel || 3;
    function size() {
      W = Math.max(1, Math.round(canvas.clientWidth / px)); H = Math.max(1, Math.round(canvas.clientHeight / px));
      canvas.width = W; canvas.height = H;
      var n = Math.min(opt.max || 260, Math.round(W * H / 900));
      flakes = [];
      for (var i = 0; i < n; i++) flakes.push({ x: Math.random() * W, y: Math.random() * H, z: .35 + Math.random() * .65, p: Math.random() * 6.28 });
    }
    function draw(dt, t) {
      cx.clearRect(0, 0, W, H);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.y += (9 + 22 * f.z) * dt; f.x += Math.sin(t * .6 + f.p) * 5 * dt * f.z - 3 * dt;
        if (f.y > H) { f.y = -2; f.x = Math.random() * W; }
        if (f.x < -2) f.x = W + 1;
        cx.fillStyle = "rgba(226,229,231," + (0.25 + f.z * .6).toFixed(2) + ")";
        var s = f.z > .8 ? 2 : 1;
        cx.fillRect(f.x | 0, f.y | 0, s, s);
      }
    }
    function loop(now) {
      raf = 0;
      if (!Fog.xmas || noise() === "off") { cx.clearRect(0, 0, W, H); return; }
      var dt = Math.min(.06, (now - last) / 1000 || 0); last = now;
      draw(dt, now / 1000);
      if (noise() === "on" && !document.hidden) raf = requestAnimationFrame(loop);
    }
    function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
    size(); kick();
    var rt; addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { size(); kick(); }, 150); });
    document.addEventListener("visibilitychange", kick);
    Fog.onChange(kick);
    return function () { cancelAnimationFrame(raf); raf = -1; cx.clearRect(0, 0, W, H); };
  };

  apply();
  if (reducedMq.addEventListener) reducedMq.addEventListener("change", apply);
  // re-check the date around midnight without a reload
  setInterval(function () { if (root.getAttribute("data-fog-season") !== season()) apply(); }, 600000);
  function ready() { if (cfg.options !== false && !document.querySelector(".fg-options-btn,[data-fog-options]")) Fog.options();
    var m = document.querySelector("[data-fog-options]"); if (m && !m.firstChild) Fog.options(m); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
})();
