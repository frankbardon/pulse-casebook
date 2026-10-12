/* Pulse film kit: drawing helpers, a narration-driven timeline, chrome and the player.
 *
 * A film page provides markup with these ids: film (canvas), bigplay, voice (audio),
 * play, playIcon, restart, sound, scrub, time, chapters. It then calls
 *   PulseFilm.mount({ series, scenes, narr })
 * where each scene is { name, dur, draw(t), caps: [[animTime, subtitle, spoken?, hideSubtitle?], ...] }.
 * draw(t) must be a pure function of animation time t, so the same t always yields the same frame;
 * that is what lets the browser player and the rendered MP4 agree frame for frame.
 * narr is null (untimed) or one narration length in seconds per cue, in order. Each cue window
 * stretches to LEAD + length + GAP and the animation inside it is time-warped to fit.
 */
window.PulseFilm = (() => {
  const W = 1280, H = 720;
  const C = { bg: '#0B1316', panel: '#111C20', panel2: '#17252A', ink: '#DCE6E8', muted: '#8C9FA6', faint: '#4A5E65', rule: '#2C3F45',
    teal: '#45C1B3', tealS: '#12352F', amber: '#E3A94B', amberS: '#3A2C12', violet: '#A893F0', violetS: '#261F44', coral: '#F0806B', coralS: '#3D1E18' };
  const SANS = '"Archivo", "Helvetica Neue", Arial, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  const LEAD = 0.25, GAP = 0.75;
  let cv = null, ctx = null, scale = 1;

  /* ---------- helpers ---------- */
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const eo = x => 1 - Math.pow(1 - x, 3);
  const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const lerp = (a, b, u) => a + (b - a) * u;
  function R(x, y, w, h, o = {}) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, o.r ?? 4);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { ctx.setLineDash(o.dash || []); ctx.lineWidth = o.lw ?? 1.3; ctx.strokeStyle = o.stroke; ctx.stroke(); ctx.setLineDash([]); }
  }
  function T(s, x, y, o = {}) {
    ctx.font = `${o.weight ?? 400} ${o.size ?? 16}px ${o.font ?? SANS}`;
    ctx.fontStretch = o.stretch ?? 'normal';
    ctx.fillStyle = o.color ?? C.ink; ctx.textAlign = o.align ?? 'left'; ctx.textBaseline = o.base ?? 'alphabetic';
    ctx.letterSpacing = (o.ls ?? 0) + 'px';
    ctx.fillText(s, x, y);
    ctx.letterSpacing = '0px'; ctx.fontStretch = 'normal';
  }
  const M = (s, x, y, o = {}) => T(s, x, y, { font: MONO, size: 13, color: C.muted, ...o });
  const CAP = (s, x, y, o = {}) => T(s, x, y, { font: MONO, size: 11.5, color: C.muted, ls: 1.6, weight: 500, ...o });
  function measure(s, o = {}) { ctx.font = `${o.weight ?? 400} ${o.size ?? 16}px ${o.font ?? SANS}`; ctx.letterSpacing = '0px'; return ctx.measureText(s).width; }
  function Ln(pts, o = {}) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.setLineDash(o.dash || []); ctx.lineWidth = o.lw ?? 1.4; ctx.strokeStyle = o.stroke ?? C.rule; ctx.stroke(); ctx.setLineDash([]);
  }
  function A(alpha, fn) { if (alpha <= 0.001) return; ctx.save(); ctx.globalAlpha *= alpha; fn(); ctx.restore(); }
  function dot(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  function ring(x, y, r, stroke, lw = 2) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
  function arrow(x1, y1, x2, y2, o = {}) {
    Ln([[x1, y1], [x2, y2]], o); const a = Math.atan2(y2 - y1, x2 - x1), s = o.head ?? 7;
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - s * Math.cos(a - .45), y2 - s * Math.sin(a - .45)); ctx.lineTo(x2 - s * Math.cos(a + .45), y2 - s * Math.sin(a + .45)); ctx.closePath();
    ctx.fillStyle = o.stroke ?? C.rule; ctx.fill();
  }
  function keyX(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, x0] = keys[i - 1], [t1, x1] = keys[i]; return lerp(x0, x1, eio((t - t0) / (t1 - t0))); }
    return keys[keys.length - 1][1];
  }
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const fmt = n => n.toLocaleString('en-US');
  /* Chips that wrap inside a width; items: [text, color?]. Returns the y after the last row. */
  function chips(items, x, y, maxW, o = {}) {
    const size = o.size ?? 12.5, h = o.h ?? 26, gap = o.gap ?? 6; let cx = x, cy = y;
    items.forEach(([s, col], i) => {
      const w = measure(s, { font: MONO, size }) + 18;
      if (cx + w > x + maxW) { cx = x; cy += h + gap; }
      const a = o.at ? seg(o.t, o.at + i * (o.step ?? 0.06), o.at + i * (o.step ?? 0.06) + 0.3) : 1;
      A(a, () => { R(cx, cy, w, h, { fill: col ? C.panel2 : C.panel, stroke: col || C.rule, r: 13 }); M(s, cx + 9, cy + h / 2 + 4.5, { size, color: col || C.muted }); });
      cx += w + gap;
    });
    return cy + h;
  }

  /* ---------- mount ---------- */
  function mount(cfg) {
    cv = document.getElementById('film'); ctx = cv.getContext('2d');
    const SCENES = cfg.scenes, NARR = cfg.narr || null, SERIES = cfg.series || 'PULSE';
    let ci = 0, acc = 0;
    SCENES.forEach(s => {
      s.cues = s.caps.map(([a, text, say, hide]) => ({ a, text: hide ? '' : text, say: say || text, len: NARR ? NARR[ci++] : 0 }));
      let f = 0;
      s.cues.forEach((c, k) => {
        const aEnd = k + 1 < s.cues.length ? s.cues[k + 1].a : s.dur;
        c.aw = aEnd - c.a; c.fs = f; c.fw = Math.max(c.aw, c.len ? LEAD + c.len + GAP : 0); f += c.fw;
      });
      s.start = acc; s.fdur = f; acc += f;
    });
    const DUR = acc, NCH = SCENES.length - 1;
    const animTime = (s, fl) => { for (const c of s.cues) if (fl < c.fs + c.fw) return c.a + clamp((fl - c.fs) / c.fw) * c.aw; return s.dur; };
    const sceneAt = t => { for (let i = SCENES.length - 1; i >= 0; i--) if (t >= SCENES[i].start) return i; return 0; };
    const setRes = px => { cv.width = px; cv.height = Math.round(px * 9 / 16); scale = px / W; };

    function wrap(text, maxW, size) {
      ctx.font = `400 ${size}px ${SANS}`; ctx.letterSpacing = '0px'; const words = text.split(' '); const lines = []; let line = '';
      for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
      if (line) lines.push(line); return lines;
    }
    function grid() {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(140,159,166,0.07)';
      for (let x = 32; x < W; x += 32) for (let y = 32; y < 620; y += 32) ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    function chrome(i, fl, t) {
      const sc = SCENES[i];
      CAP(SERIES, 64, 46);
      if (i > 0) { CAP(String(i).padStart(2, '0') + ' / ' + String(NCH).padStart(2, '0'), 1216, 46, { align: 'right' }); T(sc.name, 1216, 70, { size: 15, weight: 600, align: 'right' }); }
      let k = 0; for (let j = 0; j < sc.cues.length; j++) if (fl >= sc.cues[j].fs) k = j;
      const cue = sc.cues[k];
      if (cue.text) {
        const since = fl - cue.fs, left = cue.fs + cue.fw - fl;
        const a = Math.min(clamp(since / 0.3), k + 1 < sc.cues.length ? clamp(left / 0.25) : 1);
        const lines = wrap(cue.text, 1140, 20);
        A(a, () => lines.forEach((ln, j) => T(ln, 64, 652 + j * 27 - (lines.length - 1) * 13.5, { size: 20 })));
      }
      Ln([[64, 700], [1216, 700]], { stroke: C.rule, lw: 2 });
      Ln([[64, 700], [64 + 1152 * (t / DUR), 700]], { stroke: C.teal, lw: 2 });
      SCENES.forEach(s => { const x = 64 + 1152 * s.start / DUR; Ln([[x, 695], [x, 705]], { stroke: C.faint, lw: 1.5 }); });
    }
    function render(t) {
      t = clamp(t, 0, DUR - 0.001);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      grid();
      const i = sceneAt(t), sc = SCENES[i], fl = t - sc.start;
      const a = Math.min(clamp(fl / 0.45), i === SCENES.length - 1 ? 1 : clamp((sc.fdur - fl) / 0.45));
      A(a, () => sc.draw(animTime(sc, fl)));
      chrome(i, fl, t);
    }

    /* ---------- player ---------- */
    const $ = id => document.getElementById(id);
    const playBtn = $('play'), icon = $('playIcon'), scrub = $('scrub'), timeEl = $('time'), list = $('chapters'), voice = $('voice'), soundBtn = $('sound'), big = $('bigplay');
    scrub.max = DUR;
    const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    SCENES.forEach((s, i) => {
      const li = document.createElement('li'); const b = document.createElement('button'); b.className = 'chap'; b.type = 'button';
      b.innerHTML = `<b>${String(i).padStart(2, '0')} · ${mmss(s.start)}</b><span></span>`; b.querySelector('span').textContent = s.name;
      b.addEventListener('click', () => { seek(s.start + 0.01); if (!playing) setPlaying(true); });
      li.appendChild(b); list.appendChild(li);
    });
    const chapBtns = [...list.querySelectorAll('.chap')];
    let now = 0, playing = false, last = null, captureMode = false, muted = false, audioOK = !!(voice && NARR);
    const voiceLive = () => audioOK && !muted && !voice.paused;
    function syncAudio() {
      if (!audioOK) return;
      if (playing && !muted) { try { voice.currentTime = now; } catch (e) {} const pr = voice.play(); if (pr) pr.catch(() => {}); }
      else voice.pause();
    }
    function seek(t) { now = clamp(t, 0, DUR - 0.001); last = null; syncAudio(); }
    function setPlaying(p) {
      playing = p; last = null; big.hidden = true;
      playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play');
      icon.innerHTML = p ? '<rect x="3" y="2" width="3.5" height="12"/><rect x="9.5" y="2" width="3.5" height="12"/>' : '<path d="M4 2 L14 8 L4 14 Z"/>';
      syncAudio();
    }
    function setMuted(m) { muted = m; soundBtn.textContent = m ? 'Narration off' : 'Narration on'; soundBtn.setAttribute('aria-pressed', String(!m)); syncAudio(); }
    if (voice) voice.addEventListener('error', () => { audioOK = false; soundBtn.hidden = true; });
    if (!audioOK) soundBtn.hidden = true;
    soundBtn.addEventListener('click', () => setMuted(!muted));
    big.addEventListener('click', () => { seek(0); setPlaying(true); });
    playBtn.addEventListener('click', () => { if (now >= DUR - 0.05) seek(0); setPlaying(!playing); });
    $('restart').addEventListener('click', () => { seek(0); setPlaying(true); });
    scrub.addEventListener('input', () => seek(parseFloat(scrub.value)));
    let curChap = -1;
    function frame(ts) {
      if (captureMode) return;
      if (playing) {
        if (voiceLive() && voice.currentTime > 0) now = voice.currentTime;
        else if (last != null) now += (ts - last) / 1000;
        last = ts;
        if (now >= DUR) { now = DUR - 0.001; setPlaying(false); }
      }
      render(now);
      scrub.value = now; timeEl.textContent = mmss(now) + ' / ' + mmss(DUR);
      const c = sceneAt(now); if (c !== curChap) { curChap = c; chapBtns.forEach((b, k) => b.setAttribute('aria-current', k === c ? 'true' : 'false')); }
      requestAnimationFrame(frame);
    }
    function fitCanvas() { const w = cv.getBoundingClientRect().width || 1280; setRes(Math.round(Math.min(1920, w * (window.devicePixelRatio || 1)))); }
    window.addEventListener('resize', fitCanvas);
    fitCanvas();
    now = SCENES[0].fdur * 0.75;
    setPlaying(false); big.hidden = false;
    const go = () => requestAnimationFrame(frame);
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go, go);
    window.__film = { DUR, render: t => render(t), capture(px) { captureMode = true; setRes(px); }, toJPEG: q => cv.toDataURL('image/jpeg', q),
      cues: () => SCENES.flatMap(s => s.cues.map(c => ({ t: s.start + c.fs + LEAD, say: c.say }))) };
  }

  return { W, H, C, SANS, MONO, mount, get ctx() { return ctx; },
    h: { clamp, seg, eo, eio, lerp, R, T, M, CAP, measure, Ln, A, dot, ring, arrow, keyX, rng, fmt, chips } };
})();
