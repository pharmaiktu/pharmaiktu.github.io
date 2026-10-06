/* Molecula — PharmAI tema betikleri */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // İkonlar
  if (window.lucide) lucide.createIcons();

  // Karanlık / aydınlık mod
  var themeBtn = document.getElementById('theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('pharmai-theme', t); } catch (e) { /* gizli pencere */ }
    window.dispatchEvent(new Event('themechange'));
  });

  // Mobil menü
  var menuBtn = document.getElementById('menu-btn'), links = document.getElementById('nav-links');
  if (menuBtn && links) menuBtn.addEventListener('click', function () {
    var open = links.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // Kaydırınca belirme
  var rv = document.querySelectorAll('.reveal');
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -6% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('in'); });

  // Sayaç animasyonu
  if (!reduce) document.querySelectorAll('[data-count]').forEach(function (el) {
    // Sayı HTML'de gerçek değeriyle durur; animasyon yalnız görününce 0'dan başlar.
    var end = +el.getAttribute('data-count'), t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / 1100);
      el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    }
    new IntersectionObserver(function (es, o) {
      if (es[0].isIntersecting) { requestAnimationFrame(step); o.disconnect(); }
    }).observe(el);
  });

  // BibTeX göster + panoya kopyala
  document.querySelectorAll('.bib-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var pre = b.parentNode.querySelector('.bib');
      pre.hidden = !pre.hidden;
      if (!pre.hidden && navigator.clipboard) {
        navigator.clipboard.writeText(pre.textContent).then(function () {
          var old = b.lastChild.textContent;
          b.lastChild.textContent = b.getAttribute('data-copied');
          setTimeout(function () { b.lastChild.textContent = old; }, 1400);
        }).catch(function () { /* izin yok: yalnız göster */ });
      }
    });
  });

  // Yayın filtresi + arama
  var list = document.getElementById('pub-list');
  if (list) {
    var q = document.getElementById('pub-q'), empty = document.getElementById('pub-empty'), kind = 'all';
    var fold = function (s) { return s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i'); };
    var apply = function () {
      var term = fold(q.value.trim()), shown = 0;
      list.querySelectorAll('.pub-year').forEach(function (y) {
        var n = 0;
        y.querySelectorAll('.pub').forEach(function (p) {
          var ok = (kind === 'all' || p.getAttribute('data-type') === kind) && (!term || fold(p.getAttribute('data-text')).indexOf(term) > -1);
          p.hidden = !ok; if (ok) n++;
        });
        y.hidden = !n; shown += n;
      });
      empty.hidden = shown > 0;
    };
    document.querySelectorAll('.seg button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.seg button').forEach(function (x) { x.classList.toggle('on', x === b); });
        kind = b.getAttribute('data-filter'); apply();
      });
    });
    q.addEventListener('input', apply);
  }

  // ── Molekül → sinir ağı (hero) ─────────────────────────────────────────────
  var cv = document.getElementById('molnet');
  if (!cv) return;
  var ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, nodes = [], edges = [], adj = [], pulses = [], mouse = null, last = 0, spawnT = 0;
  var C = {};
  function colors() {
    var dark = root.getAttribute('data-theme') === 'dark';
    C = dark
      ? { bond: 'rgba(160,210,240,.45)', atom: '#cfe8f7', atomFill: '#0c1d2d', label: '#e7f1f9', neuron: '#7fc6ea', neuronRing: 'rgba(127,198,234,.35)', wire: 'rgba(127,198,234,.18)', pulse: '#9fe0ff', glow: 'rgba(127,198,234,.55)', cl: '#5fd08c', o: '#ff7a6e', n: '#9bb4ff',
          flow: 'rgba(127,198,234,.38)', cell: 'rgba(127,198,234,.16)', nucleus: 'rgba(159,224,255,.55)', organelle: 'rgba(95,208,140,.75)', sheet: 'rgba(12,29,45,.92)', tag: 'rgba(185,203,219,.85)' }
      : { bond: 'rgba(6,63,105,.55)', atom: '#063f69', atomFill: '#ffffff', label: '#063f69', neuron: '#0c568c', neuronRing: 'rgba(127,198,234,.55)', wire: 'rgba(12,86,140,.16)', pulse: '#1aa3e8', glow: 'rgba(26,163,232,.45)', cl: '#2f9a58', o: '#d9443a', n: '#3446a8',
          flow: 'rgba(12,86,140,.32)', cell: 'rgba(127,198,234,.22)', nucleus: 'rgba(6,63,105,.55)', organelle: 'rgba(47,154,88,.7)', sheet: 'rgba(255,255,255,.94)', tag: 'rgba(51,71,94,.8)' };
  }

  // ── Laboratuvar tezgâhı: hücre, odak yığını, kasılma sinyali, fare ──────────
  var MOL = { r: 0, rings: [[0, 0]] };
  var LABELS = {};
  try { LABELS = JSON.parse(cv.getAttribute('data-labels') || '{}'); } catch (e) { /* etiketsiz çiz */ }
  var GLY = [];

  function tag(text, x, y, align) {
    if (!text) return;
    ctx.font = '600 10.5px "JetBrains Mono", monospace'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = C.tag; ctx.fillText(text, x, y);
  }

  function drawCell(g, t) {
    var R = g.s, k, th, rr;
    ctx.beginPath();
    for (k = 0; k <= 60; k++) {
      th = k / 60 * 6.2832;
      rr = R * (1 + 0.04 * Math.sin(3 * th + t * 0.0012) + 0.028 * Math.sin(5 * th - t * 0.0017));
      ctx[k ? 'lineTo' : 'moveTo'](g.x + rr * Math.cos(th), g.y + rr * Math.sin(th));
    }
    ctx.closePath(); ctx.fillStyle = C.cell; ctx.fill(); ctx.strokeStyle = C.atom; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = C.nucleus; ctx.beginPath(); ctx.arc(g.x - R * 0.16, g.y - R * 0.08, R * 0.36, 0, 6.283); ctx.fill();
    ctx.fillStyle = C.organelle;
    for (k = 0; k < 4; k++) {
      th = k * 1.7 + t * 0.00035;
      ctx.beginPath(); ctx.ellipse(g.x + Math.cos(th) * R * 0.6, g.y + Math.sin(th) * R * 0.55, R * 0.1, R * 0.06, th, 0, 6.283); ctx.fill();
    }
    tag(LABELS.cell, g.x, g.y + R + 7);
  }

  // Mikrograf: kan yayması (kırmızı kan hücreleri + mor çekirdekli akyuvarlar); bir kez, sabit tohumla üretilir
  var MIC = null;
  function micrograph() {
    var S = 128, c = document.createElement('canvas'), m = c.getContext('2d'), seed = 7, i, j, x, y, r, ok, placed = [];
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    c.width = c.height = S;
    m.fillStyle = '#f5edf1'; m.fillRect(0, 0, S, S);
    for (i = 0; i < 260 && placed.length < 26; i++) {           // çakışmasız yerleştir
      x = 8 + rnd() * (S - 16); y = 8 + rnd() * (S - 16); r = 7 + rnd() * 2.5; ok = true;
      for (j = 0; j < placed.length; j++) if (Math.hypot(placed[j][0] - x, placed[j][1] - y) < placed[j][2] + r - 1) { ok = false; break; }
      if (ok) placed.push([x, y, r]);
    }
    placed.forEach(function (q, k) {
      if (k === 3 || k === 15) {                                   // akyuvar: soluk sitoplazma + loblu çekirdek
        m.fillStyle = '#e3d6ee'; m.beginPath(); m.arc(q[0], q[1], q[2] + 1.5, 0, 6.283); m.fill();
        m.fillStyle = '#6b4fa3';
        [[-2.5, -1.5, 3.4], [2.2, -1, 3], [0, 2.4, 3.1]].forEach(function (l) { m.beginPath(); m.arc(q[0] + l[0], q[1] + l[1], l[2], 0, 6.283); m.fill(); });
        return;
      }
      var gr = m.createRadialGradient(q[0], q[1], q[2] * 0.15, q[0], q[1], q[2]);   // eritrosit: ortası açık disk
      gr.addColorStop(0, '#f6c9cf'); gr.addColorStop(0.55, '#ec9aa5'); gr.addColorStop(1, '#d4606f');
      m.fillStyle = gr; m.beginPath(); m.arc(q[0], q[1], q[2], 0, 6.283); m.fill();
    });
    return c;
  }

  function drawStack(g, t) {
    // izometrik z-yığını: 4 kesit; odak yukarıdan aşağı tarar, odaktaki kesit net, diğerleri flu
    var ww = g.s * 1.05, hh = ww * 0.5, gap = g.s * 0.3, n = 4, S = 128, i, cy, seq = [0, 1, 2, 3, 2, 1];
    var focus = seq[Math.floor(t / 750) % seq.length];
    if (!MIC) MIC = micrograph();
    // z ekseni
    var zx = g.x - ww - 12, zTop = g.y - 1.5 * gap - 4, zBot = g.y + 1.5 * gap + 6;
    ctx.strokeStyle = C.tag; ctx.fillStyle = C.tag; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(zx, zBot); ctx.lineTo(zx, zTop); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(zx - 3.5, zTop + 5); ctx.lineTo(zx, zTop); ctx.lineTo(zx + 3.5, zTop + 5); ctx.stroke();
    ctx.font = 'italic 600 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('z', zx, zTop - 2);
    for (i = n - 1; i >= 0; i--) {
      cy = g.y - 1.5 * gap + i * gap;
      var sharp = i === focus;
      ctx.save();
      ctx.globalAlpha = sharp ? 1 : 0.82;
      ctx.beginPath(); ctx.moveTo(g.x - ww, cy); ctx.lineTo(g.x, cy - hh); ctx.lineTo(g.x + ww, cy); ctx.lineTo(g.x, cy + hh); ctx.closePath();
      ctx.save(); ctx.clip();
      ctx.transform(ww / S, -hh / S, ww / S, hh / S, g.x - ww, cy);   // kare mikrografı yatık kesite eşle
      if (!sharp && 'filter' in ctx) ctx.filter = 'blur(1.6px)';
      ctx.drawImage(MIC, 0, 0);
      ctx.restore();
      ctx.lineWidth = sharp ? 2.2 : 1; ctx.strokeStyle = sharp ? C.pulse : C.bond; ctx.stroke();
      ctx.restore();
    }
    tag(LABELS.stack, g.x, g.y + 1.5 * gap + hh + 7);
  }

  function drawSignal(g, t) {
    var x0 = g.x, y0 = g.y, w = g.w, h = g.h, base = y0 + h * 0.78, k, f, v;
    ctx.fillStyle = C.sheet; ctx.strokeStyle = C.bond; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y0, w, h, 8) : ctx.rect(x0, y0, w, h); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.wire; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 + 6, base); ctx.lineTo(x0 + w - 6, base); ctx.stroke();
    ctx.strokeStyle = C.pulse; ctx.lineWidth = 2; ctx.beginPath();
    for (k = 0; k <= 80; k++) {
      // kasılma: hızlı yükseliş, üstel gevşeme; zamanla sola kayar
      f = ((k / 80) * 2.4 + t * 0.00035) % 1;
      v = f < 0.12 ? f / 0.12 : Math.exp(-(f - 0.12) * 7);
      ctx[k ? 'lineTo' : 'moveTo'](x0 + 6 + (w - 12) * k / 80, base - v * h * 0.6);
    }
    ctx.stroke();
    tag(LABELS.signal, x0 + w / 2, y0 + h + 6);
  }

  function drawMouse(g, t) {
    // Balb/c laboratuvar faresi (albino): beyaz kürk, pembe kulak/burun/ayak/kuyruk, kırmızı göz
    var s = g.s, x = g.x, y = g.y, wag = Math.sin(t * 0.0026) * s * 0.22, k;
    var dark = root.getAttribute('data-theme') === 'dark';
    var line = dark ? '#a9bccd' : '#4f6b86', pink = '#f0a3b4', pinkIn = '#f8c6d0';
    // kuyruk: kökten uca incelen kavis
    var t0 = [x - s * 0.98, y + s * 0.22], c1 = [x - s * 1.45, y + s * 0.62], c2 = [x - s * 1.95, y + s * 0.42 + wag], t1 = [x - s * 2.3, y + s * 0.02 + wag];
    var prev = t0;
    for (k = 1; k <= 24; k++) {
      var u = k / 24, a = 1 - u;
      var pt = [a * a * a * t0[0] + 3 * a * a * u * c1[0] + 3 * a * u * u * c2[0] + u * u * u * t1[0],
                a * a * a * t0[1] + 3 * a * a * u * c1[1] + 3 * a * u * u * c2[1] + u * u * u * t1[1]];
      ctx.strokeStyle = pink; ctx.lineWidth = s * (0.15 - 0.12 * u); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke(); prev = pt;
    }
    // arka ayak (gövdenin arkasında)
    ctx.fillStyle = pink; ctx.beginPath(); ctx.ellipse(x - s * 0.5, y + s * 0.44, s * 0.2, s * 0.07, 0, 0, 6.283); ctx.fill();
    // gövde + baş tek parça silüet
    ctx.beginPath();
    ctx.moveTo(x - s * 1.0, y + s * 0.15);
    ctx.bezierCurveTo(x - s * 1.05, y - s * 0.45, x - s * 0.6, y - s * 0.66, x - s * 0.2, y - s * 0.62);
    ctx.bezierCurveTo(x + s * 0.2, y - s * 0.6, x + s * 0.55, y - s * 0.5, x + s * 0.75, y - s * 0.38);
    ctx.bezierCurveTo(x + s * 1.0, y - s * 0.28, x + s * 1.35, y - s * 0.12, x + s * 1.45, y + s * 0.02);
    ctx.bezierCurveTo(x + s * 1.42, y + s * 0.14, x + s * 1.15, y + s * 0.22, x + s * 0.9, y + s * 0.24);
    ctx.bezierCurveTo(x + s * 0.4, y + s * 0.45, x - s * 0.4, y + s * 0.5, x - s * 0.8, y + s * 0.38);
    ctx.bezierCurveTo(x - s * 1.0, y + s * 0.33, x - s * 1.02, y + s * 0.25, x - s * 1.0, y + s * 0.15);
    ctx.closePath();
    var fur = ctx.createLinearGradient(x, y - s * 0.66, x, y + s * 0.5);
    fur.addColorStop(0, dark ? '#f4f7fa' : '#ffffff'); fur.addColorStop(1, dark ? '#c3cfda' : '#dfe7ee');
    ctx.fillStyle = fur; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.stroke();
    // kulak
    ctx.beginPath(); ctx.ellipse(x + s * 0.52, y - s * 0.6, s * 0.24, s * 0.3, -0.35, 0, 6.283); ctx.fillStyle = fur; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + s * 0.53, y - s * 0.6, s * 0.14, s * 0.19, -0.35, 0, 6.283); ctx.fillStyle = pinkIn; ctx.fill();
    // ön ayak
    ctx.fillStyle = pink; ctx.beginPath(); ctx.ellipse(x + s * 0.72, y + s * 0.3, s * 0.13, s * 0.06, 0, 0, 6.283); ctx.fill();
    // göz (albino kırmızısı + ışık), burun, bıyıklar
    ctx.fillStyle = '#b3263f'; ctx.beginPath(); ctx.arc(x + s * 1.0, y - s * 0.17, s * 0.075, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + s * 1.02, y - s * 0.2, s * 0.025, 0, 6.283); ctx.fill();
    ctx.fillStyle = pink; ctx.beginPath(); ctx.arc(x + s * 1.44, y + s * 0.02, s * 0.06, 0, 6.283); ctx.fill();
    ctx.strokeStyle = line; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.8;
    [[-0.12], [0.02], [0.15]].forEach(function (d) {
      ctx.beginPath(); ctx.moveTo(x + s * 1.3, y + s * 0.05); ctx.lineTo(x + s * 1.75, y + s * (0.05 + d[0] * 1.3)); ctx.stroke();
    });
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    tag(LABELS.mouse, x - s * 0.1, y + s * 0.6);
  }

  // Kompozisyon: W/H kesirleri, boyutlar u = min(W, H) cinsinden. Öğeler ferah dursun diye küçük tutuldu;
  // bağlar molekülün atomlarından ve şekillerden geçmeyecek şekilde seçildi.
  function layout(u) {
    return {
      r: u * 0.075, mol: [0.28, 0.5],
      layers: [[4, 0.66], [5, 0.80], [3, 0.93]], span: 0.62,
      cell: [0.115, 0.17, 0.052], stack: [0.42, 0.13, 0.072],
      signal: [0.05, 0.75, 0.21, 0.095], mouse: [0.47, 0.885, 0.056],
      // her girdinin portları → ilk katmandaki nöron sırası
      to: { cell: [0, 1], stack: [0, 1], signal: [2, 3], mouse: [2, 3] }
    };
  }

  function build() {
    nodes = []; edges = []; adj = [];
    var u = Math.min(W, H), P = layout(u);
    // molekül geometrisi (çift bağ çizimi de buradan okur)
    var r = P.r, cx = W * P.mol[0], cy = H * P.mol[1];
    MOL = { r: r, rings: [[cx, cy], [cx + Math.sqrt(3) * r, cy]] };
    function add(x, y, kind, label) {
      for (var i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].x - x, nodes[i].y - y) < 2) return i;
      nodes.push({ x: x, y: y, kind: kind, label: label || '', ph: Math.random() * 6.28, glow: 0 });
      adj.push([]); return nodes.length - 1;
    }
    function bond(a, b, dbl, flow) { edges.push({ a: a, b: b, dbl: !!dbl, flow: !!flow, w: nodes[a].kind === 'neuron' && nodes[b].kind === 'neuron' }); adj[a].push(edges.length - 1); adj[b].push(edges.length - 1); }
    function ring(x, y) {
      var ids = [];
      for (var k = 0; k < 6; k++) { var t = (-90 + 60 * k) * Math.PI / 180; ids.push(add(x + r * Math.cos(t), y + r * Math.sin(t), 'atom')); }
      for (k = 0; k < 6; k++) bond(ids[k], ids[(k + 1) % 6], k % 2 === 0);
      return ids;
    }
    var A = ring(cx, cy), B = ring(cx + Math.sqrt(3) * r, cy);
    // yan gruplar (logodaki gibi Cl, N, O)
    function sub(from, ang, len, label) {
      var n = nodes[from], t = ang * Math.PI / 180;
      var id = add(n.x + len * Math.cos(t), n.y + len * Math.sin(t), 'atom', label); bond(from, id); return id;
    }
    sub(A[5], -150, r * 0.95, 'Cl');
    var c1 = sub(A[3], 150, r * 0.95, ''); sub(c1, 210, r * 0.85, 'N');
    sub(A[0], -90, r * 0.9, 'O');
    sub(B[3], 90, r * 0.95, 'N');
    // sinir ağı katmanları
    var L = [];
    P.layers.forEach(function (ly) {
      var ids = [], n = ly[0], x = W * ly[1], span = H * P.span;
      for (var i = 0; i < n; i++) ids.push(add(x, H * 0.5 - span / 2 + span * (n === 1 ? 0.5 : i / (n - 1)), 'neuron'));
      L.push(ids);
    });
    // molekülü ağa bağla (sağ uçtaki atomlar → ilk katman)
    [B[1], B[2], B[0], B[3]].forEach(function (a, i) { bond(a, L[0][Math.min(i, L[0].length - 1)]); });
    for (var l = 0; l < L.length - 1; l++) L[l].forEach(function (a) { L[l + 1].forEach(function (b) { bond(a, b); }); });

    // tezgâh girdileri; molekül gibi her girdinin kenarında birden çok "atom" (port) var
    var L0 = L[0], T = P.to;
    var cR = u * P.cell[2], cx0 = W * P.cell[0], cy0 = H * P.cell[1];
    var sS = u * P.stack[2], sx0 = W * P.stack[0], sy0 = H * P.stack[1], sW = sS * 1.05, sGap = sS * 0.3;
    var gx = W * P.signal[0], gy = H * P.signal[1], gw = W * P.signal[2], gh = H * P.signal[3];
    var mS = u * P.mouse[2], mx0 = W * P.mouse[0], my0 = H * P.mouse[1];
    function onCell(deg) { var a = deg * Math.PI / 180; return [cx0 + (cR + 3) * Math.cos(a), cy0 + (cR + 3) * Math.sin(a)]; }
    GLY = [
      { type: 'cell', x: cx0, y: cy0, s: cR, ports: [onCell(-22).concat(T.cell[0]), onCell(24).concat(T.cell[1])] },
      { type: 'stack', x: sx0, y: sy0, s: sS,                     // en üst ve en alt kesitin sağ köşesi
        ports: [[sx0 + sW + 3, sy0 - 1.5 * sGap, T.stack[0]], [sx0 + sW + 3, sy0 + 1.5 * sGap, T.stack[1]]] },
      { type: 'signal', x: gx, y: gy, w: gw, h: gh, ports: [[gx + gw + 3, gy + gh * 0.3, T.signal[0]], [gx + gw + 3, gy + gh * 0.75, T.signal[1]]] },
      { type: 'mouse', x: mx0, y: my0, s: mS, ports: [[mx0 + mS * 0.6, my0 - mS * 0.92, T.mouse[0]], [mx0 + mS * 1.56, my0 + mS * 0.02, T.mouse[1]]] }   // kulak ucu, burun
    ];
    GLY.forEach(function (g) {
      g.ports.forEach(function (pt) { bond(add(pt[0], pt[1], 'port'), L0[Math.min(pt[2], L0.length - 1)], false, true); });
    });
  }

  function resize() {
    var rect = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function pos(n, t) {
    if (n.kind === 'port') return { x: n.x, y: n.y };   // portlar girdilere sabit
    var a = n.kind === 'neuron' ? 2.2 : 3.2;
    return { x: n.x + Math.cos(t * 0.0009 + n.ph) * a, y: n.y + Math.sin(t * 0.0011 + n.ph) * a };
  }

  function spawn() {
    // soldaki rastgele bir atomdan ya da tezgâh girdisinden (≈%35) sağa doğru yürüyen sinyal
    var kind = Math.random() < 0.35 ? 'port' : 'atom';
    var pool = nodes.map(function (n, i) { return i; }).filter(function (i) { return nodes[i].kind === kind; });
    if (!pool.length) return;
    var start = pool[Math.floor(Math.random() * pool.length)];
    pulses.push({ at: start, edge: null, from: start, k: 0, hops: 0 });
  }

  function nextEdge(p) {
    var here = nodes[p.at], opts = adj[p.at].filter(function (ei) {
      var e = edges[ei], o = e.a === p.at ? e.b : e.a;
      return nodes[o].x > here.x - (here.kind === 'atom' ? nodes[0] && Math.min(W, H) * 0.12 : 0) && o !== p.from;
    });
    if (!opts.length) return null;
    // sağa gidenleri tercih et
    opts.sort(function (x, y) {
      var ex = edges[x], ey = edges[y];
      var ox = nodes[ex.a === p.at ? ex.b : ex.a].x, oy = nodes[ey.a === p.at ? ey.b : ey.a].x;
      return (oy - ox) + (Math.random() - 0.5) * W * 0.25;
    });
    return opts[0];
  }

  function frame(t) {
    var dt = Math.min(50, t - last || 16); last = t;
    ctx.clearRect(0, 0, W, H);
    var P = nodes.map(function (n) { return pos(n, reduce ? 0 : t); });

    // bağlar
    edges.forEach(function (e) {
      var a = P[e.a], b = P[e.b];
      if (e.flow) {   // tezgâh → ağ: molekül→ağ bağlarıyla aynı dil (düz bağ), bir tık ince
        ctx.strokeStyle = C.bond; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        return;
      }
      ctx.strokeStyle = e.w ? C.wire : C.bond; ctx.lineWidth = e.w ? 1 : 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (e.dbl) {
        // halka içine ikinci çizgi (çift bağ)
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var rc = MOL.rings.reduce(function (best, c) { return Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? c : best; });
        var dx = rc[0] - mx, dy = rc[1] - my, d = Math.hypot(dx, dy) || 1, s = MOL.r * 0.21;
        ctx.beginPath();
        ctx.moveTo(a.x + dx / d * s + (b.x - a.x) * 0.15, a.y + dy / d * s + (b.y - a.y) * 0.15);
        ctx.lineTo(b.x + dx / d * s - (b.x - a.x) * 0.15, b.y + dy / d * s - (b.y - a.y) * 0.15);
        ctx.stroke();
      }
    });

    // tezgâh girdileri
    var tt = reduce ? 0 : t;
    GLY.forEach(function (g) {
      ({ cell: drawCell, stack: drawStack, signal: drawSignal, mouse: drawMouse })[g.type](g, tt);
    });

    // sinyaller
    if (!reduce) {
      spawnT += dt;
      if (spawnT > 420 && pulses.length < 14) { spawn(); spawnT = 0; }
      pulses = pulses.filter(function (p) {
        if (p.edge === null) { p.edge = nextEdge(p); if (p.edge === null || p.hops > 7) return false; p.k = 0; }
        var e = edges[p.edge], to = e.a === p.at ? e.b : e.a, a = P[p.at], b = P[to];
        p.k += dt / (e.flow ? 700 : e.w ? 520 : 380);
        if (p.k >= 1) { nodes[to].glow = 1; p.from = p.at; p.at = to; p.edge = null; p.hops++; return true; }
        var x = a.x + (b.x - a.x) * p.k, y = a.y + (b.y - a.y) * p.k;
        var g = ctx.createRadialGradient(x, y, 0, x, y, 8);
        g.addColorStop(0, C.pulse); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.283); ctx.fill();
        return true;
      });
    }

    // düğümler
    nodes.forEach(function (n, i) {
      var p = P[i], near = mouse ? Math.max(0, 1 - Math.hypot(mouse.x - p.x, mouse.y - p.y) / 110) : 0;
      n.glow = Math.max(n.glow * 0.94, near);
      if (n.glow > 0.02) {
        ctx.fillStyle = C.glow; ctx.globalAlpha = n.glow * 0.6;
        ctx.beginPath(); ctx.arc(p.x, p.y, (n.kind === 'neuron' ? 16 : 11) + n.glow * 5, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
      }
      if (n.kind === 'port') {   // moleküldeki atomlar gibi: beyaz içi, lacivert çerçeve
        ctx.fillStyle = C.atomFill; ctx.strokeStyle = C.atom; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.8, 0, 6.283); ctx.fill(); ctx.stroke();
      } else if (n.kind === 'neuron') {
        ctx.fillStyle = C.neuronRing; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 6.283); ctx.fill();
        ctx.fillStyle = C.neuron; ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, 6.283); ctx.fill();
      } else if (n.label) {
        var col = n.label === 'Cl' ? C.cl : n.label === 'O' ? C.o : C.n;
        ctx.fillStyle = C.atomFill; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 6.283); ctx.fill();
        ctx.fillStyle = col; ctx.font = '700 12.5px Sora, Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.label, p.x, p.y + 1);
      } else {
        ctx.fillStyle = C.atomFill; ctx.strokeStyle = C.atom; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.8, 0, 6.283); ctx.fill(); ctx.stroke();
      }
    });
    if (!reduce) requestAnimationFrame(frame);
  }

  cv.addEventListener('pointermove', function (e) { var r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  cv.addEventListener('pointerleave', function () { mouse = null; });
  window.addEventListener('resize', function () { resize(); if (reduce) frame(0); });
  window.addEventListener('themechange', function () { colors(); if (reduce) frame(0); });
  colors(); resize();
  requestAnimationFrame(frame);
})();
