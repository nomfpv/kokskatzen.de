/* FOG3D — small real-time scenes rendered the way a PS1/PS2 would:
   low-resolution target scaled up, vertex snapping (wobble), affine texture
   warping, 15-bit colour with ordered dithering, distance fog, a chest
   flashlight that follows the pointer. No libraries, no ripped assets:
   every texture is painted in code, every model is built from boxes.

   <canvas class="fg-scene" data-fog-scene="road|signal|globe"
           style="background-image:url(still.png)"></canvas>
   Auto-mounts. Without WebGL the still stays. Honours the Noise Effect
   option (window.Fog), prefers-reduced-motion and hidden tabs.            */
(function () {
  "use strict";
  var TILE = 64, TN = 8, ATLAS = TILE * TN;

  // ------------------------------------------------------------------ math
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function persp(fovy, asp, n, f, shift, shiftY) { var t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[8] = -(shift || 0); o[9] = -(shiftY || 0); o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function lookAt(e, t, up) { var f = norm(sub(t, e)), s = norm(cross(f, up)), u = cross(s, f);
    return new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -(s[0] * e[0] + s[1] * e[1] + s[2] * e[2]), -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]), (f[0] * e[0] + f[1] * e[1] + f[2] * e[2]), 1]); }
  function modelM(x, y, z, ry, s) { var c = Math.cos(ry), n = Math.sin(ry); s = s || 1; return new Float32Array([c * s, 0, -n * s, 0, 0, s, 0, 0, n * s, 0, c * s, 0, x, y, z, 1]); }
  function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function mix3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  // tileable value noise
  function vnoise(seed, period) { var r = rng(seed), g = []; for (var i = 0; i < period * period; i++) g.push(r());
    return function (x, y) { var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      var a = function (i, j) { return g[(((j % period) + period) % period) * period + (((i % period) + period) % period)]; };
      return mix(mix(a(xi, yi), a(xi + 1, yi), fx), mix(a(xi, yi + 1), a(xi + 1, yi + 1), fx), fy); }; }

  // ------------------------------------------------------------- textures
  var T = { WHITE: 0, GRASS: 1, PATH: 2, WOOD: 3, STONE: 4, CLOTH: 5, SMILE: 6, RUST: 7, SIGN0: 8, SIGN1: 9, SIGN2: 10, SMOKE1: 11, SMOKE2: 12, DOT: 13, WIN: 14, WINLIT: 15, IRON: 16, CANVAS: 17, BARK: 18, GIFT: 19, PAVE: 20 };
  function buildAtlas(signText) {
    var cv = document.createElement("canvas"); cv.width = cv.height = ATLAS;
    var cx = cv.getContext("2d");
    function px(i, f) { var id = cx.createImageData(TILE, TILE), d = id.data; for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) { var c = f(x, y), o = (y * TILE + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c.length > 3 ? c[3] : 255; } cx.putImageData(id, (i % TN) * TILE, (i / TN | 0) * TILE); }
    function draw(i, f) { cx.save(); cx.translate((i % TN) * TILE, (i / TN | 0) * TILE); cx.beginPath(); cx.rect(0, 0, TILE, TILE); cx.clip(); f(cx); cx.restore(); }
    var g = function (v) { v = clamp(v, 0, 255) | 0; return [v, v, v]; };
    var r = rng(7), n1 = vnoise(11, 8), n2 = vnoise(12, 16);
    px(T.WHITE, function () { return [255, 255, 255]; });
    px(T.GRASS, function (x, y) { return g(120 + n1(x / 8, y / 8) * 70 + n2(x / 4, y / 4) * 40 + r() * 34); });
    px(T.PATH, function (x, y) { var v = 105 + n1(x / 8 + 3, y / 8) * 60 + r() * 30; var cxs = [[14, 12, 9], [44, 20, 11], [26, 44, 12], [54, 52, 7], [6, 50, 6]]; for (var k = 0; k < cxs.length; k++) { var dx = x - cxs[k][0], dy = (y - cxs[k][1]) * 1.5; if (dx * dx + dy * dy < cxs[k][2] * cxs[k][2]) v = 170 + r() * 40; } return g(v); });
    px(T.PAVE, function (x, y) { var row = y >> 4, bx = (x + (row & 1) * 16) % 32; var edge = (y % 16 === 0) || bx === 0; return g(edge ? 70 : 130 + n1(x / 8, y / 8 + 5) * 50 + r() * 26); });
    px(T.WOOD, function (x, y) { return g(140 + Math.sin(x * 1.3 + n1(x / 8, y / 16) * 6) * 28 + n2(x / 2, y / 16) * 50 + r() * 16 - ((x % 16) === 0 ? 60 : 0)); });
    px(T.STONE, function (x, y) { var row = y / 12 | 0, off = (row & 1) * 11, bx = (x + off) % 22; var edge = (y % 12) < 1 || bx < 1; var tone = n2((((x + off) / 22) | 0) * 3.1 + .5, row * 2.7 + .5); return g(edge ? 60 : 120 + tone * 80 + r() * 28); });
    px(T.CLOTH, function (x, y) { return g(170 + ((x + y) % 4 === 0 ? -40 : 0) + n1(x / 8, y / 8) * 50 + r() * 20); });
    px(T.RUST, function (x, y) { var v = 110 + n1(x / 8, y / 8 + 9) * 90 + r() * 30; return [clamp(v * 1.15, 0, 255) | 0, clamp(v * .82, 0, 255) | 0, clamp(v * .66, 0, 255) | 0]; });
    px(T.IRON, function (x, y) { return g(150 + n2(x / 4, y / 4) * 60 + r() * 30); });
    px(T.CANVAS, function (x, y) { return g(((x >> 3) & 1 ? 190 : 150) + n1(x / 8, y / 8) * 40 + r() * 18); });
    px(T.BARK, function (x, y) { return g(120 + n2(x / 3, y / 12) * 100 + r() * 22); });
    px(T.SMOKE1, function (x, y) { var d = Math.hypot(x - 32, y - 32) / 32; var a = clamp(1 - d, 0, 1) * (0.55 + n1(x / 8, y / 8) * .5); return [255, 255, 255, a * 190 | 0]; });
    px(T.SMOKE2, function (x, y) { var d = Math.hypot(x - 32, y - 32) / 32; var a = clamp(1 - d, 0, 1) * (0.45 + n1(x / 8 + 4, y / 8) * .5); return [255, 255, 255, a * 110 | 0]; });
    px(T.DOT, function (x, y) { var d = Math.hypot(x - 31.5, y - 31.5) / 30; return [255, 255, 255, d < 1 ? 255 : 0]; });
    // a sheet of paper with a pixel smiley, taped to the scarecrow's head
    px(T.SMILE, function (x, y) { var X = x >> 3, Y = y >> 3, v = 232 - r() * 14; if (Y === 2 && (X === 2 || X === 5)) v = 90; if ((Y === 5 && X >= 2 && X <= 5) || (Y === 4 && (X === 1 || X === 6))) v = 110; return [v, v, v * .97 | 0]; });
    // window: dark panes; lit: a warm room
    draw(T.WIN, function (c) { c.fillStyle = "#3a3632"; c.fillRect(0, 0, 64, 64); c.fillStyle = "#0b0c0d"; c.fillRect(6, 6, 23, 23); c.fillRect(35, 6, 23, 23); c.fillRect(6, 35, 23, 23); c.fillRect(35, 35, 23, 23); });
    draw(T.WINLIT, function (c) { c.fillStyle = "#3a3632"; c.fillRect(0, 0, 64, 64); var gr = c.createRadialGradient(32, 40, 2, 32, 36, 36); gr.addColorStop(0, "#ffe9b0"); gr.addColorStop(.5, "#e0a14e"); gr.addColorStop(1, "#7a4a22"); c.fillStyle = gr; c.fillRect(6, 6, 23, 23); c.fillRect(35, 6, 23, 23); c.fillRect(6, 35, 23, 23); c.fillRect(35, 35, 23, 23); c.fillStyle = "#fff6d8"; c.fillRect(30, 40, 3, 9); c.fillStyle = "#3a3632"; c.fillRect(29, 49, 5, 9); });
    draw(T.GIFT, function (c) { c.fillStyle = "#8d8f8c"; c.fillRect(0, 0, 64, 64); c.fillStyle = "#d8d2c0"; c.fillRect(26, 0, 12, 64); c.fillRect(0, 26, 64, 12); });
    // the welcome sign, three tiles wide
    (function () { var s = document.createElement("canvas"); s.width = TILE * 3; s.height = TILE; var c = s.getContext("2d");
      c.fillStyle = "#c9c6b8"; c.fillRect(0, 0, s.width, s.height);
      c.fillStyle = "#2d3a2f"; c.fillRect(4, 4, s.width - 8, s.height - 8); c.fillStyle = "#c9c6b8"; c.fillRect(7, 7, s.width - 14, s.height - 14);
      c.fillStyle = "#1f2a22"; c.textAlign = "center"; c.textBaseline = "middle";
      var lines = (signText || "WELCOME TO|NOWHERE").split("|");
      c.font = "bold 13px Georgia, 'Times New Roman', serif"; c.fillText(lines[0].split("").join(" "), s.width / 2, 19);
      c.font = "bold 27px Georgia, 'Times New Roman', serif"; var w = c.measureText(lines[1] || "").width; if (w > s.width - 24) c.font = "bold " + Math.floor(27 * (s.width - 24) / w) + "px Georgia, serif"; c.fillText(lines[1] || "", s.width / 2, 43);
      var id = c.getImageData(0, 0, s.width, s.height), d = id.data, rr = rng(5); for (var i = 0; i < d.length; i += 4) { var k = .8 + rr() * .25; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } c.putImageData(id, 0, 0);
      cx.drawImage(s, (T.SIGN0 % TN) * TILE, (T.SIGN0 / TN | 0) * TILE); })();
    return cv;
  }

  // ----------------------------------------------------------------- mesh
  // layout: pos3 nrm3 uv2 tile2 col3 emissive1 = 14 floats
  var STRIDE = 14;
  function Mesh() { this.a = []; }
  Mesh.prototype.v = function (p, n, u, v, tile, col, e) { this.a.push(p[0], p[1], p[2], n[0], n[1], n[2], u, v, tile % TN, tile / TN | 0, col[0], col[1], col[2], e || 0); };
  Mesh.prototype.tri = function (a, b, c, tile, col, e, n) { n = n || norm(cross(sub(b, a), sub(c, a))); this.v(a, n, 0, 1, tile, col, e); this.v(b, n, 1, 1, tile, col, e); this.v(c, n, .5, 0, tile, col, e); };
  // a,b,c,d counter-clockwise seen from outside; uv: a bottom-left
  Mesh.prototype.quad = function (a, b, c, d, tile, col, e, us, vs, ns) { var n = norm(cross(sub(b, a), sub(d, a))); us = us || 1; vs = vs || 1;
    var na = ns ? ns[0] : n, nb = ns ? ns[1] : n, nc = ns ? ns[2] : n, nd = ns ? ns[3] : n;
    this.v(a, na, 0, vs, tile, col, e); this.v(b, nb, us, vs, tile, col, e); this.v(c, nc, us, 0, tile, col, e);
    this.v(a, na, 0, vs, tile, col, e); this.v(c, nc, us, 0, tile, col, e); this.v(d, nd, 0, 0, tile, col, e); };
  // box: centre c, full size s. opt: ry, rz (rotations), taper (top scale), e, rep (metres per tile), radial (hull normals), jit
  Mesh.prototype.box = function (c, s, tile, col, opt) { opt = opt || {};
    var hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2, tp = opt.taper == null ? 1 : opt.taper, ry = opt.ry || 0, rz = opt.rz || 0, rx = opt.rx || 0;
    var cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz), cxr = Math.cos(rx), sxr = Math.sin(rx);
    var P = function (x, y, z) { var k = y > 0 ? tp : 1; x *= hx * k; y *= hy; z *= hz * k;
      var y1 = y * cxr - z * sxr, z1 = y * sxr + z * cxr; y = y1; z = z1;
      var x1 = x * cz - y * sz; y1 = x * sz + y * cz; x = x1; y = y1;
      var x2 = x * cy + z * sy, z2 = -x * sy + z * cy; return [c[0] + x2, c[1] + y, c[2] + z2]; };
    var v = [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1)];
    var rep = opt.rep || 2, e = opt.e || 0, self = this;
    var f = function (i, j, k, l, w, h) { var ns = null; if (opt.radial) ns = [i, j, k, l].map(function (q) { return norm(sub(v[q], c)); }); self.quad(v[i], v[j], v[k], v[l], tile, col, e, Math.max(.25, w / rep), Math.max(.25, h / rep), ns); };
    f(0, 1, 2, 3, s[0], s[1]); f(5, 4, 7, 6, s[0], s[1]); f(1, 5, 6, 2, s[2], s[1]); f(4, 0, 3, 7, s[2], s[1]); f(3, 2, 6, 7, s[0], s[2]); if (!opt.nobottom) f(4, 5, 1, 0, s[0], s[2]); };
  Mesh.prototype.data = function () { return new Float32Array(this.a); };
  // per-frame meshes reuse one scratch array instead of allocating every frame
  var SCR = null; Mesh.prototype.dyn = function () { var n = this.a.length; if (!SCR || SCR.length < n) SCR = new Float32Array(Math.ceil(n * 1.5)); SCR.set(this.a); return SCR.subarray(0, n); };
  Mesh.prototype.count = function () { return this.a.length / STRIDE; };

  // ----------------------------------------------------------------- props
  var DARK = [.085, .085, .095];
  function pole(m, lines, x, z, y0) { m.box([x, y0 + 3.5, z], [.24, 7, .24], T.WOOD, [.17, .16, .16], { rep: 1.2 }); m.box([x, y0 + 6.35, z], [1.9, .14, .16], T.WOOD, [.15, .14, .14], { rep: 1.2 }); m.box([x - .8, y0 + 6.5, z], [.08, .16, .08], T.WHITE, [.3, .32, .3]); m.box([x + .8, y0 + 6.5, z], [.08, .16, .08], T.WHITE, [.3, .32, .3]); }
  function wire(lines, a, b, sag, lights) { var N = 10, prev = a; for (var i = 1; i <= N; i++) { var t = i / N, p = [mix(a[0], b[0], t), mix(a[1], b[1], t) - Math.sin(t * Math.PI) * sag, mix(a[2], b[2], t)]; lines.v(prev, [0, 1, 0], 0, 0, T.WHITE, [.07, .07, .08], 0); lines.v(p, [0, 1, 0], 0, 0, T.WHITE, [.07, .07, .08], 0);
      if (lights && i < N) { var cols = [[.95, .74, .40], [.80, .86, .76], [.88, .52, .42], [.72, .80, .88]]; lights.box([p[0], p[1] - .09, p[2]], [.13, .16, .13], T.WHITE, cols[(i + (a[2] | 0)) & 3], { e: 1 }); }
      prev = p; } }
  function tree(m, x, z, y0, seed, sc) { var r = rng(seed); sc = sc || 1; m.box([x, y0 + 1.4 * sc, z], [.42 * sc, 2.8 * sc, .42 * sc], T.BARK, DARK, { taper: .55, ry: r() * 3 });
    for (var i = 0; i < 7; i++) { var h = (1.6 + r() * 1.6) * sc, len = (1.1 + r() * 1.5) * sc, ry = r() * 6.28, rz = .5 + r() * .7; var dx = Math.cos(ry) * Math.cos(rz) * len / 2, dy = Math.sin(rz) * len / 2, dz = -Math.sin(ry) * Math.cos(rz) * len / 2;
      m.box([x + dx, y0 + h + dy, z + dz], [len, .09 * sc, .09 * sc], T.BARK, DARK, { ry: ry, rz: rz });
      var l2 = len * .6, ry2 = ry + (r() - .5) * 1.6, rz2 = rz + .3; m.box([x + dx * 1.7 + Math.cos(ry2) * Math.cos(rz2) * l2 / 2, y0 + h + dy * 1.7 + Math.sin(rz2) * l2 / 2, z + dz * 1.7 - Math.sin(ry2) * Math.cos(rz2) * l2 / 2], [l2, .05 * sc, .05 * sc], T.BARK, DARK, { ry: ry2, rz: rz2 }); } }
  function scarecrow(m, fogOnly, xmasOnly, x, z, y0, ry) { var M = modelM(x, y0, z, ry || 0), B = function (mesh, c, s, t, col, o) { o = o || {}; o.ry = (o.ry || 0) + (ry || 0); mesh.box(xf(M, c), s, t, col, o); };
    B(m, [0, 1.6, 0], [.14, 3.2, .14], T.WOOD, [.16, .15, .14]); B(m, [0, 2.35, 0], [2.7, .13, .13], T.WOOD, [.16, .15, .14]);
    B(m, [0, 1.72, 0], [.95, 1.5, .42], T.CLOTH, [.07, .07, .08], { taper: .62 });
    B(m, [-.95, 2.2, 0], [.75, .34, .3], T.CLOTH, [.07, .07, .08]); B(m, [.95, 2.2, 0], [.75, .34, .3], T.CLOTH, [.07, .07, .08]);
    for (var i = 0; i < 6; i++) B(m, [-.42 + i * .17, .78 - (i % 3) * .09, 0], [.1, .5 + (i % 2) * .2, .05], T.CLOTH, [.06, .06, .07]);
    for (i = 0; i < 4; i++) B(m, [1.42 + i * .02, 2.3 + (i - 1.5) * .07, 0], [.36, .02, .02], T.WHITE, [.45, .42, .34], { rz: (i - 1.5) * .22 });
    B(m, [0, 2.86, 0], [.5, .5, .46], T.CLOTH, [.2, .19, .17]);
    var a = xf(M, [-.21, 2.66, .24]), b = xf(M, [.21, 2.66, .24]), c = xf(M, [.21, 3.08, .24]), d = xf(M, [-.21, 3.08, .24]); m.quad(a, b, c, d, T.SMILE, [.92, .92, .9], .45);
    B(m, [0, 3.13, 0], [1.0, .05, .95], T.CLOTH, [.05, .05, .06]);
    B(fogOnly, [0, 3.31, 0], [.5, .32, .5], T.CLOTH, [.05, .05, .06], { taper: .86 });
    // Santa hat in December
    B(xmasOnly, [0, 3.22, 0], [.62, .13, .62], T.WHITE, [.78, .78, .76]); B(xmasOnly, [.05, 3.56, 0], [.54, .56, .54], T.CLOTH, [.52, .13, .12], { taper: .12, rz: -.22 }); B(xmasOnly, [.3, 3.8, 0], [.16, .16, .16], T.WHITE, [.82, .82, .8]);
    // the crow on its arm
    B(m, [-1.02, 2.5, 0], [.3, .15, .14], T.WHITE, [.03, .03, .04], { rz: .2 }); B(m, [-1.19, 2.6, 0], [.12, .11, .11], T.WHITE, [.03, .03, .04]);
    m.tri(xf(M, [-1.25, 2.62, .03]), xf(M, [-1.25, 2.58, -.03]), xf(M, [-1.37, 2.58, 0]), T.WHITE, [.12, .11, .1]);
    B(m, [-.84, 2.54, 0], [.18, .03, .1], T.WHITE, [.03, .03, .04], { rz: .5 }); }
  function cottage(m, fogOnly, xmasOnly, x, z, y0, ry) { var M = modelM(x, y0, z, ry || 0), st = [.36, .35, .36];
    var B = function (mesh, c, s, t, col, o) { o = o || {}; o.ry = (o.ry || 0) + (ry || 0); mesh.box(xf(M, c), s, t, col, o); };
    B(m, [0, 1.3, -2.2], [6, 2.6, .4], T.STONE, st); B(m, [0, 3.0, -2.2], [2.6, .8, .4], T.STONE, st, { taper: .3 });
    B(m, [-3, 1.0, 0], [.4, 2.0, 4.4], T.STONE, st); B(m, [-3, 2.25, -1.2], [.4, .5, 2.0], T.STONE, st); B(m, [-3, 2.7, -1.7], [.4, .4, 1.0], T.STONE, st);
    B(m, [3, 1.3, 0], [.4, 2.6, 4.4], T.STONE, st);
    B(m, [-2.1, 1.2, 2.2], [1.8, 2.4, .4], T.STONE, st); B(m, [1.2, 1.3, 2.2], [3.6, 2.6, .4], T.STONE, st); B(m, [-.9, 2.3, 2.2], [.8, .5, .4], T.STONE, st);
    B(m, [3.0, 2.6, -1.2], [1.0, 5.2, 1.0], T.STONE, [.3, .29, .3]); B(m, [3.0, 5.3, -1.2], [1.2, .2, 1.2], T.STONE, [.26, .25, .26]);
    for (var i = 0; i < 3; i++) { B(m, [-2 + i * 2, 3.35, -1.0], [.12, .12, 3.0], T.WOOD, [.13, .12, .12], { rx: -.72 }); if (i < 2) B(m, [-2 + i * 2, 3.35, 1.0], [.12, .12, 3.0], T.WOOD, [.13, .12, .12], { rx: .72 }); }
    B(m, [0, 4.3, 0], [6.2, .13, .13], T.WOOD, [.13, .12, .12]);
    B(m, [1.4, 3.3, -1.05], [3.0, .06, 2.9], T.RUST, [.3, .27, .26], { rx: -.72 });
    var wa = xf(M, [.9, 1.0, 2.42]), wb = xf(M, [1.9, 1.0, 2.42]), wc = xf(M, [1.9, 2.0, 2.42]), wd = xf(M, [.9, 2.0, 2.42]);
    fogOnly.quad(wa, wb, wc, wd, T.WIN, [.8, .8, .8], 0); xmasOnly.quad(wa, wb, wc, wd, T.WINLIT, [1, 1, 1], 1);
    B(m, [1.4, .95, 2.5], [1.2, .08, .22], T.STONE, [.4, .39, .4]);
    return { smoke: xf(M, [3.0, 5.5, -1.2]), sill: xf(M, [1.72, 0.99, 2.52]), wall: xf(M, [-2.3, 2.4, 2.2]), glow: xf(M, [1.4, 1.5, 2.6]) }; }
  function railing(m, x0, x1, z, y0) { var col = [.08, .08, .09]; for (var x = x0; x <= x1 + .01; x += 2.2) { m.box([x, y0 + .65, z], [.15, 1.3, .15], T.IRON, col); m.box([x, y0 + 1.36, z], [.2, .12, .2], T.IRON, col, { taper: .3 }); m.box([x, y0 + .68, z], [.22, .1, .22], T.IRON, col);
      if (x + 2.2 <= x1 + .01) { m.box([x + 1.1, y0 + 1.12, z], [2.2, .07, .07], T.IRON, col); m.box([x + 1.1, y0 + .5, z], [2.2, .06, .06], T.IRON, col); } } }
  function cart(m, x, z, y0, ry) { var M = modelM(x, y0, z, ry || 0), B = function (c, s, t, col, o) { o = o || {}; o.ry = (o.ry || 0) + (ry || 0); m.box(xf(M, c), s, t, col, o); };
    B([0, .95, 0], [1.7, 1.1, .95], T.WOOD, [.26, .23, .24]); B([0, 1.52, 0], [1.8, .06, 1.05], T.WOOD, [.2, .18, .19]);
    B([-.6, .22, .5], [.34, .34, .06], T.IRON, DARK); B([.6, .22, .5], [.34, .34, .06], T.IRON, DARK); B([-.6, .22, -.5], [.34, .34, .06], T.IRON, DARK); B([.6, .22, -.5], [.34, .34, .06], T.IRON, DARK);
    B([-.8, 2.1, 0], [.07, 1.3, .07], T.IRON, DARK); B([.8, 2.1, 0], [.07, 1.3, .07], T.IRON, DARK);
    B([0, 2.95, 0], [2.4, .55, 1.6], T.CANVAS, [.45, .36, .39], { taper: .55 }); B([0, 2.66, 0], [2.46, .1, 1.66], T.CANVAS, [.4, .32, .35]); }
  function chapel(m, x, z, y0) { var c = [.075, .075, .085]; m.box([x, y0 + 2.2, z], [3.2, 4.4, 3.2], T.STONE, c); m.box([x, y0 + 4.8, z], [3.6, .8, 3.6], T.STONE, c, { taper: .7 }); m.box([x, y0 + 7.4, z], [2.4, 4.6, 2.4], T.STONE, c, { taper: .06 }); m.box([x, y0 + 10.2, z], [.12, 1.1, .12], T.IRON, c); m.box([x, y0 + 10.35, z], [.6, .12, .12], T.IRON, c);
    m.box([x - 1.75, y0 + 5.0, z + 1.75], [.3, 1.3, .3], T.STONE, c, { taper: .2 }); m.box([x + 1.75, y0 + 5.0, z + 1.75], [.3, 1.3, .3], T.STONE, c, { taper: .2 }); }
  function grassTufts(m, n, r, area, hf) { for (var i = 0; i < n; i++) { var x = mix(area[0], area[1], r()), z = mix(area[2], area[3], r()); if (Math.abs(x) < 1.9) continue; var y = hf(x, z), k = .55 + r() * .35, col = [.55 * k, .57 * k, .5 * k];
      for (var b = 0; b < 3; b++) { var a = r() * 6.28, h = .28 + r() * .42, l = .12 + r() * .25, w = .05; var bx = Math.cos(a), bz = Math.sin(a);
        m.tri([x - bz * w, y, z + bx * w], [x + bz * w, y, z - bx * w], [x + bx * l, y + h, z + bz * l], T.WHITE, col, 0, [bx * .5, .5, bz * .5]); } } }
  function figure(m, x, z, y0, ry, col) { var M = modelM(x, y0, z, ry), B = function (c, s) { m.box(xf(M, c), s, T.CLOTH, col, { ry: ry, radial: true }); };
    B([0, 1.66, 0], [.27, .28, .27]); B([0, 1.16, 0], [.52, .7, .3]); B([-.34, 1.14, 0], [.15, .68, .18]); B([.34, 1.14, 0], [.15, .68, .18]); B([-.14, .4, 0], [.2, .82, .22]); B([.14, .4, 0], [.2, .82, .22]); }

  // The cat: CC BY model, re-meshed on load by vertex clustering so it is
  // honestly low-poly, then flat shaded.
  function loadCat(url, cells) { return fetch(url).then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(r.status); }).then(function (ab) {
      var h = new DataView(ab), nv = h.getUint32(0, true), ranges = [h.getUint32(4, true), h.getUint32(8, true), h.getUint32(12, true)];
      var mn = [16, 20, 24].map(function (o) { return h.getFloat32(o, true); }), mx = [28, 32, 36].map(function (o) { return h.getFloat32(o, true); });
      var o = 40, pos = new Int16Array(ab.slice(o, o + nv * 8)); o += nv * 8; var nrm = new Int8Array(ab.slice(o, o + nv * 4)); o += nv * 4;
      var total = ranges[0] + ranges[1] + ranges[2], idx = new Uint16Array(ab.slice(o, o + total * 2));
      var H = mx[1] - mn[1], P = function (i) { return [mn[0] + (pos[i * 4] / 32767 * .5 + .5) * (mx[0] - mn[0]), mn[1] + (pos[i * 4 + 1] / 32767 * .5 + .5) * (mx[1] - mn[1]), mn[2] + (pos[i * 4 + 2] / 32767 * .5 + .5) * (mx[2] - mn[2])]; };
      var body = new Mesh(), eyes = new Mesh(), start = 0, cols = [[.62, .61, .64], [.02, .02, .03], [.5, .3, .36]];
      for (var mat = 0; mat < 3; mat++) { var cell = H / (mat === 0 ? (cells || 20) : 44), map = {}, seen = {}, out = mat === 1 ? eyes : body;
        var key = function (p) { return Math.round(p[0] / cell) + "," + Math.round(p[1] / cell) + "," + Math.round(p[2] / cell); };
        var keys = [], i, k, p;
        for (i = start; i < start + ranges[mat]; i++) { p = P(idx[i]); k = key(p); keys.push(k); var c = map[k] || (map[k] = [0, 0, 0, 0, 0, 0, 0]); c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; c[3]++; c[4] += nrm[idx[i] * 4]; c[5] += nrm[idx[i] * 4 + 1]; c[6] += nrm[idx[i] * 4 + 2]; }
        for (i = 0; i < keys.length; i += 3) { var ka = keys[i], kb = keys[i + 1], kc = keys[i + 2]; if (ka === kb || kb === kc || ka === kc) continue; var id = [ka, kb, kc].sort().join("|"); if (seen[id]) continue; seen[id] = 1;
          var A = map[ka], B = map[kb], C = map[kc], a = [A[0] / A[3], A[1] / A[3] - mn[1], A[2] / A[3]], b = [B[0] / B[3], B[1] / B[3] - mn[1], B[2] / B[3]], c2 = [C[0] / C[3], C[1] / C[3] - mn[1], C[2] / C[3]];
          var n = norm(cross(sub(b, a), sub(c2, a))), avg = [A[4] + B[4] + C[4], A[5] + B[5] + C[5], A[6] + B[6] + C[6]]; if (n[0] * avg[0] + n[1] * avg[1] + n[2] * avg[2] < 0) n = [-n[0], -n[1], -n[2]];
          out.tri(a, b, c2, T.WHITE, cols[mat], 0, n); }
        start += ranges[mat]; }
      return { body: body.data(), eyes: eyes.data(), height: H }; }); }

  // --------------------------------------------------------------- shaders
  var VS = "attribute vec3 aPos,aNrm;attribute vec2 aUV,aTile;attribute vec4 aCol;" +
    "uniform mat4 uMV,uP;uniform mat3 uN;uniform vec2 uRes;uniform vec3 uSun,uAmb,uSunCol;uniform float uSnow,uHull,uWobble;" +
    "varying vec3 vUVW,vView,vAlb;varying vec2 vTile;varying vec4 vCol;" +
    "void main(){vec3 p=aPos+aNrm*uHull;vec4 mv=uMV*vec4(p,1.);vec4 c=uP*mv;" +
    "if(uWobble>0.&&c.w>0.){vec2 s=c.xy/c.w;s=floor(s*uRes*.5+.5)/(uRes*.5);c.xy=s*c.w;}gl_Position=c;" +
    "vec3 n=normalize(uN*aNrm);vec3 base=mix(aCol.rgb,vec3(.80,.82,.84),uSnow*smoothstep(.5,.92,n.y)*(1.-aCol.a));" +
    "vec3 lit=base*(uAmb+uSunCol*max(dot(n,uSun),0.));vCol=vec4(mix(lit,aCol.rgb,aCol.a),aCol.a);vAlb=base*(1.-aCol.a);" +
    "vUVW=vec3(aUV*c.w,c.w);vTile=aTile;vView=mv.xyz;}";
  var BAYER = "float bayer(vec2 p){vec2 q=floor(mod(p,4.));float i=q.x+q.y*4.;" +
    "if(i<.5)return 0./16.;if(i<1.5)return 8./16.;if(i<2.5)return 2./16.;if(i<3.5)return 10./16.;if(i<4.5)return 12./16.;if(i<5.5)return 4./16.;if(i<6.5)return 14./16.;if(i<7.5)return 6./16.;" +
    "if(i<8.5)return 3./16.;if(i<9.5)return 11./16.;if(i<10.5)return 1./16.;if(i<11.5)return 9./16.;if(i<12.5)return 15./16.;if(i<13.5)return 7./16.;if(i<14.5)return 13./16.;return 5./16.;}";
  var FS = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n" +
    "uniform sampler2D uTex;uniform vec3 uFog,uFlashDir,uFlashCol,uSolidCol;uniform vec2 uFogR;uniform float uFlash,uSolid,uFade,uDither;" +
    "varying vec3 vUVW,vView,vAlb;varying vec2 vTile;varying vec4 vCol;" +
    "float bayer(vec2 p){vec2 q=floor(mod(p,4.));float i=q.x+q.y*4.;" +
    "if(i<.5)return 0./16.;if(i<1.5)return 8./16.;if(i<2.5)return 2./16.;if(i<3.5)return 10./16.;if(i<4.5)return 12./16.;if(i<5.5)return 4./16.;if(i<6.5)return 14./16.;if(i<7.5)return 6./16.;" +
    "if(i<8.5)return 3./16.;if(i<9.5)return 11./16.;if(i<10.5)return 1./16.;if(i<11.5)return 9./16.;if(i<12.5)return 15./16.;if(i<13.5)return 7./16.;if(i<14.5)return 13./16.;return 5./16.;}" +
    "void main(){float b=bayer(gl_FragCoord.xy);" +
    "if(uSolid>0.){if(uSolid<b+.03)discard;gl_FragColor=vec4(uSolidCol,1.);return;}" +
    "if(uFade<b+.03)discard;" +
    "vec2 uv=fract(vUVW.xy/vUVW.z);uv=(floor(uv*" + TILE + ".)+.5)/" + TILE + ".;vec4 tex=texture2D(uTex,(vTile+uv)/" + TN + ".);" +
    "if(tex.a<b*.96+.02)discard;" +
    "float dist=length(vView);vec3 vd=vView/dist;float cone=smoothstep(.93,.985,dot(vd,uFlashDir));float att=uFlash/(1.+.012*dist*dist);" +
    "vec3 col=tex.rgb*vCol.rgb+tex.rgb*vAlb*uFlashCol*cone*min(att,.8)*1.05;" +
    "float f=clamp((dist-uFogR.x)/(uFogR.y-uFogR.x),0.,1.);f=f*(2.-f);f*=1.-.35*vCol.a;" +
    "vec3 fog=uFog+uFlashCol*cone*uFlash*.07*smoothstep(2.,14.,dist);" +
    "col=mix(col,fog,f);" +
    "if(uDither>0.){col+=(b-.5)/31.;col=floor(col*31.+.5)/31.;}" +
    "gl_FragColor=vec4(col,1.);}";
  var VS_SKY = "attribute vec2 aP;varying vec2 vP;void main(){vP=aP;gl_Position=vec4(aP,.9999,1.);}";
  var FS_SKY = "precision mediump float;uniform vec3 uTop,uFog,uMoonCol;uniform vec3 uMoon;uniform float uHor,uAsp,uDither;varying vec2 vP;" +
    BAYER +
    "void main(){float t=smoothstep(uHor,uHor+1.25,vP.y);vec3 c=mix(uFog,uTop,t);" +
    "vec2 d=(vP-uMoon.xy)*vec2(uAsp,1.);float r=length(d);c+=uMoonCol*uMoon.z*(exp(-r*r*9.)*.55+exp(-r*r*120.)*.5);" +
    "if(uDither>0.){c+=(bayer(gl_FragCoord.xy)-.5)/31.;c=floor(c*31.+.5)/31.;}gl_FragColor=vec4(c,1.);}";

  // ---------------------------------------------------------------- engine
  function Engine(canvas, opts) {
    var gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: true, powerPreference: "low-power", preserveDrawingBuffer: !!opts.capture });
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error("fog3d", gl.getShaderInfoLog(s)); return null; } return s; }
    function prog(vs, fs) { var a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs); if (!a || !b) return null; var p = gl.createProgram(); gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error("fog3d", gl.getProgramInfoLog(p)); return null; } p.u = {}; p.a = {}; return p; }
    var P = prog(VS, FS), PS = prog(VS_SKY, FS_SKY); if (!P || !PS) return null;
    var U = function (p, n) { return n in p.u ? p.u[n] : (p.u[n] = gl.getUniformLocation(p, n)); };
    var A = function (p, n) { return n in p.a ? p.a[n] : (p.a[n] = gl.getAttribLocation(p, n)); };
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildAtlas(opts.sign));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var E = { gl: gl, W: 1, H: 1 };
    E.buffer = function (data, dynamic) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); return { b: b, n: data.length / STRIDE }; };
    E.update = function (buf, data) { gl.bindBuffer(gl.ARRAY_BUFFER, buf.b); var bytes = data.length * 4;
      if (!buf.cap || bytes > buf.cap) { buf.cap = Math.max(bytes, buf.cap * 2 || 65536); gl.bufferData(gl.ARRAY_BUFFER, buf.cap, gl.DYNAMIC_DRAW); }
      if (bytes) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); buf.n = data.length / STRIDE; };
    E.q = 1;      // resolution factor, lowered by the frame governor in mount()
    E.resize = function () { var cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1, asp = cw / ch; var h = Math.round((opts.rows || (asp < 1 ? 300 : 240)) * E.q); var w = Math.round(h * asp); var mw = Math.round(560 * E.q); if (w > mw) { w = mw; h = Math.round(w / asp); }
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } E.W = w; E.H = h; E.asp = asp; };
    E.begin = function (env) { E.env = env; gl.viewport(0, 0, E.W, E.H); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.useProgram(PS); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); var ap = A(PS, "aP"); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(U(PS, "uTop"), env.top); gl.uniform3fv(U(PS, "uFog"), env.fog); gl.uniform3fv(U(PS, "uMoonCol"), env.moonCol || [.8, .82, .78]); gl.uniform3fv(U(PS, "uMoon"), env.moon || [0, 0, 0]); gl.uniform1f(U(PS, "uHor"), env.horizon || 0); gl.uniform1f(U(PS, "uAsp"), E.asp); gl.uniform1f(U(PS, "uDither"), env.dither ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(ap);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(P); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U(P, "uTex"), 0);
      gl.uniformMatrix4fv(U(P, "uP"), false, env.proj); gl.uniform2f(U(P, "uRes"), E.W, E.H);
      gl.uniform3fv(U(P, "uSun"), env.sun); gl.uniform3fv(U(P, "uAmb"), env.amb); gl.uniform3fv(U(P, "uSunCol"), env.sunCol); gl.uniform1f(U(P, "uSnow"), env.snow || 0);
      gl.uniform3fv(U(P, "uFog"), env.fog); gl.uniform2fv(U(P, "uFogR"), env.fogR); gl.uniform3fv(U(P, "uFlashDir"), env.flashDir); gl.uniform3fv(U(P, "uFlashCol"), env.flashCol || [1, .96, .86]); gl.uniform1f(U(P, "uFlash"), env.flash);
      gl.uniform1f(U(P, "uDither"), env.dither ? 1 : 0); gl.uniform1f(U(P, "uWobble"), env.dither ? 1 : 0); };
    // o: {model, rot(mat3), fade, solid, solidCol, hull, lines, first, count}
    E.draw = function (buf, o) { if (!buf || !buf.n) return; o = o || {}; gl.bindBuffer(gl.ARRAY_BUFFER, buf.b); var F = 4 * STRIDE;
      var at = [["aPos", 3, 0], ["aNrm", 3, 12], ["aUV", 2, 24], ["aTile", 2, 32], ["aCol", 4, 40]];
      for (var i = 0; i < at.length; i++) { var l = A(P, at[i][0]); if (l < 0) continue; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, at[i][1], gl.FLOAT, false, F, at[i][2]); }
      gl.uniformMatrix4fv(U(P, "uMV"), false, o.model ? mul(E.env.view, o.model) : E.env.view);
      gl.uniformMatrix3fv(U(P, "uN"), false, o.rot || [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      gl.uniform1f(U(P, "uFade"), o.fade == null ? 1 : o.fade); gl.uniform1f(U(P, "uSolid"), o.solid || 0); gl.uniform3fv(U(P, "uSolidCol"), o.solidCol || [1, 1, 1]); gl.uniform1f(U(P, "uHull"), o.hull || 0);
      if (o.cull) { gl.enable(gl.CULL_FACE); gl.cullFace(o.cull === "front" ? gl.FRONT : gl.BACK); } else gl.disable(gl.CULL_FACE);
      gl.drawArrays(o.lines ? gl.LINES : gl.TRIANGLES, o.first || 0, o.count || buf.n); };
    return E;
  }

  // flashlight direction in view space from pointer NDC
  function flashDir(proj, mx, my) { return norm([(mx + proj[8]) / proj[0], (my + proj[9]) / proj[5], -1]); }
  function coneAt(view, flash, p) { var v = xf(view, p), d = Math.hypot(v[0], v[1], v[2]) || 1; return smooth(.93, .985, (v[0] * flash[0] + v[1] * flash[1] + v[2] * flash[2]) / d); }
  function billboard(m, p, s, tile, col, e) { m.quad([p[0] - s, p[1] - s, p[2]], [p[0] + s, p[1] - s, p[2]], [p[0] + s, p[1] + s, p[2]], [p[0] - s, p[1] + s, p[2]], tile, col, e); }

  // =================================================================== ROAD
  // The road into town: welcome sign, telephone poles, scarecrow, the ruined
  // cottage, and at the end an iron railing over the lake. Scrolling walks.
  function sceneRoad(E, opts) {
    var r = rng(1999), hn = vnoise(3, 32);
    var hf = function (x, z) { return (hn(x * .07 + 40, z * .07 + 40) - .45) * 1.5 * smooth(3, 11, Math.abs(x)); };
    var w = new Mesh(), fogOnly = new Mesh(), xmasOnly = new Mesh(), lines = new Mesh(), lights = new Mesh();
    var END = -104, x, z;
    for (z = 9; z > -144; z -= 3) for (x = -49.5; x < 49; x += 3) {
      var road = Math.abs(x + 1.5) < .1 && z - 3 >= END, plaza = z - 3 < END + 12 && z - 3 >= END - 3 && Math.abs(x + 1.5) < 12;
      if (z - 3 < END - 3 && Math.abs(x + 1.5) < 30) continue;                    // the lake: nothing but fog
      var k = .78 + r() * .3, col = road ? [.36 * k, .35 * k, .35 * k] : plaza ? [.3 * k, .29 * k, .3 * k] : [.37 * k, .40 * k, .355 * k];
      var a = [x, hf(x, z), z], b = [x + 3, hf(x + 3, z), z], c = [x + 3, hf(x + 3, z - 3), z - 3], d = [x, hf(x, z - 3), z - 3];
      w.quad(a, b, c, d, road ? T.PATH : plaza ? T.PAVE : T.GRASS, col, 0, 2, 2);
    }
    grassTufts(w, 950, r, [-34, 34, 8, -100], hf);
    // poles and wires on the right
    var poles = []; for (var i = 0; i < 9; i++) { var pz = -3 - i * 12.5, pxx = 4.6 + Math.sin(i * 1.7) * .25; poles.push([pxx, hf(pxx, pz), pz]); pole(w, lines, pxx, pz, hf(pxx, pz)); }
    for (i = 0; i < poles.length - 1; i++) { wire(lines, [poles[i][0] - .8, poles[i][1] + 6.6, poles[i][2]], [poles[i + 1][0] - .8, poles[i + 1][1] + 6.6, poles[i + 1][2]], .7, lights); wire(lines, [poles[i][0] + .8, poles[i][1] + 6.6, poles[i][2]], [poles[i + 1][0] + .8, poles[i + 1][1] + 6.6, poles[i + 1][2]], .85, null); }
    wire(lines, [poles[0][0] - .8, 6.6, poles[0][2]], [8, 9.5, 14], .5, null);
    // welcome sign
    var SX = 2.95, SZ = -5.4, sM = modelM(SX, 0, SZ, -.2);
    w.box(xf(sM, [-1.7, 1.55, -.1]), [.15, 3.1, .15], T.WOOD, [.2, .19, .18], { ry: -.2 }); w.box(xf(sM, [1.7, 1.55, -.1]), [.15, 3.1, .15], T.WOOD, [.2, .19, .18], { ry: -.2 });
    w.box(xf(sM, [0, 2.4, -.06]), [4.3, 1.5, .06], T.WOOD, [.22, .21, .2], { ry: -.2 });
    for (i = 0; i < 3; i++) w.quad(xf(sM, [-2.1 + i * 1.4, 1.7, .02]), xf(sM, [-2.1 + (i + 1) * 1.4, 1.7, .02]), xf(sM, [-2.1 + (i + 1) * 1.4, 3.1, .02]), xf(sM, [-2.1 + i * 1.4, 3.1, .02]), T.SIGN0 + i, [.78, .78, .76], .15);
    // a present under the sign in December
    xmasOnly.box(xf(sM, [-.5, .2, .5]), [.42, .4, .42], T.GIFT, [.62, .2, .18], { ry: .5 }); xmasOnly.box(xf(sM, [.05, .14, .7]), [.3, .28, .3], T.GIFT, [.36, .44, .36], { ry: -.3 });
    tree(w, -7, -24, hf(-7, -24), 21); tree(w, 10, -36, hf(10, -36), 22, 1.2); tree(w, -11, -78, hf(-11, -78), 23, 1.3); tree(w, 8.5, -88, hf(8.5, -88), 24); tree(w, -6.5, -97, 0, 25, 1.1); tree(w, 13, -99, 0, 26, 1.25);
    scarecrow(w, fogOnly, xmasOnly, 2.7, -42, 0, -.3);
    var cot = cottage(w, fogOnly, xmasOnly, 9.2, -64, hf(9.2, -64) - .1, -.5);
    for (i = 0; i < 6; i++) { var fx = 3.4 + i * 1.5, fz = -56.5 - i * .25; w.box([fx, hf(fx, fz) + .55, fz], [.1, 1.1 + (i % 2) * .15, .1], T.WOOD, [.15, .14, .14], { rz: (i % 3 - 1) * .06 }); if (i < 5) w.box([fx + .75, hf(fx, fz) + .78, fz - .12], [1.5, .05, .05], T.WOOD, [.15, .14, .14], { ry: .16 }); }
    railing(w, -13.2, 13.2, END, 0); cart(w, 4.6, END + 2.6, 0, .12); chapel(w, -11, END + 2.4, 0);
    // gravestones by the chapel
    for (i = 0; i < 5; i++) w.box([-9.2 + i * 1.15 + (i % 2) * .2, .4, END + 6.5 + (i % 3) * .5], [.5, .8 + (i % 2) * .2, .14], T.STONE, [.2, .2, .21], { rz: (i % 3 - 1) * .08, taper: .8 });
    var B = { w: E.buffer(w.data()), fogOnly: E.buffer(fogOnly.data()), xmasOnly: E.buffer(xmasOnly.data()), lines: E.buffer(lines.data()), lights: E.buffer(lights.data()), dyn: E.buffer(new Float32Array(0), true) };
    var cat = null; if (opts.cat) loadCat(opts.cat, 20).then(function (c) { cat = { body: E.buffer(c.body), eyes: E.buffer(c.eyes), s: .78 / c.height }; S.dirty = true; }).catch(function () {});
    var perches = [xf(sM, [1.5, 3.15, -.06]), cot.wall, [1.1, 1.155, END]];
    // cats at the edge of the fog: gone when you look closer
    var ghosts = [{ p: [0.4, 0, -29], a: 0, gone: false, dwell: 0 }, { p: [poles[4][0] + .55, poles[4][1] + 6.42, poles[4][2]], a: 0, gone: false, dwell: 0 }, { p: [-.6, 0, -84], a: 0, gone: false, dwell: 0 }, { p: [4.6, 3.22, END + 2.6], a: 0, gone: false, dwell: 0 }];
    var flakes = []; for (i = 0; i < 240; i++) flakes.push([r() * 30 - 15, r() * 10, r() * 34, r() * 6.28]);
    var cur = null, bob = 0, tsm = 0;
    var S = { dirty: true };
    S.frame = function (t, dt, st) {
      var p = st.progress; if (cur == null) cur = p; var prev = cur; cur += (p - cur) * Math.min(1, dt * 3.2); if (Math.abs(p - cur) < .0004) cur = p;
      var speed = Math.abs(cur - prev) / Math.max(dt, .001) * 100; if (st.animate) { bob += dt * Math.min(9, speed * 2.2); tsm += dt; }
      var camZ = 2.5 - cur * 99.5, wide = E.asp > 1.15, shift = wide ? .30 : 0;
      var eye = [Math.sin(camZ * .05) * .18 + (st.animate ? Math.sin(tsm * .4) * .03 : 0), 1.62 + Math.sin(bob) * .035 * Math.min(1, speed), camZ];
      var yaw = st.mx * .06 + (wide ? 0 : 0), view = lookAt(eye, [eye[0] + Math.sin(yaw) * 10 + (wide ? .2 : 0), 1.62 + st.my * .35 + .25, camZ - 10], [0, 1, 0]);
      var proj = persp(wide ? 1.0 : 1.18, E.asp, .25, 120, wide ? shift : -.42, wide ? 0 : .3);
      var dusk = smooth(.38, .97, cur), xm = st.xmas ? 1 : 0;
      var fog = mix3(xm ? [.47, .485, .52] : [.485, .475, .505], xm ? [.105, .12, .14] : [.115, .13, .125], dusk), top = mix3(xm ? [.24, .25, .29] : [.25, .245, .275], [.035, .04, .042], dusk);
      var mv = xf(view, [eye[0] - 26, 30, camZ - 80]), moon = [(-proj[0] * mv[0] / mv[2]) - proj[8], -proj[5] * mv[1] / mv[2] - proj[9], dusk * dusk];
      var fd = flashDir(proj, st.fx, st.fy);
      E.begin({ view: view, proj: proj, fog: fog, top: top, fogR: [mix(5, 3.5, dusk), mix(50, 40, dusk)], moon: moon, horizon: -proj[5] * (.25 + st.my * .35) / 10 - proj[9],
        sun: norm([-.3, .8, .5]), amb: mix3([.62, .62, .66], [.2, .23, .225], dusk), sunCol: mix3([.3, .3, .3], [.1, .11, .11], dusk), snow: xm,
        flashDir: fd, flash: mix(.55, 1.5, dusk), dither: st.dither });
      E.draw(B.w); E.draw(xm ? B.xmasOnly : B.fogOnly); E.draw(B.lines, { lines: true });
      if (xm) E.draw(B.lights, { fade: st.animate ? .82 + .18 * Math.sin(t * 2.3) : 1 });
      // smoke from the chimney, snow, the candle glow
      var d = new Mesh(), n;
      for (i = 0; i < 9; i++) { var a2 = ((st.animate ? t * .12 : 0) + i / 9) % 1; billboard(d, [cot.smoke[0] + a2 * 2.2 + Math.sin(a2 * 9 + i) * .25, cot.smoke[1] + a2 * 7.5, cot.smoke[2] - a2 * .8], .35 + a2 * 1.25, a2 < .45 ? T.SMOKE1 : T.SMOKE2, [.62, .62, .64], .55); }
      if (xm) { billboard(d, cot.glow, .95, T.SMOKE2, [1, .72, .36], 1);
        for (i = 0; i < flakes.length; i++) { var f = flakes[i], fy = (((f[1] - (st.animate ? t : 0) * (.9 + (i % 5) * .12)) % 10) + 10) % 10, fz = camZ - 3.5 - ((((f[2] + camZ) % 34) + 34) % 34), fx2 = eye[0] + f[0] + Math.sin((st.animate ? t : 0) * .7 + f[3]) * .35; billboard(d, [fx2, fy, fz], .035, T.DOT, [.9, .91, .93], .85); } }
      E.update(B.dyn, d.dyn()); E.draw(B.dyn);
      if (cat) {
        // the cat is always a little ahead of you
        var pi = 0; while (pi < perches.length - 1 && perches[pi][2] > camZ - 2.2) pi++;
        var cp = perches[pi], cy = Math.atan2(eye[0] - cp[0], eye[2] - cp[2]), br = st.animate ? 1 + .012 * Math.sin(t * 2.1) : 1;
        var M = modelM(cp[0], cp[1], cp[2], cy, cat.s * br), R = [Math.cos(cy), 0, -Math.sin(cy), 0, 1, 0, Math.sin(cy), 0, Math.cos(cy)];
        E.draw(cat.body, { model: M, rot: R }); E.draw(cat.eyes, { model: M, rot: R });
        var glow = coneAt(view, fd, [cp[0], cp[1] + .5, cp[2]]); if (glow > .05) E.draw(cat.eyes, { model: M, rot: R, solid: glow, solidCol: [.86, .93, .62], hull: .004 / cat.s });
        if (xm) { var sM2 = modelM(cot.sill[0], cot.sill[1], cot.sill[2], -.5 + 2.4, cat.s * .62); E.draw(cat.body, { model: sM2, rot: [Math.cos(1.9), 0, -Math.sin(1.9), 0, 1, 0, Math.sin(1.9), 0, Math.cos(1.9)] }); }
        for (i = 0; i < ghosts.length; i++) { var g = ghosts[i], dist = Math.abs(camZ - g.p[2]), lit = coneAt(view, fd, [g.p[0], g.p[1] + .4, g.p[2]]);
          if (!g.gone) { g.dwell = lit > .5 && dist < 30 ? g.dwell + dt : Math.max(0, g.dwell - dt); if (dist < 13 || g.dwell > 1.1) g.gone = true; } else if (dist > 44) { g.gone = false; g.dwell = 0; }
          var want = g.gone ? 0 : 1; g.a = st.animate ? g.a + (want - g.a) * Math.min(1, dt * 3) : want; if (g.a < .04 || g.p[2] > camZ) continue;
          var gy = Math.atan2(eye[0] - g.p[0], eye[2] - g.p[2]), GM = modelM(g.p[0], g.p[1], g.p[2], gy, cat.s), GR = [Math.cos(gy), 0, -Math.sin(gy), 0, 1, 0, Math.sin(gy), 0, Math.cos(gy)];
          E.draw(cat.body, { model: GM, rot: GR, fade: g.a, solid: 0 }); E.draw(cat.eyes, { model: GM, rot: GR, fade: g.a });
          if (lit > .05 && g.a > .5) E.draw(cat.eyes, { model: GM, rot: GR, solid: lit * g.a, solidCol: [.86, .93, .62], hull: .004 / cat.s }); }
      }
      S.dirty = Math.abs(p - cur) > .0004 || ghosts.some(function (g) { return g.a > .04 && g.a < .96; });
    };
    return S;
  }

  // ================================================================= SIGNAL
  // Figures hidden in fog light up as coloured outlines when the radio
  // pulse or the flashlight finds them.
  function sceneSignal(E, opts) {
    var r = rng(404), w = new Mesh(), lines = new Mesh(), xmasOnly = new Mesh(), none = new Mesh(), i, x, z;
    for (z = 6; z > -66; z -= 3) for (x = -37.5; x < 37; x += 3) { var road = Math.abs(x + 1.5) < 4.6, k = .75 + r() * .3; w.quad([x, 0, z], [x + 3, 0, z], [x + 3, 0, z - 3], [x, 0, z - 3], road ? T.PAVE : T.GRASS, road ? [.24 * k, .24 * k, .25 * k] : [.25 * k, .28 * k, .25 * k], 0, 2, 2); }
    grassTufts(w, 420, r, [-30, 30, 4, -50], function () { return 0; });
    for (i = 0; i < 5; i++) { pole(w, lines, 7.2, -4 - i * 13, 0); if (i < 4) { wire(lines, [6.4, 6.6, -4 - i * 13], [6.4, 6.6, -17 - i * 13], .7, xmasOnly); wire(lines, [8, 6.6, -4 - i * 13], [8, 6.6, -17 - i * 13], .85, null); } }
    tree(w, -9, -14, 0, 31, 1.2); tree(w, 12, -26, 0, 32, 1.3); tree(w, -14, -34, 0, 33, 1.4); tree(w, -6.5, -44, 0, 34);
    railing(w, -19.4, -6.2, -9, 0); cart(w, 10.5, -10, 0, -.4);
    var defs = [[-2.6, -4.6, .5], [2.4, -7.5, -.3], [-5.5, -10, .9], [5.2, -12.5, -.8], [-.6, -15, .1], [8, -18, -.5], [-9, -21, .6], [3, -24, .2]];
    var figs = defs.map(function (d, j) { var m = new Mesh(); figure(m, 0, 0, 0, 0, [.11, .11, .12]); return { buf: E.buffer(m.data()), x: d[0], z: d[1], ry: d[2], rev: 0, ph: j * 1.7, walk: j % 3 === 1 ? 1 : 0 }; });
    var cols = (opts.colors || "#ff5a3c,#ffb347,#8fe3c8").split(",").map(function (c) { c = c.trim().replace("#", ""); return [parseInt(c.substr(0, 2), 16) / 255, parseInt(c.substr(2, 2), 16) / 255, parseInt(c.substr(4, 2), 16) / 255]; });
    var B = { w: E.buffer(w.data()), lines: E.buffer(lines.data()), lights: E.buffer(xmasOnly.data()), dyn: E.buffer(new Float32Array(0), true), ring: E.buffer(new Float32Array(0), true) };
    var flakes = []; for (i = 0; i < 200; i++) flakes.push([r() * 30 - 15, r() * 10, r() * 30, r() * 6.28]);
    var S = { dirty: true }, tl = 0;
    S.frame = function (t, dt, st) {
      if (st.animate) tl += dt; var xm = st.xmas ? 1 : 0, wide = E.asp > 1.15;
      var eye = [Math.sin(tl * .23) * .12, 1.62, 3.2], view = lookAt(eye, [eye[0] + st.mx * .9, 1.75 + st.my * .4, -10], [0, 1, 0]), proj = persp(wide ? .95 : 1.2, E.asp, .25, 120, wide ? (opts.shift == null ? .22 : +opts.shift) : 0);
      var fd = flashDir(proj, st.fx, st.fy);
      E.begin({ view: view, proj: proj, fog: xm ? [.15, .17, .2] : [.155, .165, .17], top: [.04, .045, .05], fogR: [2.5, 23], moon: [0, 0, 0], horizon: -proj[5] * (.13 + st.my * .4) / 13.2,
        sun: norm([-.3, .8, .5]), amb: [.3, .32, .33], sunCol: [.12, .12, .13], snow: xm, flashDir: fd, flash: 1.5, dither: st.dither });
      E.draw(B.w); E.draw(B.lines, { lines: true }); if (xm) E.draw(B.lights, { fade: st.animate ? .82 + .18 * Math.sin(t * 2.3) : 1 });
      // the radio pulse: a ring that runs out along the ground
      var period = 5.2, ph = st.animate ? (tl % period) / period : .45, rad = ph * 44, ring = new Mesh();
      for (i = 0; i < 64; i++) { var a = i / 64 * 6.283, b = (i + 1) / 64 * 6.283; ring.v([eye[0] + Math.sin(a) * rad, .06, eye[2] - Math.cos(a) * rad], [0, 1, 0], 0, 0, T.WHITE, cols[0], 1); ring.v([eye[0] + Math.sin(b) * rad, .06, eye[2] - Math.cos(b) * rad], [0, 1, 0], 0, 0, T.WHITE, cols[0], 1); }
      E.update(B.ring, ring.data()); E.draw(B.ring, { lines: true, solid: (1 - ph) * .9, solidCol: cols[0] });
      figs.forEach(function (f, j) {
        var fx = f.x + (f.walk ? Math.sin(tl * .16 + f.ph) * 2.6 : 0), sway = Math.sin(tl * .9 + f.ph) * .04, ry = f.ry + sway + (f.walk ? Math.cos(tl * .16 + f.ph) > 0 ? 1.2 : -1.2 : 0);
        var dist = Math.hypot(fx - eye[0], f.z - eye[2]), lit = coneAt(view, fd, [fx, 1.1, f.z]);
        var hit = Math.abs(dist - rad) < 2.2 ? 1 : 0; if (!st.animate) f.rev = j % 2 ? .95 : .55;
        else f.rev = Math.max(f.rev - dt / 3.4, hit, lit);
        var M = modelM(fx, 0, f.z, ry), R = [Math.cos(ry), 0, -Math.sin(ry), 0, 1, 0, Math.sin(ry), 0, Math.cos(ry)];
        E.draw(f.buf, { model: M, rot: R, cull: "back" });
        if (f.rev > .04) E.draw(f.buf, { model: M, rot: R, solid: Math.min(1, f.rev * 1.25), solidCol: cols[j % cols.length], hull: .03 + dist * .0042, cull: "front" });
      });
      if (xm) { var d = new Mesh(); for (i = 0; i < flakes.length; i++) { var f = flakes[i], fy = (((f[1] - tl * (.9 + (i % 5) * .12)) % 10) + 10) % 10; billboard(d, [f[0] + Math.sin(tl * .7 + f[3]) * .35, fy, 2 - f[2]], .035, T.DOT, [.9, .91, .93], .85); } E.update(B.dyn, d.dyn()); E.draw(B.dyn); }
      S.dirty = false;
    };
    return S;
  }

  // ================================================================== GLOBE
  // The Lakeview music box as a snow globe: the cottage, the scarecrow and
  // the cat, turning slowly.
  function sceneGlobe(E, opts) {
    var r = rng(24), w = new Mesh(), fogOnly = new Mesh(), xmasOnly = new Mesh(), i;
    for (i = 0; i < 28; i++) { var a = i / 28 * 6.283, b = (i + 1) / 28 * 6.283, k = .8 + r() * .3; w.tri([0, 0, 0], [Math.sin(b) * 9, 0, Math.cos(b) * 9], [Math.sin(a) * 9, 0, Math.cos(a) * 9], T.GRASS, [.4 * k, .42 * k, .4 * k], 0, [0, 1, 0]); }
    var cot = cottage(w, fogOnly, xmasOnly, .6, -1.2, 0, .3); scarecrow(w, fogOnly, xmasOnly, -4.2, 2.2, 0, .9); tree(w, 4.6, 3.2, 0, 41, .9); tree(w, -3.5, -4.5, 0, 42, 1.1);
    xmasOnly.box([-1.6, .2, 3.2], [.42, .4, .42], T.GIFT, [.62, .2, .18], { ry: .5 }); xmasOnly.box([-1.0, .14, 3.5], [.3, .28, .3], T.GIFT, [.36, .44, .36], { ry: -.3 });
    var B = { w: E.buffer(w.data()), fogOnly: E.buffer(fogOnly.data()), xmasOnly: E.buffer(xmasOnly.data()), dyn: E.buffer(new Float32Array(0), true) };
    var cat = null; if (opts.cat) loadCat(opts.cat, 20).then(function (c) { cat = { body: E.buffer(c.body), eyes: E.buffer(c.eyes), s: .9 / c.height }; S.dirty = true; }).catch(function () {});
    var flakes = []; for (i = 0; i < 150; i++) flakes.push([r() * 16 - 8, r() * 9, r() * 16 - 8, r() * 6.28]);
    var S = { dirty: true }, tl = 0;
    S.frame = function (t, dt, st) { if (st.animate) tl += dt; var xm = st.xmas ? 1 : 0, ang = .6 + tl * .12 + st.mx * .5;
      var eye = [Math.sin(ang) * 13, 4.2, Math.cos(ang) * 13], view = lookAt(eye, [0, 1.9, 0], [0, 1, 0]), proj = persp(.75, E.asp, .3, 80, 0), fd = flashDir(proj, st.fx, st.fy);
      E.begin({ view: view, proj: proj, fog: [.13, .15, .18], top: [.05, .06, .08], fogR: [9, 34], moon: [0, 0, 0], horizon: -.2, sun: norm([-.3, .8, .5]), amb: [.42, .45, .5], sunCol: [.22, .22, .24], snow: xm, flashDir: fd, flash: .9, dither: st.dither });
      E.draw(B.w); E.draw(xm ? B.xmasOnly : B.fogOnly);
      var d = new Mesh(); if (xm) billboard(d, cot.glow, .8, T.SMOKE2, [1, .72, .36], 1);
      // billboards face the orbiting camera
      var rx = [Math.cos(ang), 0, -Math.sin(ang)];
      for (i = 0; i < flakes.length; i++) { var f = flakes[i], fy = (((f[1] - tl * (.7 + (i % 5) * .1)) % 9) + 9) % 9, p = [f[0] + Math.sin(tl * .7 + f[3]) * .3, fy, f[2]], s = .05; if (p[0] * p[0] + p[2] * p[2] > 78) continue;
        d.quad([p[0] - rx[0] * s, p[1] - s, p[2] - rx[2] * s], [p[0] + rx[0] * s, p[1] - s, p[2] + rx[2] * s], [p[0] + rx[0] * s, p[1] + s, p[2] + rx[2] * s], [p[0] - rx[0] * s, p[1] + s, p[2] - rx[2] * s], T.DOT, [.92, .93, .95], .9); }
      E.update(B.dyn, d.dyn()); E.draw(B.dyn);
      if (cat) { var cy = ang, M = modelM(1.2, 0, 3.4, cy, cat.s), R = [Math.cos(cy), 0, -Math.sin(cy), 0, 1, 0, Math.sin(cy), 0, Math.cos(cy)]; E.draw(cat.body, { model: M, rot: R }); E.draw(cat.eyes, { model: M, rot: R }); }
      S.dirty = false; };
    return S;
  }

  var SCENES = { road: sceneRoad, signal: sceneSignal, globe: sceneGlobe };

  // ----------------------------------------------------------------- mount
  function mount(canvas, opts) {
    opts = opts || {};
    var E; try { E = Engine(canvas, opts); } catch (e) { E = null; }
    if (!E) return null;
    var make = SCENES[opts.scene || "road"]; if (!make) return null;
    var S; try { E.resize(); S = make(E, opts); } catch (e) { console.error("fog3d", e); return null; }
    var Fog = window.Fog, reduced = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
    var st = { progress: 0, mx: 0, my: 0, fx: 0, fy: -.15, animate: true, dither: true, xmas: false }, tmx = 0, tmy = 0, tfx = 0, tfy = -.15, seen = false;
    var visible = true, raf = 0, last = 0, lastDraw = 0, need = true, dead = false, t0 = performance.now();
    // Pacing: full display rate while the page scrolls or the pointer moves (so it keeps up with 120/144/240 Hz),
    // ~30 fps when idle. Weak devices start one quality step down; the governor drops more steps if frames are slow.
    var weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    var busyUntil = 0, prevRaf = 0, idleMs = weak ? 40 : 30, minDt = 1e9, ema = 0, slow = 0, steps = [1, .8, .66, .55], qi = weak ? 1 : 0;
    E.q = steps[qi]; E.resize();
    var docH = 0; function measure() { docH = document.documentElement.scrollHeight - innerHeight; }
    measure(); addEventListener("load", measure); setInterval(measure, 2000);
    function busy() { busyUntil = performance.now() + 900; }
    function govern(gap, isBusy) { if (gap <= 0 || gap > 250) return; if (gap < minDt) minDt = gap; if (!isBusy) return;
      ema = ema ? ema * .9 + gap * .1 : gap;
      // frames take clearly longer than the display refresh: render fewer pixels
      if (ema > Math.max(minDt * 1.7, 12)) { if (++slow > 45 && qi < steps.length - 1) { qi++; E.q = steps[qi]; E.resize(); slow = 0; ema = 0; } } else slow = Math.max(0, slow - 1); }
    function noise() { return Fog ? Fog.noise : (reduced.matches ? "low" : "on"); }
    function progress() { if (opts.progress) return opts.progress(); return docH > 0 ? clamp(scrollY / docH, 0, 1) : 0; }
    function frame(now) { raf = 0; if (dead) return;
      var nz = noise(), animate = nz === "on" && !reduced.matches && !document.hidden && visible;
      if (!animate && !need && !S.dirty) return;
      var isBusy = now < busyUntil; if (prevRaf) govern(now - prevRaf, isBusy); prevRaf = now;
      if (animate && !isBusy && now - lastDraw < idleMs - 2) { raf = requestAnimationFrame(frame); return; }
      var dt = Math.min(.1, (now - lastDraw) / 1000 || .016); last = lastDraw = now; need = false;
      st.progress = progress(); st.animate = animate; st.dither = nz !== "off"; st.xmas = Fog ? Fog.xmas : false;
      var k = animate ? Math.min(1, dt * 5) : 1; st.mx += (tmx - st.mx) * k; st.my += (tmy - st.my) * k; st.fx += (tfx - st.fx) * Math.min(1, k * 1.6); st.fy += (tfy - st.fy) * Math.min(1, k * 1.6);
      if (!seen && animate) { tfx = Math.sin((now - t0) / 2600) * .35; tfy = .12 + Math.sin((now - t0) / 1900) * .08; }      // no pointer: the light sways on its own
      try { S.frame((now - t0) / 1000, dt, st); } catch (e) { console.error("fog3d", e); dead = true; return; }
      if (!canvas.classList.contains("is-live")) canvas.classList.add("is-live");
      if (animate || S.dirty || need) raf = requestAnimationFrame(frame);
    }
    function kick() { need = true; if (!raf && !dead) { prevRaf = 0; lastDraw = performance.now() - 16; raf = requestAnimationFrame(frame); } }
    function onMove(e) { if (e.pointerType === "touch") return; var b = canvas.getBoundingClientRect(); if (!b.width) return; seen = true;
      tfx = clamp((e.clientX - b.left) / b.width * 2 - 1, -1.2, 1.2); tfy = clamp(1 - (e.clientY - b.top) / b.height * 2, -1.2, 1.2); tmx = clamp(tfx, -1, 1); tmy = clamp(tfy, -1, 1) * .3; if (noise() !== "on") { tmx = 0; tmy = 0; } kick(); }
    var rt; function onResize() { clearTimeout(rt); rt = setTimeout(function () { measure(); E.resize(); kick(); }, 120); }
    // an off-screen canvas (the globe further down) ignores scrolling and the pointer
    function onScroll() { if (visible) { busy(); kick(); } }
    var onMove0 = onMove; onMove = function (e) { if (visible) { busy(); onMove0(e); } };
    addEventListener("pointermove", onMove, { passive: true }); addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", kick);
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }).observe(canvas);
    if (Fog && Fog.onChange) Fog.onChange(kick);
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); dead = true; canvas.classList.remove("is-live"); });
    kick();
    return { kick: kick, destroy: function () { dead = true; cancelAnimationFrame(raf); removeEventListener("pointermove", onMove); removeEventListener("scroll", onScroll); removeEventListener("resize", onResize); } };
  }

  function auto() { var els = document.querySelectorAll("canvas[data-fog-scene]"); for (var i = 0; i < els.length; i++) { var c = els[i]; if (c.__fog3d) continue;
    // December still: signal.jpg -> signal-xmas.jpg when the still is set inline
    try { var bg = c.style.backgroundImage; if (window.Fog && Fog.xmas && bg && bg.indexOf("-xmas") < 0) c.style.backgroundImage = bg.replace(/[.](jpg|png)/, "-xmas.$1"); } catch (e) {} c.__fog3d = mount(c, { scene: c.getAttribute("data-fog-scene"), cat: c.getAttribute("data-fog-cat"), sign: c.getAttribute("data-fog-sign"), colors: c.getAttribute("data-fog-colors"), shift: c.getAttribute("data-fog-shift"), capture: c.hasAttribute("data-fog-capture") }) || true; } }
  window.Fog3D = { mount: mount, auto: auto };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto); else auto();
})();
