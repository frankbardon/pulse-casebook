// Pulse mark geometry + flat-shaded SVG exporter. Pure module: pass THREE in.
export function createMarks(THREE) {
// seeded rng
let seed = 7;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const ease = k => { k = Math.min(1, Math.max(0, k)); return 1 - Math.pow(1 - k, 3); };
const easeBack = k => { k = Math.min(1, Math.max(0, k)); const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

// shared palette — Nexus mark gradient violet → cyan
function makeMats() {
  const A = new THREE.Color(0x6C5CE7), B = new THREE.Color(0x00B4D8);
  const names = ['violet', 'iris', 'azure', 'cyan'];
  const grad = names.map((n, i) => {
    const c = A.clone().lerp(B, i / 3);
    return new THREE.MeshStandardMaterial({ name: n, color: c, emissive: c, emissiveIntensity: 0.18, roughness: 0.32, metalness: 0.25 });
  });
  const signal = new THREE.MeshStandardMaterial({ name: 'signal', color: 0xCFF6FB, emissive: 0x7FE3F2, emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.1 });
  const all = [...grad, signal];
  return { grad, signal, all, pick: t => grad[Math.min(3, Math.max(0, Math.round(t * 3)))] };
}
const UP = new THREE.Vector3(0, 1, 0);
const unitCyl = new THREE.BoxGeometry(2, 1, 2);
const gem = new THREE.OctahedronGeometry(1, 0);
// flat ribbon along a 2D polyline with mitred (sharp) joints and square ends, extruded to depth
function ribbon(pts, w, depth, limit = 6) {
  const hw = w / 2, L = [], Rr = [];
  const dir = (a, b) => new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
  const nrm = d => new THREE.Vector2(-d.y, d.x);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0 || i === pts.length - 1) {
      const n = nrm(i === 0 ? dir(pts[0], pts[1]) : dir(pts[i - 1], pts[i]));
      L.push(p.clone().addScaledVector(n, hw)); Rr.push(p.clone().addScaledVector(n, -hw)); continue;
    }
    const d0 = dir(pts[i - 1], p), d1 = dir(p, pts[i + 1]);
    const n0 = nrm(d0), n1 = nrm(d1), m = n0.clone().add(n1).normalize();
    const k = 1 / Math.max(m.dot(n1), 1e-3);
    if (k <= limit) { L.push(p.clone().addScaledVector(m, hw * k)); Rr.push(p.clone().addScaledVector(m, -hw * k)); }
    else {
      const turnLeft = d0.x * d1.y - d0.y * d1.x > 0;
      const out = turnLeft ? -1 : 1, inner = p.clone().addScaledVector(m, -out * hw * Math.min(k, limit));
      const o0 = p.clone().addScaledVector(n0, out * hw), o1 = p.clone().addScaledVector(n1, out * hw);
      const tip = p.clone().addScaledVector(m, out * hw * limit);
      if (out > 0) { L.push(o0, tip, o1); Rr.push(inner); } else { Rr.push(o0, tip, o1); L.push(inner); }
    }
  }
  const shape = new THREE.Shape([...L, ...Rr.reverse()]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -depth / 2); return geo;
}
function clipX(mat) { const pl = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 99); mat.clippingPlanes = [pl]; return pl; }
function placeLink(m, a, b, r) {
  const d = b.clone().sub(a); const L = Math.max(d.length(), 1e-5);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(r, L, r);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
}

// ---------- A: node-network ring ----------
function buildA() {
  seed = 11;
  const M = makeMats();
  const g = new THREE.Group(); g.name = 'pulse_mark_ring';
  const sphere = gem;
  const nodes = [];
  [{ r: 0.36, n: 16 }, { r: 0.47, n: 22 }, { r: 0.58, n: 28 }].forEach((ring, ri) => {
    const off = rnd() * Math.PI * 2;
    for (let i = 0; i < ring.n; i++) {
      const a = off + (i + (rnd() - 0.5) * 0.6) / ring.n * Math.PI * 2;
      const r = ring.r + (rnd() - 0.5) * 0.05;
      const p = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, (rnd() - 0.5) * 0.1);
      const size = rnd() < 0.14 ? 0.04 : 0.017 + rnd() * 0.014;
      const t = (p.x / 0.62 + 1) / 2;
      const m = new THREE.Mesh(sphere, M.pick(t)); m.name = `node_${ri}_${i}`;
      m.scale.setScalar(size); m.position.copy(p);
      const from = p.clone().multiplyScalar(2.2 + rnd() * 1.6); from.z += (rnd() - 0.5) * 2;
      nodes.push({ m, p, size, a: Math.atan2(p.y, p.x), from, delay: rnd() * 0.7 });
      g.add(m);
    }
  });
  const links = []; const seen = new Set();
  nodes.forEach((n, i) => {
    nodes.map((o, j) => ({ j, d: n.p.distanceTo(o.p) })).filter(x => x.j !== i && x.d < 0.17)
      .sort((x, y) => x.d - y.d).slice(0, 3).forEach(({ j }) => {
        const key = i < j ? i + '_' + j : j + '_' + i; if (seen.has(key)) return; seen.add(key);
        const t = ((n.p.x + nodes[j].p.x) / 2 / 0.62 + 1) / 2;
        const m = new THREE.Mesh(unitCyl, M.pick(t)); m.name = `link_${key}`;
        placeLink(m, n.p, nodes[j].p, 0.0055);
        links.push({ m, a: n, b: nodes[j] }); g.add(m);
      });
  });
  const cur = new Map();
  return {
    group: g, mats: M.all, dur: 2.4,
    update(t, ti, f) {
      nodes.forEach(n => {
        const k = ease((ti - n.delay) / 1.1);
        const pos = n.from.clone().lerp(n.p, k); n.m.position.copy(pos); cur.set(n, pos);
        let s = n.size * Math.max(0.001, k);
        if (f.wave) s *= 1 + 0.9 * Math.pow(Math.max(0, Math.cos(n.a - t * 1.8)), 10);
        n.m.scale.setScalar(s);
      });
      links.forEach(l => {
        const k = ease((ti - Math.max(l.a.delay, l.b.delay) - 1.0) / 0.6);
        l.m.visible = k > 0.001;
        if (l.m.visible) { const a = cur.get(l.a), b = cur.get(l.b); placeLink(l.m, a, a.clone().lerp(b, k), 0.0055); }
      });
    }
  };
}

// ---------- B: waveform through a split ring ----------
function buildB() {
  const M = makeMats();
  const g = new THREE.Group(); g.name = 'pulse_mark_wave';
  const R = 0.55, band = 0.06, depth = 0.07;
  const arcs = [];
  [[14, 166, M.grad[0], 'arc_top'], [194, 346, M.grad[1], 'arc_bottom']].forEach(([a0, a1, mat, name]) => {
    const pivot = new THREE.Group(); pivot.name = name;
    const r0 = a0 * Math.PI / 180, r1 = a1 * Math.PI / 180, ro = R + band / 2, ri = R - band / 2;
    const sh = new THREE.Shape(); sh.absarc(0, 0, ro, r0, r1, false); sh.absarc(0, 0, ri, r1, r0, true); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 96 }); geo.translate(0, 0, -depth / 2);
    const arc = new THREE.Mesh(geo, mat); arc.name = name + '_body'; pivot.add(arc);
    g.add(pivot); arcs.push({ pivot, dir: name === 'arc_top' ? 1 : -1 });
  });
  const pts = [[-0.84, 0], [-0.30, 0], [-0.22, 0.08], [-0.15, 0], [-0.09, 0], [-0.04, -0.12], [0.04, 0.42], [0.13, -0.30], [0.20, 0], [0.30, 0], [0.38, 0.10], [0.46, 0], [0.84, 0]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const lineMat = M.signal, plane = clipX(lineMat);
  const line = new THREE.Mesh(ribbon(pts, 0.046, 0.05, 4), lineMat); line.name = 'waveform'; g.add(line);
  const path = new THREE.CurvePath();
  for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(pts[i].x, pts[i].y, 0), new THREE.Vector3(pts[i + 1].x, pts[i + 1].y, 0)));
  const spark = new THREE.Mesh(gem, M.grad[3]); spark.name = 'spark'; g.add(spark);
  return {
    group: g, mats: M.all, dur: 2.2,
    update(t, ti, f) {
      arcs.forEach(({ pivot, dir }) => { const k = easeBack(ti / 0.9); pivot.scale.setScalar(Math.max(0.001, k)); pivot.rotation.z = (1 - ease(ti / 0.9)) * dir * 1.4; });
      const k = ease((ti - 0.5) / 1.3);
      if (f.bake) { plane.constant = 99; line.scale.x = Math.max(k, 0.001); line.position.x = -0.84 * (1 - line.scale.x); }
      else { plane.constant = k >= 1 ? 99 : -0.86 + 1.72 * k; line.scale.x = 1; line.position.x = 0; }
      let u = null, s = 0;
      if (k < 1 && k > 0) { u = k; s = 1; }
      else if (k >= 1 && f.wave) { const ph = ((t * 0.45) % 1); u = ph; s = Math.sin(ph * Math.PI); }
      spark.visible = u !== null && s > 0.01;
      if (spark.visible) { const p = path.getPointAt(Math.min(u, 1)); spark.position.set(p.x, p.y, 0); spark.scale.set(0.05 * s, 0.05 * s, 0.035 * s); spark.rotation.z = Math.PI / 4; }
    }
  };
}

// ---------- C: distribution ----------
function buildC() {
  const M = makeMats();
  const g = new THREE.Group(); g.name = 'pulse_mark_distribution';
  const N = 11, sp = 0.1, w = 0.07, d = 0.07, sig = 0.2, H = 0.82;
  const f = x => H * Math.exp(-x * x / (2 * sig * sig));
  const bars = [], dots = [];
  for (let i = 0; i < N; i++) {
    const x = (i - (N - 1) / 2) * sp, h = Math.max(0.05, f(x));
    const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, M.pick(i / (N - 1))); m.name = `bar_${i}`; m.position.x = x; g.add(m);
    bars.push({ m, i, x, delay: Math.abs(i - (N - 1) / 2) * 0.07 });
    const dot = new THREE.Mesh(gem, M.grad[3]); dot.name = `sample_${i}`;
    dot.position.set(x, f(x) + 0.075, 0); g.add(dot); dots.push({ m: dot, x, u: i / (N - 1) });
  }
  const cpts = []; for (let i = 0; i <= 120; i++) { const x = -0.62 + 1.24 * i / 120; cpts.push(new THREE.Vector2(x, f(x) + 0.075)); }
  const plane = clipX(M.signal);
  const cm = new THREE.Mesh(ribbon(cpts, 0.016, 0.024), M.signal); cm.name = 'density_curve'; g.add(cm);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.016, 0.04), M.grad[0]); base.name = 'baseline';
  base.position.y = -0.035; g.add(base);
  return {
    group: g, mats: M.all, dur: 2.4,
    update(t, ti, fl) {
      base.scale.x = Math.max(0.001, ease(ti / 0.6));
      bars.forEach(b => { b.m.scale.y = Math.max(0.001, easeBack((ti - 0.3 - b.delay) / 0.7)); });
      const kc = ease((ti - 1.1) / 1.0);
      if (fl.bake) { plane.constant = 99; cm.scale.x = Math.max(kc, 0.001); cm.position.x = -0.62 * (1 - cm.scale.x); }
      else { plane.constant = kc >= 1 ? 99 : -0.64 + 1.28 * kc; cm.scale.x = 1; cm.position.x = 0; }
      dots.forEach(dt => {
        let s = kc >= dt.u ? 0.036 : 0.0001;
        if (fl.wave && kc >= 1) { const ph = (t * 0.5) % 1.4 - 0.2; s *= 1 + 0.9 * Math.exp(-Math.pow((dt.u - ph) / 0.08, 2)); }
        dt.m.scale.set(s, s, s * 0.7);
      });
    }
  };
}


const builders = { a: buildA, b: buildB, c: buildC };
const NAMES = { a: 'ring', b: 'wave', c: 'distribution' };
const ANGLES = [['front', 0], ['turn-1-16', Math.PI / 8], ['turn-1-12', Math.PI / 6], ['turn-1-8', Math.PI / 4]];
const KEY = new THREE.Vector3(4, 7, 5).normalize(), FILL = new THREE.Vector3(-5, 3, -4).normalize();

function svgSet(o) {
  const mk = builders[o]();
  mk.update(0, 99, { spin: false, glow: false, wave: false });
  const g = mk.group;
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(20, 1, 0.1, 100);
  cam.position.set(c.x, c.y, c.z + 6); cam.lookAt(c); cam.updateMatrixWorld(true);
  const shade = (mat, n) => {
    const lit = 0.32 + 0.18 * n.y + 0.8 * Math.max(0, n.dot(KEY)) + 0.18 * Math.max(0, n.dot(FILL));
    const e = mat.name === 'signal' ? 0.45 : 0.18;
    const col = new THREE.Color(
      Math.min(1, mat.color.r * lit + mat.emissive.r * e),
      Math.min(1, mat.color.g * lit + mat.emissive.g * e),
      Math.min(1, mat.color.b * lit + mat.emissive.b * e));
    return '#' + col.getHexString();
  };
  const frames = ANGLES.map(([label, ang]) => {
    g.rotation.y = ang; g.updateMatrixWorld(true);
    const polys = [];
    g.traverse(m => {
      if (!m.isMesh) return;
      for (let p = m; p; p = p.parent) if (!p.visible) return;
      const sc = new THREE.Vector3(); m.getWorldScale(sc);
      if (Math.min(Math.abs(sc.x), Math.abs(sc.y), Math.abs(sc.z)) < 1e-3) return;
      const pos = m.geometry.attributes.position, idx = m.geometry.index, n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        const v = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld));
        const nrm = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
        if (nrm.lengthSq() < 1e-14) continue;
        nrm.normalize();
        const cen = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
        if (nrm.dot(cam.position.clone().sub(cen)) <= 0) continue;
        const pr = v.map(q => q.clone().project(cam));
        polys.push({ z: cen.distanceTo(cam.position), pts: pr.map(q => [q.x * 500, -q.y * 500]), fill: shade(m.material, nrm) });
      }
    });
    polys.sort((p, q) => q.z - p.z);
    return { label, polys };
  });
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  frames.forEach(f => f.polys.forEach(p => p.pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); })));
  const side = Math.max(x1 - x0, y1 - y0) * 1.1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const vb = [cx - side / 2, cy - side / 2, side, side].map(v => +v.toFixed(1)).join(' ');
  const r = v => +v.toFixed(1);
  return frames.map(f => {
    const paths = f.polys.map(p => `<path d="M${p.pts.map(([x, y]) => r(x) + ' ' + r(y)).join('L')}Z" fill="${p.fill}" stroke="${p.fill}"/>`).join('');
    return { name: `pulse-${NAMES[o]}-${f.label}.svg`, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"><title>Pulse mark — ${NAMES[o]} (${f.label})</title><g stroke-width="0.6" stroke-linejoin="round">${paths}</g></svg>` };
  });
}
return { builders, svgSet, NAMES };
}
