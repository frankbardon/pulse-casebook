/* Time-driven Pulse ring for the film kit. Source of ../pulse-ring.js (built by build.mjs).
 *
 * Adapted from the pulse-studio <pulse-mark> embed (embed/pulse-mark.js): same scene, lights,
 * camera fit, mark geometry (pulse-marks.js, vendored unchanged) and animation formulas, but no
 * clock, no rAF loop and no observers. Every frame is a pure function of the arguments to draw():
 *   PulseRing.draw(ctx, cx, cy, size, { t, ti, rot, glow, signal })
 * renders the ring mark to an offscreen WebGL canvas and composites it, centred at (cx, cy) in
 * the 2D context's current coordinates, into a size x size box.
 *   t       time driving the signal pulse (mk.update's t)
 *   ti      time since the build-in began; 99 (or more) means fully built
 *   rot     yaw in radians (the embed's spin is rot = t * 0.35; its resting tilt is 12 degrees)
 *   glow    emissive intensity (the embed's breathing glow is 0.14 + 0.38 * (0.5 + 0.5 * sin(t * 2.2)))
 *   signal  true to run the travelling pulse
 * If WebGL is unavailable, or the page URL carries ?ring=svg, the ring is drawn from the flat-shaded
 * turn-step frames (front, 1/16, 1/12 and 1/8 turn) that pulse-marks.js exports as SVG, picked by rot.
 * three.js is vendored at 0.184.0 under ./three; nothing is fetched at runtime.
 */
import {
  Box3, BoxGeometry, Color, CurvePath, ExtrudeGeometry, Group, LineCurve3, Mesh, MeshStandardMaterial,
  OctahedronGeometry, PerspectiveCamera, Plane, Shape, Vector2, Vector3,
  WebGLRenderer, Scene, HemisphereLight, DirectionalLight,
} from './three/three.module.js';
import { createMarks } from './pulse-marks.js';

const THREE = { Box3, BoxGeometry, Color, CurvePath, ExtrudeGeometry, Group, LineCurve3, Mesh, MeshStandardMaterial,
  OctahedronGeometry, PerspectiveCamera, Plane, Shape, Vector2, Vector3 };
const marks = createMarks(THREE);
const TILT = 12 * Math.PI / 180;

let gl = null, glFailed = false, svg = null;
const forceSvg = typeof location !== 'undefined' && /[?&]ring=svg\b/.test(location.search);

function initGL() {
  if (gl || glFailed) return gl;
  try {
    const canvas = document.createElement('canvas');
    const r = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    r.localClippingEnabled = true;
    const scene = new Scene();
    scene.add(new HemisphereLight(0xffffff, 0x1D232A, 1.1));
    const key = new DirectionalLight(0xffffff, 2.2); key.position.set(4, 7, 5); scene.add(key);
    const fill = new DirectionalLight(0xfff4e6, 0.5); fill.position.set(-5, 3, -4); scene.add(fill);
    const cam = new PerspectiveCamera(24, 1, 0.01, 100);
    const mk = marks.builders.a();
    mk.update(0, 99, {});
    const box = new Box3().setFromObject(mk.group);
    const c = box.getCenter(new Vector3()), sz = box.getSize(new Vector3());
    const ext = { x: Math.max(sz.x, sz.z) / 2, y: sz.y / 2, z: Math.max(sz.x, sz.z) / 2 };
    mk.group.position.sub(c);
    const pivot = new Group(); pivot.add(mk.group); scene.add(pivot);
    const vf = cam.fov * Math.PI / 360, hf = Math.atan(Math.tan(vf) * cam.aspect);
    cam.position.set(0, 0, Math.max(ext.y / Math.tan(vf), ext.x / Math.tan(hf)) * 1.08 + ext.z);
    cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    gl = { r, canvas, scene, cam, mk, pivot, px: 0 };
  } catch (e) { glFailed = true; gl = null; }
  return gl;
}

function drawGL(ctx, cx, cy, size, s) {
  const g = initGL(); if (!g) return false;
  const px = Math.max(16, Math.round(size * Math.abs(ctx.getTransform().a)));
  if (px !== g.px) { g.r.setSize(px, px, false); g.px = px; }
  g.mk.update(s.t, s.ti, { wave: !!s.signal });
  g.pivot.rotation.y = s.rot;
  g.mk.mats.forEach(m => m.emissiveIntensity = m.name === 'signal' ? s.glow * 1.6 + 0.1 : s.glow);
  g.r.render(g.scene, g.cam);
  ctx.drawImage(g.canvas, cx - size / 2, cy - size / 2, size, size);
  return true;
}

/* Fallback: the turn-step SVG frames from pulse-marks.js, parsed once into Path2D lists. */
function initSvg() {
  if (svg) return svg;
  svg = marks.svgSet('a').map(({ name, svg: text }) => {
    const vb = text.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    const paths = [...text.matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)].map(m => [new Path2D(m[1]), m[2]]);
    return { name, vb, paths };
  });
  return svg;
}
const STEPS = [0, Math.PI / 8, Math.PI / 6, Math.PI / 4];   // front, 1/16, 1/12, 1/8 turn
function drawSvg(ctx, cx, cy, size, s) {
  const frames = initSvg();
  let a = ((s.rot % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;   // -pi..pi
  a = Math.min(Math.abs(a), Math.PI - Math.abs(a));   // the frames only turn one way; a negative yaw uses its mirror step
  let k = 0; STEPS.forEach((v, i) => { if (Math.abs(v - a) < Math.abs(STEPS[k] - a)) k = i; });
  const f = frames[k], [x0, y0, w] = f.vb, b = Math.min(1, Math.max(0, s.ti / 2.2)), e = 1 - Math.pow(1 - b, 3);
  ctx.save();
  ctx.globalAlpha *= e;
  ctx.translate(cx, cy); ctx.scale(size / w * (0.85 + 0.15 * e), size / w * (0.85 + 0.15 * e)); ctx.translate(-(x0 + w / 2), -(y0 + w / 2));
  ctx.lineWidth = 0.6; ctx.lineJoin = 'round';
  for (const [p, fill] of f.paths) { ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.fill(p); ctx.stroke(p); }
  ctx.restore();
  return true;
}

function draw(ctx, cx, cy, size, s = {}) {
  const st = { t: s.t ?? 0, ti: s.ti ?? 99, rot: s.rot ?? TILT, glow: s.glow ?? 0.18, signal: !!s.signal };
  if (!forceSvg && drawGL(ctx, cx, cy, size, st)) return 'webgl';
  drawSvg(ctx, cx, cy, size, st);
  return 'svg';
}

const PulseRing = {
  draw,
  TILT,
  spin: t => t * 0.35,
  glow: t => 0.14 + 0.38 * (0.5 + 0.5 * Math.sin(t * 2.2)),
  get mode() { return forceSvg || (!initGL()) ? 'svg' : 'webgl'; },
};
window.PulseRing = PulseRing;
