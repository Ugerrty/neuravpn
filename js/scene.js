/* NEURAVPN · hero scene: faceted "neural core" + orbiting particle network.
   MeshMatcapMaterial with a procedurally drawn matcap only — no lights and
   no PMREM environment: real PBR shaders take 30+ seconds to compile on old
   integrated GPUs (Intel HD 4000) and freeze the page; matcap compiles
   instantly and still reads as glossy tech. Particles are Points + static
   LineSegments — the cheapest possible geometry. */
import * as THREE from 'three';

const canvas = document.getElementById('scene');
if (canvas) init(canvas);

function init(canvas) {
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 60);
  camera.position.set(0, 0, 9);

  /* ── procedural matcap: violet→cyan glossy sphere shading ── */
  function makeMatcap(top, mid, low, hl) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(30, 0, 226, 256);
    grad.addColorStop(0, top);
    grad.addColorStop(.5, mid);
    grad.addColorStop(1, low);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const rad = g.createRadialGradient(88, 70, 6, 88, 70, 120);
    rad.addColorStop(0, `rgba(255,255,255,${hl})`);
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, 256, 256);
    const rim = g.createRadialGradient(128, 128, 92, 128, 128, 128);
    rim.addColorStop(0, 'rgba(35,213,255,0)');
    rim.addColorStop(1, 'rgba(35,213,255,.55)');
    g.fillStyle = rim;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const coreCap  = makeMatcap('#c9bcff', '#5b45d6', '#0b1030', .95);
  const darkCap  = makeMatcap('#5a6cff', '#1d2350', '#05070d', .5);

  /* ── glow sprite for particles ── */
  function makeGlow(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rad.addColorStop(0, color);
    rad.addColorStop(.35, color.replace('1)', '.5)'));
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /* ── core group ── */
  const core = new THREE.Group();
  scene.add(core);

  const outer = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.55, 1),
    new THREE.MeshMatcapMaterial({ matcap: coreCap, flatShading: true })
  );
  core.add(outer);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(outer.geometry),
    new THREE.LineBasicMaterial({ color: 0x23d5ff, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  edges.scale.setScalar(1.004);
  core.add(edges);

  const inner = new THREE.Mesh(
    new THREE.OctahedronGeometry(.7, 0),
    new THREE.MeshMatcapMaterial({ matcap: darkCap, flatShading: true })
  );
  core.add(inner);

  /* orbit ring */
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.45, .018, 8, 120),
    new THREE.MeshMatcapMaterial({ matcap: darkCap })
  );
  ring.rotation.x = Math.PI / 2.25;
  ring.rotation.y = .35;
  core.add(ring);

  /* small satellites on the ring */
  const sats = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(
      new THREE.TetrahedronGeometry(.13, 0),
      new THREE.MeshMatcapMaterial({ matcap: coreCap, flatShading: true })
    );
    s.userData.phase = (i / 3) * Math.PI * 2;
    core.add(s);
    sats.push(s);
  }

  /* ── neural shell: points on a sphere + connections ── */
  const shell = new THREE.Group();
  scene.add(shell);

  const N = 130, R = 3.1;
  const pts = new Float32Array(N * 3);
  const vecs = [];
  for (let i = 0; i < N; i++) {
    // fibonacci sphere + jitter → even spread without clumps
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.39996;
    const v = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r)
      .multiplyScalar(R * (0.92 + Math.random() * 0.18));
    vecs.push(v);
    pts.set([v.x, v.y, v.z], i * 3);
  }
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const points = new THREE.Points(ptsGeo, new THREE.PointsMaterial({
    size: .16, map: makeGlow('rgba(160,180,255,1)'), color: 0xaebbff,
    transparent: true, opacity: .9, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  shell.add(points);

  /* connect neighbours once (static geometry — cheap to draw) */
  const linePos = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (vecs[i].distanceTo(vecs[j]) < 1.15) {
        linePos.push(vecs[i].x, vecs[i].y, vecs[i].z, vecs[j].x, vecs[j].y, vecs[j].z);
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
    color: 0x5b6cff, transparent: true, opacity: .16,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  shell.add(lines);

  /* a few bright accent nodes */
  const accGeo = new THREE.BufferGeometry();
  const accPos = new Float32Array(8 * 3);
  for (let i = 0; i < 8; i++) {
    const v = vecs[Math.floor((i + .5) * N / 8)];
    accPos.set([v.x, v.y, v.z], i * 3);
  }
  accGeo.setAttribute('position', new THREE.BufferAttribute(accPos, 3));
  shell.add(new THREE.Points(accGeo, new THREE.PointsMaterial({
    size: .34, map: makeGlow('rgba(35,213,255,1)'), color: 0x23d5ff,
    transparent: true, opacity: .95, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  })));

  /* ── layout: shift composition right on wide screens ── */
  const world = new THREE.Group();
  scene.remove(core, shell);
  world.add(core, shell);
  scene.add(world);

  function layout() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (w > 1020) {
      world.position.set(2.6, 0, 0);
      world.scale.setScalar(1);
    } else {
      world.position.set(0, 1.15, 0);   // above the copy on small screens
      world.scale.setScalar(.62);
    }
  }
  layout();
  addEventListener('resize', layout);

  /* ── interaction ── */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  let scrollT = 0;                       // 0..1 while hero scrolls away
  addEventListener('scroll', () => {
    const h = canvas.parentElement.offsetHeight || innerHeight;
    scrollT = Math.min(1, Math.max(0, scrollY / h));
  }, { passive: true });

  /* pause rendering when the hero is off-screen or the tab is hidden */
  let inView = true;
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0 })
    .observe(canvas);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (!inView || document.hidden) return;
    const t = clock.getElapsedTime();

    mouse.x += (mouse.tx - mouse.x) * .045;
    mouse.y += (mouse.ty - mouse.y) * .045;

    core.rotation.y = t * .18 + mouse.x * .35 + scrollT * 1.6;
    core.rotation.x = Math.sin(t * .12) * .1 + mouse.y * .22;
    inner.rotation.y = -t * .5;
    inner.rotation.z = t * .3;
    const pulse = 1 + Math.sin(t * 1.6) * .035;
    inner.scale.setScalar(pulse);
    edges.material.opacity = .22 + Math.sin(t * 1.6) * .1;

    for (const s of sats) {
      const a = t * .45 + s.userData.phase;
      s.position.set(Math.cos(a) * 2.45, Math.sin(a) * 2.45 * Math.sin(.45), Math.sin(a) * 2.45 * Math.cos(.45));
      s.position.applyEuler(ring.rotation);
      s.rotation.y = t;
    }

    shell.rotation.y = -t * .05 + mouse.x * .12;
    shell.rotation.x = mouse.y * .08;

    world.rotation.z = scrollT * -.18;
    camera.position.z = 9 + scrollT * 1.4;

    renderer.render(scene, camera);
  });
}
