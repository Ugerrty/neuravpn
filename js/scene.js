/* NEURAVPN · hero scene: картонный самолётик.
   Интро: плоский лист-заготовка опускается в кадр, складывается в дротик
   (сгиб по килю, затем крылья — честные повороты панелей вокруг линий
   сгиба), делает петлю с пунктирным следом и паркуется в центре.
   Idle: парение на «воздушных потоках», нос подруливает за курсором,
   при наведении на самолётик — бочка (barrel roll).
   Производительность (Intel HD 4000): в модели 12 вершин, вершины
   обновляются только 1.2 с складывания, дальше — чистые трансформации;
   matcap без света и PMREM, DPR ≤ 1.25, пауза вне экрана. */
import * as THREE from 'three';

const canvas = document.getElementById('scene');
if (canvas) init(canvas);

function init(canvas) {
  const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;

  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 60);
  camera.position.set(0, 0, 9);

  /* ── утилиты ── */
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (x) => x * x * (3 - 2 * x);
  const outCubic = (x) => 1 - Math.pow(1 - x, 3);
  const inOutCubic = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  /* мягкий тёплый matcap: свет сверху-слева, глубокая тень, тёмный край */
  function makeSoftMatcap() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(40, 0, 220, 256);
    grad.addColorStop(0, '#fffef8');
    grad.addColorStop(.52, '#d8ccb6');
    grad.addColorStop(1, '#63503a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const hl = g.createRadialGradient(84, 68, 6, 84, 68, 118);
    hl.addColorStop(0, 'rgba(255,253,244,.9)');
    hl.addColorStop(1, 'rgba(255,253,244,0)');
    g.fillStyle = hl;
    g.fillRect(0, 0, 256, 256);
    const rim = g.createRadialGradient(128, 128, 88, 128, 128, 128);
    rim.addColorStop(0, 'rgba(58,36,19,0)');
    rim.addColorStop(1, 'rgba(58,36,19,.5)');
    g.fillStyle = rim;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

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

  const softCap = makeSoftMatcap();

  const world = new THREE.Group();
  scene.add(world);
  const craft = new THREE.Group();      /* самолётик */
  world.add(craft);

  /* ── развёртка дротика (плоский «воздушный змей», нос вдоль +Z) ──
     Точки: N нос, T хвост по центру, C конец линии сгиба крыла, W кончик
     крыла. Панели: киль (N,T,C) и крыло (N,C,W) на каждую сторону.
     kind: 0 — на центральной оси (не двигается), 1 — панель киля
     (поворот вокруг оси Z на угол A), 2 — крыло (сначала поворот вокруг
     линии сгиба N→C на угол B, затем общий поворот A). */
  const N = [0, 1.15], T = [0, -.95], C = [.36, -.95], W = [1.05, -.72];
  /* [x, z, kind, side] */
  const meshVerts = [
    /* правый киль */  [N[0], N[1], 0, 1], [T[0], T[1], 0, 1], [C[0], C[1], 1, 1],
    /* правое крыло */ [N[0], N[1], 0, 1], [C[0], C[1], 1, 1], [W[0], W[1], 2, 1],
    /* левый киль */   [N[0], N[1], 0, -1], [-C[0], C[1], 1, -1], [T[0], T[1], 0, -1],
    /* левое крыло */  [N[0], N[1], 0, -1], [-W[0], W[1], 2, -1], [-C[0], C[1], 1, -1],
  ];
  /* чернильные рёбра: киль, сгибы, силуэт */
  const edgeVerts = [
    [N[0], N[1], 0, 1], [T[0], T[1], 0, 1],                     /* киль */
    [N[0], N[1], 0, 1], [C[0], C[1], 1, 1],                     /* сгиб R */
    [N[0], N[1], 0, -1], [-C[0], C[1], 1, -1],                  /* сгиб L */
    [N[0], N[1], 0, 1], [W[0], W[1], 2, 1],                     /* кромка R */
    [W[0], W[1], 2, 1], [C[0], C[1], 1, 1],                     /* законцовка R */
    [C[0], C[1], 1, 1], [T[0], T[1], 0, 1],                     /* хвост R */
    [N[0], N[1], 0, -1], [-W[0], W[1], 2, -1],                  /* кромка L */
    [-W[0], W[1], 2, -1], [-C[0], C[1], 1, -1],                 /* законцовка L */
    [-C[0], C[1], 1, -1], [T[0], T[1], 0, -1],                  /* хвост L */
  ];

  const FOLD_A = 1.257;   /* 72° — панели киля вверх */
  const FOLD_B = 1.117;   /* 64° — крылья обратно вниз, диэдр ≈ 8° */

  const vA = new THREE.Vector3();
  const creaseDir = new THREE.Vector3();
  const noseV = new THREE.Vector3(N[0], 0, N[1]);

  function foldPoint(def, A, B, out) {
    const [x, z, kind, side] = def;
    out.set(x, 0, z);
    if (kind === 2 && B > 0) {          /* крыло вокруг линии сгиба N→C */
      creaseDir.set(side * C[0] - N[0], 0, C[1] - N[1]).normalize();
      out.sub(noseV).applyAxisAngle(creaseDir, -side * B).add(noseV);
    }
    if (kind >= 1 && A > 0) {           /* панель киля вниз вокруг оси Z */
      const ca = Math.cos(-side * A), sa = Math.sin(-side * A);
      const nx = out.x * ca - out.y * sa;
      const ny = out.x * sa + out.y * ca;
      out.x = nx; out.y = ny;
    }
    return out;
  }

  const meshGeo = new THREE.BufferGeometry();
  meshGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(meshVerts.length * 3), 3));
  /* тёплый крем: киль чуть темнее, крылья светлее */
  const colors = new Float32Array(meshVerts.length * 3);
  const cKeel = new THREE.Color('#e3d3af');
  const cWing = new THREE.Color('#f1e7d0');
  meshVerts.forEach((d, i) => {
    const col = d[2] === 2 ? cWing : cKeel;
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  });
  meshGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const plane = new THREE.Mesh(meshGeo, new THREE.MeshMatcapMaterial({
    matcap: softCap, vertexColors: true, flatShading: true, side: THREE.DoubleSide,
  }));
  craft.add(plane);

  /* красный «окунутый в краску» носик: те же панели, обрезанные у носа.
     Точка на линии сгиба движется вместе со сгибом, поэтому kind берём
     по принадлежности ребру развёртки. */
  const TIP = .26;
  const lerp2 = (a, b) => [N[0] + (a - N[0]) * TIP, N[1] + (b - N[1]) * TIP];
  const Qt = lerp2(T[0], T[1]);         /* к хвосту по оси — kind 0 */
  const Qc = lerp2(C[0], C[1]);         /* по сгибу крыла — kind 1 */
  const Qw = lerp2(W[0], W[1]);         /* по кромке — kind 2 */
  const tipVerts = [
    [N[0], N[1], 0, 1], [Qt[0], Qt[1], 0, 1], [Qc[0], Qc[1], 1, 1],
    [N[0], N[1], 0, 1], [Qc[0], Qc[1], 1, 1], [Qw[0], Qw[1], 2, 1],
    [N[0], N[1], 0, -1], [-Qc[0], Qc[1], 1, -1], [Qt[0], Qt[1], 0, -1],
    [N[0], N[1], 0, -1], [-Qw[0], Qw[1], 2, -1], [-Qc[0], Qc[1], 1, -1],
  ];
  const tipGeo = new THREE.BufferGeometry();
  tipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tipVerts.length * 3), 3));
  const tip = new THREE.Mesh(tipGeo, new THREE.MeshMatcapMaterial({
    matcap: softCap, color: 0xb04532, flatShading: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  craft.add(tip);

  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgeVerts.length * 3), 3));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x4b2f1d, transparent: true, opacity: .55 });
  craft.add(new THREE.LineSegments(edgeGeo, edgeMat));

  function writeFold(A, B) {
    const ma = meshGeo.getAttribute('position');
    meshVerts.forEach((d, i) => { foldPoint(d, A, B, vA); ma.setXYZ(i, vA.x, vA.y, vA.z); });
    ma.needsUpdate = true;
    const ea = edgeGeo.getAttribute('position');
    edgeVerts.forEach((d, i) => { foldPoint(d, A, B, vA); ea.setXYZ(i, vA.x, vA.y, vA.z); });
    ea.needsUpdate = true;
    const ta = tipGeo.getAttribute('position');
    tipVerts.forEach((d, i) => { foldPoint(d, A, B, vA); ta.setXYZ(i, vA.x, vA.y, vA.z); });
    ta.needsUpdate = true;
    meshGeo.computeBoundingSphere();
  }
  writeFold(0, 0);
  craft.scale.setScalar(1.22);

  /* ── петля после складывания: путь + пунктирный след ── */
  function swoopPos(u, out) {
    const ang = -Math.PI * .5 + Math.PI * 2.1 * u;
    const r = 2.05 * Math.sin(Math.PI * Math.pow(u, .85)) * (1 - .25 * u);
    out.set(
      Math.cos(ang) * r,
      .55 * (1 - u) + .38 * Math.sin(ang * 1.4) * (1 - u) * u * 2,
      Math.sin(ang) * r * .55
    );
    return out;
  }
  const TRAIL_N = 72;
  const trailArr = new Float32Array(TRAIL_N * 3);
  const tv = new THREE.Vector3();
  for (let i = 0; i < TRAIL_N; i++) {
    swoopPos(i / (TRAIL_N - 1), tv);
    trailArr.set([tv.x, tv.y, tv.z], i * 3);
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailArr, 3));
  trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.PointsMaterial({
    size: .085, map: makeDot('rgba(163,35,24,1)'), color: 0xffffff,
    transparent: true, opacity: .8, depthWrite: false, alphaTest: .1, sizeAttenuation: true,
  });
  world.add(new THREE.Points(trailGeo, trailMat));

  /* ── сеть-набросок вокруг ── */
  const shell = new THREE.Group();
  world.add(shell);

  const NP = 110, SR = 3.1;
  const pts = new Float32Array(NP * 3);
  const vecs = [];
  for (let i = 0; i < NP; i++) {
    const y = 1 - (i / (NP - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const th = i * 2.39996;
    const v = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr)
      .multiplyScalar(SR * (0.92 + hash(i * 7) * 0.18));
    vecs.push(v);
    pts.set([v.x, v.y, v.z], i * 3);
  }
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const pointsMat = new THREE.PointsMaterial({
    size: .13, map: makeDot('rgba(75,47,29,1)'), color: 0xffffff,
    transparent: true, opacity: 0, depthWrite: false, alphaTest: .1, sizeAttenuation: true,
  });
  shell.add(new THREE.Points(ptsGeo, pointsMat));

  const linePos = [];
  for (let i = 0; i < NP; i++) {
    for (let j = i + 1; j < NP; j++) {
      if (vecs[i].distanceTo(vecs[j]) < 1.15) {
        linePos.push(vecs[i].x, vecs[i].y, vecs[i].z, vecs[j].x, vecs[j].y, vecs[j].z);
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  const linesMat = new THREE.LineBasicMaterial({ color: 0x6b4a30, transparent: true, opacity: 0, depthWrite: false });
  shell.add(new THREE.LineSegments(lineGeo, linesMat));

  const accGeo = new THREE.BufferGeometry();
  const accPos = new Float32Array(8 * 3);
  for (let i = 0; i < 8; i++) {
    const v = vecs[Math.floor((i + .5) * NP / 8)];
    accPos.set([v.x, v.y, v.z], i * 3);
  }
  accGeo.setAttribute('position', new THREE.BufferAttribute(accPos, 3));
  const accMat = new THREE.PointsMaterial({
    size: .3, map: makeDot('rgba(163,35,24,1)'), color: 0xffffff,
    transparent: true, opacity: 0, depthWrite: false, alphaTest: .1, sizeAttenuation: true,
  });
  shell.add(new THREE.Points(accGeo, accMat));

  /* ── layout ── */
  function layout() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (w > 1020) {
      world.position.set(2.6, 0, 0);
      world.scale.setScalar(1);
    } else {
      world.position.set(0, 1.15, 0);
      world.scale.setScalar(.62);
    }
  }
  layout();
  addEventListener('resize', layout);

  /* ── взаимодействие ── */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const ndc = new THREE.Vector2();
  let rayDirty = false;
  addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / innerHeight) * 2 - 1;
    if (finePointer) {
      const r = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      rayDirty = true;
    }
  }, { passive: true });

  let scrollT = 0;
  addEventListener('scroll', () => {
    const h = canvas.parentElement.offsetHeight || innerHeight;
    scrollT = Math.min(1, Math.max(0, scrollY / h));
  }, { passive: true });

  let inView = true;
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0 })
    .observe(canvas);

  const raycaster = new THREE.Raycaster();

  /* ── таймлайн интро ── */
  const DRIFT = .75, FOLD_AT = .6, FOLD_DUR = 1.2, SWOOP_AT = 1.95, SWOOP_DUR = 1.55;
  const DONE = SWOOP_AT + SWOOP_DUR;

  let phase = 0;            /* 0 ждём · 1 интро · 2 idle */
  let started = false;
  let animK = 0;            /* время копится только в отрисованных кадрах */
  let prevT = 0;
  let rollT = -10;          /* бочка по наведению */
  const clock = new THREE.Clock();

  const qPath = new THREE.Quaternion();
  const qFrom = new THREE.Quaternion();
  let qFromSet = false;
  const qRoll = new THREE.Quaternion();
  const dummy = new THREE.Object3D();
  const pNow = new THREE.Vector3();
  const pNext = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const IDLE_E = new THREE.Euler(.42, -.95, -.12);
  const qIdle = new THREE.Quaternion().setFromEuler(IDLE_E);

  function finishInstantly() {
    writeFold(FOLD_A, FOLD_B);
    craft.position.set(0, 0, 0);
    pointsMat.opacity = .55;
    linesMat.opacity = .3;
    accMat.opacity = .9;
    trailMat.opacity = 0;
    phase = 2;
  }

  function startIntro() {
    if (started) return;
    started = true;
    if (reduceMotion) { finishInstantly(); return; }
    phase = 1;
  }
  addEventListener('nv:intro', startIntro);
  setTimeout(startIntro, 8000);

  /* стартовая поза: лист высоко, лицом к зрителю */
  craft.position.set(0, 3.1, 0);
  craft.rotation.set(1.0, .3, 0);

  renderer.setAnimationLoop(() => {
    if (!inView || document.hidden) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(t - prevT, .066);
    prevT = t;

    mouse.x += (mouse.tx - mouse.x) * .045;
    mouse.y += (mouse.ty - mouse.y) * .045;

    if (phase === 1) {
      animK += dt;
      const k = animK;

      /* лист опускается, покачиваясь, как падающая бумага */
      const drop = outCubic(clamp01(k / DRIFT));
      craft.position.set(0, 3.1 - 2.55 * drop, 0);
      craft.rotation.set(1.0 - .35 * drop, .3 + .5 * drop, Math.sin(k * 2.4) * .16 * (1 - drop * .5));

      /* складывание: киль, затем крылья */
      const fk = clamp01((k - FOLD_AT) / FOLD_DUR);
      if (fk > 0 && fk < 1.001) {
        const A = FOLD_A * smooth(clamp01(fk / .58));
        const B = FOLD_B * smooth(clamp01((fk - .42) / .58));
        writeFold(A, B);
      }

      /* петля с пунктирным следом */
      const sk = clamp01((k - SWOOP_AT) / SWOOP_DUR);
      if (sk > 0) {
        if (!qFromSet) { qFrom.copy(craft.quaternion); qFromSet = true; }
        const u = inOutCubic(sk);
        swoopPos(u, pNow);
        swoopPos(Math.min(u + .012, 1), pNext);
        craft.position.copy(pNow);
        if (pNext.distanceToSquared(pNow) > 1e-8) {
          dummy.position.copy(pNow);
          dummy.lookAt(pNext);
          qPath.copy(dummy.quaternion);
          /* крен в вираже, затухает к посадке */
          qRoll.setFromAxisAngle(zAxis, -.85 * Math.sin(Math.PI * u));
          qPath.multiply(qRoll);
        }
        /* разгон: ориентация листа плавно перетекает в полётную */
        const blendIn = smooth(clamp01(u / .16));
        if (blendIn < 1) qPath.slerp(qFrom, 1 - blendIn);
        /* к концу петли ориентация перетекает в парковочную */
        qPath.slerp(qIdle, smooth(clamp01((u - .72) / .28)));
        craft.quaternion.copy(qPath);
        trailGeo.setDrawRange(0, Math.floor(u * TRAIL_N));
      }

      /* сеть проявляется во время петли */
      const o = clamp01((k - SWOOP_AT - .3) / .9);
      pointsMat.opacity = .55 * o;
      linesMat.opacity = .3 * o;
      accMat.opacity = .9 * o;

      if (k >= DONE) {
        writeFold(FOLD_A, FOLD_B);
        craft.position.set(0, 0, 0);
        phase = 2;
      }
    } else if (phase === 2) {
      /* след дотаивает */
      if (trailMat.opacity > .01) trailMat.opacity -= dt * .9;
      else trailGeo.setDrawRange(0, 0);

      /* бочка по наведению на самолётик */
      if (rayDirty) {
        rayDirty = false;
        raycaster.setFromCamera(ndc, camera);
        if (t - rollT > 2.6 && raycaster.intersectObject(plane, false).length) {
          rollT = t;
        }
      }
      let roll = 0;
      const rp = (t - rollT) / .95;
      if (rp >= 0 && rp <= 1) roll = Math.PI * 2 * inOutCubic(rp);

      /* парение: лёгкий бобинг, нос подруливает за курсором */
      craft.position.set(
        Math.sin(t * .4) * .12,
        Math.sin(t * .8) * .11,
        0
      );
      craft.rotation.set(
        IDLE_E.x + Math.sin(t * .5) * .06 + mouse.y * .22,
        IDLE_E.y + Math.sin(t * .3) * .18 + mouse.x * .4,
        Math.sin(t * .65) * .08 + mouse.x * .28
      );
      if (roll) craft.rotateZ(roll);
    }

    shell.rotation.y = -t * .05 + mouse.x * .12;
    shell.rotation.x = mouse.y * .08;

    world.rotation.z = scrollT * -.18;
    world.rotation.y = scrollT * .9;
    camera.position.z = 9 + scrollT * 1.4;

    /* self-heal после вырожденного ресайза панели */
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw > 1 && ch > 1 &&
        (canvas.width !== Math.round(cw * DPR) || canvas.height !== Math.round(ch * DPR))) {
      layout();
    }

    renderer.render(scene, camera);
  });
}
