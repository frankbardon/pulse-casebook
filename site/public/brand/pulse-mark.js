// <pulse-mark> — drop-in, resizable embed of the Pulse 3D logo.
// Needs an import map mapping "three" (see README). Sizes to its own box: set width (and optionally height) with CSS.
//
//   <pulse-mark mark="wave" spin glow signal build></pulse-mark>
//
// Attributes
//   mark      ring | wave | distribution          (default ring)
//   build     play the build-in when it first scrolls into view
//   spin      slow continuous turn
//   glow      breathing emissive glow
//   signal    travelling pulse loop
//   speed     spin speed multiplier                (default 1)
//   tilt      fixed yaw in degrees when not spinning (default 12)
// Methods: el.replay()
import * as THREE from 'three';
import { createMarks } from './pulse-marks.js';

const KEYS = { ring: 'a', wave: 'b', distribution: 'c' };
let marks;

class PulseMark extends HTMLElement {
  static observedAttributes = ['mark'];
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>:host{display:block;position:relative;width:240px;aspect-ratio:1/1;contain:strict}canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block}</style>';
  }
  connectedCallback() {
    if (this._r) { this._start(); return; }
    marks ||= createMarks(THREE);
    const r = this._r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.setClearColor(0x000000, 0);
    r.localClippingEnabled = true;
    this.shadowRoot.appendChild(r.domElement);
    const s = this._scene = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xffffff, 0x1D232A, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 7, 5); s.add(key);
    const fill = new THREE.DirectionalLight(0xfff4e6, 0.5); fill.position.set(-5, 3, -4); s.add(fill);
    this._cam = new THREE.PerspectiveCamera(24, 1, 0.01, 100);
    this._clock = new THREE.Clock();
    this._t0 = null; this._seen = false;
    this._build();
    this._ro = new ResizeObserver(() => this._fit()); this._ro.observe(this);
    this._io = new IntersectionObserver(([e]) => {
      this._visible = e.isIntersecting;
      if (e.isIntersecting && !this._seen) { this._seen = true; this.replay(); }
    }, { threshold: 0.25 });
    this._io.observe(this);
    this._start();
  }
  disconnectedCallback() { this._r && this._r.setAnimationLoop(null); }
  attributeChangedCallback() { if (this._r) { this._build(); this._fit(); } }
  replay() { this._t0 = this._clock.getElapsedTime(); }

  _build() {
    if (this._mk) this._scene.remove(this._mk.group);
    const k = KEYS[this.getAttribute('mark')] || 'a';
    this._mk = marks.builders[k]();
    this._mk.update(0, 99, {});
    const box = new THREE.Box3().setFromObject(this._mk.group);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    this._ext = { x: Math.max(sz.x, sz.z) / 2, y: sz.y / 2, z: Math.max(sz.x, sz.z) / 2 };
    this._mk.group.position.sub(c);
    this._pivot = new THREE.Group(); this._pivot.add(this._mk.group);
    this._scene.add(this._pivot);
    if (!this.hasAttribute('build')) this._t0 = -99;
  }
  _fit() {
    const w = this.clientWidth || 1, h = this.clientHeight || 1;
    this._r.setSize(w, h, false);
    const c = this._cam; c.aspect = w / h;
    const vf = c.fov * Math.PI / 360, hf = Math.atan(Math.tan(vf) * c.aspect);
    const e = this._ext, pad = 1.08;
    const d = Math.max(e.y / Math.tan(vf), e.x / Math.tan(hf)) * pad + e.z;
    c.position.set(0, 0, d); c.lookAt(0, 0, 0); c.updateProjectionMatrix();
    this._render();
  }
  _start() { this._r.setAnimationLoop(() => { if (this._visible !== false) this._render(); }); }
  _render() {
    const t = this._clock.getElapsedTime();
    const ti = this._t0 === null ? 0 : t - this._t0;
    const f = { wave: this.hasAttribute('signal') };
    this._mk.update(t, this.hasAttribute('build') ? ti : 99, f);
    const sp = parseFloat(this.getAttribute('speed') || '1');
    this._pivot.rotation.y = this.hasAttribute('spin') ? t * 0.35 * sp : (parseFloat(this.getAttribute('tilt') ?? '12') * Math.PI / 180);
    const gI = this.hasAttribute('glow') ? 0.14 + 0.38 * (0.5 + 0.5 * Math.sin(t * 2.2)) : 0.18;
    this._mk.mats.forEach(m => m.emissiveIntensity = m.name === 'signal' ? gI * 1.6 + 0.1 : gI);
    this._r.render(this._scene, this._cam);
  }
}
customElements.define('pulse-mark', PulseMark);
