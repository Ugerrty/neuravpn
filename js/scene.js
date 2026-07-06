/* NEURAVPN · hero scene: faceted "neural core" + orbiting particle network,
   styled as a pencil sketch on paper (like the tg-channel doodles): paper-toned
   matcap shading, brown ink edges/lines, red crayon accent nodes.
   MeshMatcapMaterial with a procedurally drawn matcap only — no lights and
   no PMREM environment: real PBR shaders take 30+ seconds to compile on old
   integrated GPUs (Intel HD 4000) and freeze the page; matcap compiles
   instantly. Particles are Points + static LineSegments — the cheapest
   possible geometry. */
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

  /* ── watercolor matcap: слоистые акварельные заливки.
     Каждое «пятно» — светлая середина и тёмный ободок (пигмент стекает
     к краю мазка), сверху свет, по силуэту — тёмная лужица, плюс
     зернистость бумаги. Так шейдинг шара читается как акварель. ── */
  function makeWatercolor(base, washes, rimColor, rimAlpha) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);

    /* свет сверху-слева — почти сухая бумага */
    const light = g.createRadialGradient(86, 70, 8, 86, 70, 150);
    light.addColorStop(0, 'rgba(252,248,238,.9)');
    light.addColorStop(1, 'rgba(252,248,238,0)');
    g.fillStyle = light;
    g.fillRect(0, 0, 256, 256);

    /* мазки: [x, y, r, stretch, angle, светлый, тёмный, alpha] */
    for (const [x, y, r, st, ang, colMid, colEdge, a] of washes) {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.scale(1, st);
      const wash = g.createRadialGradient(0, 0, r * .1, 0, 0, r);
      wash.addColorStop(0, hexA(colMid, a * .5));
      wash.addColorStop(.62, hexA(colMid, a * .8));
      wash.addColorStop(.86, hexA(colEdge, a));       /* тёмный ободок */
      wash.addColorStop(1, hexA(colEdge, 0));
      g.fillStyle = wash;
      g.beginPath();
      /* неровный контур мазка */
      for (let t = 0; t <= Math.PI * 2 + .01; t += Math.PI / 16) {
        const rr = r * (1 + Math.sin(t * 3.2 + x) * .08 + Math.cos(t * 5.1 + y) * .05);
        const px = Math.cos(t) * rr, py = Math.sin(t) * rr;
        t === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      g.restore();
    }

    /* тёмная лужица пигмента по силуэту сферы */
    const rim = g.createRadialGradient(128, 128, 84, 128, 128, 128);
    rim.addColorStop(0, hexA(rimColor, 0));
    rim.addColorStop(.75, hexA(rimColor, rimAlpha * .45));
    rim.addColorStop(1, hexA(rimColor, rimAlpha));
    g.fillStyle = rim;
    g.fillRect(0, 0, 256, 256);

    /* грануляция — зерно бумаги */
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(75,47,29,${Math.random() * .055})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
  }

  /* светлая сепия для внешнего шара, тёмный крафт для деталей,
     терракотово-красная — акцент на спутниках */
  const coreCap = makeWatercolor('#f3ecdc', [
    [150, 96, 74, .8, .5,  '#d9c09a', '#8a6844', .5],
    [82, 150, 60, 1.1, -.4, '#c8a97e', '#7a5535', .55],
    [190, 178, 66, .9, .9,  '#b3906a', '#5f4426', .6],
    [70, 60, 44, .85, .2,   '#e2cfae', '#a07c52', .4],
    [176, 44, 34, 1, -.7,   '#c96a5a', '#a32318', .16],
  ], '#4b2f1d', .5);

  const darkCap = makeWatercolor('#c2ab8c', [
    [140, 90, 70, .9, .4,  '#a98d69', '#6f5236', .6],
    [90, 168, 62, 1.05, -.5, '#8a6a4f', '#54371f', .65],
    [196, 170, 48, .8, .8, '#77573b', '#3f2814', .55],
  ], '#3a2413', .6);

  const redCap = makeWatercolor('#e6c9ba', [
    [140, 96, 72, .9, .4,  '#c0533f', '#8e1f12', .6],
    [92, 162, 58, 1, -.5,  '#a83a28', '#6e150a', .6],
  ], '#5c150c', .55);

  /* ── crayon dot sprite: неровная точка, как от воскового мелка ── */
  function makeDot(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + .01; a += Math.PI / 14) {
      const r = 22 + Math.sin(a * 5.3) * 3 + Math.cos(a * 3.1) * 2.5;
      const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
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
    new THREE.LineBasicMaterial({ color: 0x4b2f1d, transparent: true, opacity: .55, depthWrite: false })
  );
  edges.scale.setScalar(1.004);
  core.add(edges);

  const inner = new THREE.Mesh(
    new THREE.OctahedronGeometry(.7, 0),
    new THREE.MeshMatcapMaterial({ matcap: darkCap, flatShading: true })
  );
  core.add(inner);

  /* органическое «дыхание» формы: вершины плавно плывут по радиусу.
     Смещение — функция от координаты вершины, поэтому дублированные
     вершины (non-indexed geometry) двигаются одинаково и грани не рвутся;
     та же функция для EdgesGeometry держит чернильный контур на месте. */
  function makeWobbler(geo) {
    const pos = geo.getAttribute('position');
    const base = pos.array.slice();
    return (t) => {
      const a = pos.array;
      for (let i = 0; i < a.length; i += 3) {
        const x = base[i], y = base[i + 1], z = base[i + 2];
        const s = 1 + Math.sin(t * 1.1 + (x * 2.1 + y * 1.7 + z * 2.6) * 2) * .045;
        a[i] = x * s; a[i + 1] = y * s; a[i + 2] = z * s;
      }
      pos.needsUpdate = true;
    };
  }
  const wobbleOuter = makeWobbler(outer.geometry);
  const wobbleEdges = makeWobbler(edges.geometry);

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
      new THREE.MeshMatcapMaterial({ matcap: redCap, flatShading: true })
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
    size: .13, map: makeDot('rgba(75,47,29,1)'), color: 0xffffff,
    transparent: true, opacity: .55, depthWrite: false,
    alphaTest: .1, sizeAttenuation: true,
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
    color: 0x6b4a30, transparent: true, opacity: .3, depthWrite: false,
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
    size: .3, map: makeDot('rgba(163,35,24,1)'), color: 0xffffff,
    transparent: true, opacity: .9, depthWrite: false,
    alphaTest: .1, sizeAttenuation: true,
  })));

  /* ── layout: shift composition right on wide screens ── */
  const world = new THREE.Group();
  scene.remove(core, shell);
  world.add(core, shell);
  scene.add(world);

  function layout() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    if (w < 2 || h < 2) return;   // panel mid-resize can report 0 — skip, heal later
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

    /* self-heal after a degenerate resize (panel dragged to 0 width) */
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw > 1 && ch > 1 &&
        (canvas.width !== Math.round(cw * DPR) || canvas.height !== Math.round(ch * DPR))) {
      layout();
    }

    const t = clock.getElapsedTime();

    mouse.x += (mouse.tx - mouse.x) * .045;
    mouse.y += (mouse.ty - mouse.y) * .045;

    core.rotation.y = t * .18 + mouse.x * .35 + scrollT * 1.6;
    core.rotation.x = Math.sin(t * .12) * .1 + mouse.y * .22;
    inner.rotation.y = -t * .5;
    inner.rotation.z = t * .3;
    const pulse = 1 + Math.sin(t * 1.6) * .035;
    inner.scale.setScalar(pulse);
    edges.material.opacity = .48 + Math.sin(t * 1.6) * .12;

    wobbleOuter(t);
    wobbleEdges(t);
    outer.geometry.computeVertexNormals();

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
