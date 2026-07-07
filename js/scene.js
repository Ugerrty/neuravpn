/* NEURAVPN · hero scene: самолётик из ГОФРОКАРТОНА в позе логотипа Telegram.
   Модель — четыре толстые панели (крафт-лайнеры сверху/снизу + волнистая
   гофра на срезах, как у настоящей картонной коробки), сшитые шарнирами
   по линиям сгиба. Интро: вырезанная заготовка опускается в кадр,
   с лёгким пружинным «щелчком» складывается (корпус, затем крылья),
   плавной дугой с красным пунктирным следом заходит на парковку и
   бесшовно перетекает в позу логотипа: последние 30% полёта позиция и
   ориентация интерполируются к живой idle-позе — той же функции, что
   работает дальше. Idle: держит позу, только слегка покачивается.
   Производительность (Intel HD 4000): ~13 draw calls, шарниры — O(1)
   на кадр, после интро только transform-анимации; matcap без света и
   PMREM (PBR компилируется 30+ с на старых GPU), DPR ≤ 1.25. */
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
  /* сгиб с лёгкой пружиной: замах в начале, перелёт и досадка в конце */
  function inOutBack(x) {
    const c = 1.15, c2 = c * 1.525;
    return x < .5
      ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
      : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (2 * x - 2) + c2) + 2) / 2;
  }
  function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  /* ── мягкий тёплый matcap: студийный свет сверху-слева ── */
  function makeSoftMatcap() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(40, 0, 220, 256);
    grad.addColorStop(0, '#fffef8');
    grad.addColorStop(.5, '#f2ead9');
    grad.addColorStop(1, '#9c8465');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const hl = g.createRadialGradient(84, 68, 6, 84, 68, 118);
    hl.addColorStop(0, 'rgba(255,253,244,.9)');
    hl.addColorStop(1, 'rgba(255,253,244,0)');
    g.fillStyle = hl;
    g.fillRect(0, 0, 256, 256);
    const rim = g.createRadialGradient(128, 128, 88, 128, 128, 128);
    rim.addColorStop(0, 'rgba(58,36,19,0)');
    rim.addColorStop(1, 'rgba(58,36,19,.4)');
    g.fillStyle = rim;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ── развёртка (плоские координаты, y=0): нос по +Z ── */
  const N = new THREE.Vector2(0, 1.3);      /* нос */
  const T = new THREE.Vector2(0, -1.0);     /* хвост на киле */
  const F = new THREE.Vector2(.33, -1.0);   /* хвост на линии сгиба крыла */
  const WG = new THREE.Vector2(1.25, -.92); /* законцовка крыла */
  const TH = .055;                          /* толщина картона */

  /* ── лицевой слой (лайнер): крафт, волокна, просвечивающая гофра,
     биговки по сгибам и «окунутый в краску» красный нос.
     UV лицевых граней ExtrudeGeometry — сырые координаты развёртки,
     поэтому рисуем текстуру прямо в системе развёртки. ── */
  const DEV_MIN = -1.35, DEV_SPAN = 2.7;    /* охват развёртки по x */
  const DEVZ_MIN = -1.15;                   /* по z */
  function devToPx(x, z) {
    return [ (x - DEV_MIN) / DEV_SPAN * 512, (1 - (z - DEVZ_MIN) / DEV_SPAN) * 512 ];
  }
  function makeLiner() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const base = g.createLinearGradient(0, 0, 512, 512);
    base.addColorStop(0, '#ab7f4d');
    base.addColorStop(.5, '#9e7443');
    base.addColorStop(1, '#916a3c');
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);

    /* гофра просвечивает сквозь лайнер: мягкие полосы поперёк листа */
    for (let y = 0; y < 512; y += 9) {
      g.fillStyle = 'rgba(90,60,30,.05)';
      g.fillRect(0, y, 512, 3.5);
      g.fillStyle = 'rgba(255,240,214,.05)';
      g.fillRect(0, y + 4.5, 512, 2.5);
    }
    /* волокна крафта */
    for (let i = 0; i < 1100; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const len = 5 + Math.random() * 13;
      const ang = (Math.random() - .5) * .55;
      g.strokeStyle = Math.random() > .5
        ? `rgba(232,206,160,${.05 + Math.random() * .08})`
        : `rgba(120,88,52,${.04 + Math.random() * .07})`;
      g.lineWidth = .8 + Math.random() * .9;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
    /* крапинки переработанной массы */
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(80,52,26,${.07 + Math.random() * .12})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    /* биговки (продавленные линии сгиба): тёмный жёлоб + светлый гребень */
    const nPx = devToPx(N.x, N.y), tPx = devToPx(T.x, T.y);
    const creases = [
      [nPx, tPx],
      [nPx, devToPx(F.x, F.y)],
      [nPx, devToPx(-F.x, F.y)],
    ];
    for (const [a, b] of creases) {
      g.strokeStyle = 'rgba(88,58,28,.28)';
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.strokeStyle = 'rgba(240,216,170,.3)';
      g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(a[0] + 2, a[1] + 1); g.lineTo(b[0] + 2, b[1] + 1); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    /* uv лицевых граней = координаты развёртки → нормируем */
    tex.repeat.set(1 / DEV_SPAN, 1 / DEV_SPAN);
    tex.offset.set(-DEV_MIN / DEV_SPAN, -DEVZ_MIN / DEV_SPAN);
    return tex;
  }

  /* ── срез гофрокартона: волна между двумя лайнерами ── */
  function makeFlute() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#b0854f';                    /* внутренность среза */
    g.fillRect(0, 0, 128, 64);
    /* тень в глубине волны */
    for (let x = 0; x < 128; x++) {
      const s = Math.sin((x / 128) * Math.PI * 2);
      g.fillStyle = `rgba(100,66,34,${.16 + .11 * s})`;
      g.fillRect(x, 10, 1, 44);
    }
    /* сама гофра — жирная волна */
    g.strokeStyle = '#6f4c2a';
    g.lineWidth = 7;
    g.beginPath();
    for (let x = -4; x <= 132; x += 2) {
      const y = 32 + Math.sin((x / 128) * Math.PI * 2) * 16;
      x === -4 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(222,190,142,.5)';     /* блик на волне */
    g.lineWidth = 2.2;
    g.beginPath();
    for (let x = -4; x <= 132; x += 2) {
      const y = 29 + Math.sin((x / 128) * Math.PI * 2) * 16;
      x === -4 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    /* кромки лайнеров сверху и снизу среза */
    g.fillStyle = '#7f5a33';
    g.fillRect(0, 0, 128, 7);
    g.fillRect(0, 57, 128, 7);
    g.fillStyle = 'rgba(238,212,168,.3)';
    g.fillRect(0, 7, 128, 1.5);
    g.fillRect(0, 55.5, 128, 1.5);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    /* u — вдоль кромки (волна каждые ~0.12 ед.), v — на толщину среза */
    tex.repeat.set(8.5, 1 / TH);
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
  const linerMat = new THREE.MeshMatcapMaterial({
    matcap: softCap, map: makeLiner(), flatShading: true, side: THREE.DoubleSide,
  });
  const fluteMat = new THREE.MeshMatcapMaterial({
    matcap: softCap, map: makeFlute(), flatShading: true, side: THREE.DoubleSide,
  });

  /* ── панель = толстая призма из развёртки (Shape в (x, devZ)) ──
     ExtrudeGeometry даёт материал-группы: 0 — лицо/изнанка (лайнер),
     1 — стенки среза (гофра). Поворачиваем в плоскость развёртки. */
  const mFold = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  function makePanel(points) {
    const sh = new THREE.Shape();
    sh.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) sh.lineTo(points[i].x, points[i].y);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: TH, bevelEnabled: false });
    geo.applyMatrix4(mFold);                 /* (x,y,z) → (x, z, y): в план */
    geo.translate(0, TH / 2, 0);             /* толщина симметрично */
    return new THREE.Mesh(geo, [linerMat, fluteMat]);
  }

  const world = new THREE.Group();
  scene.add(world);
  /* наклон силуэта в плоскости экрана — «взлетающая» поза логотипа */
  const pose = new THREE.Group();
  pose.scale.x = -1;
  pose.rotation.z = -.22;
  world.add(pose);
  const craft = new THREE.Group();
  pose.add(craft);
  craft.scale.setScalar(1.7);

  /* иерархия сгибов: корпус вокруг оси киля, крыло — вокруг своей биговки */
  const zAxis = new THREE.Vector3(0, 0, 1);
  const dirR = new THREE.Vector3(F.x - N.x, 0, F.y - N.y).normalize();
  const dirL = new THREE.Vector3(-F.x + N.x, 0, F.y - N.y).multiplyScalar(1); dirL.x = -dirR.x; dirL.y = 0; dirL.z = dirR.z;
  const qAlignR = new THREE.Quaternion().setFromUnitVectors(zAxis, dirR);
  const qAlignL = new THREE.Quaternion().setFromUnitVectors(zAxis, dirL);
  const qAlignRInv = qAlignR.clone().invert();
  const qAlignLInv = qAlignL.clone().invert();
  const N3 = new THREE.Vector3(N.x, 0, N.y);

  function buildSide(sign, qAlign, qAlignInv) {
    const bodyHinge = new THREE.Group();
    craft.add(bodyHinge);
    const body = makePanel([
      new THREE.Vector2(0, N.y),
      new THREE.Vector2(0, T.y),
      new THREE.Vector2(sign * F.x, F.y),
    ]);
    bodyHinge.add(body);

    const wingHinge = new THREE.Group();
    wingHinge.position.copy(N3);
    bodyHinge.add(wingHinge);
    const wing = makePanel([
      new THREE.Vector2(0, N.y),
      new THREE.Vector2(sign * F.x, F.y),
      new THREE.Vector2(sign * WG.x, WG.y),
    ]);
    wing.geometry.translate(-N3.x, -N3.y, -N3.z);
    wing.geometry.applyQuaternion(qAlignInv);
    wingHinge.add(wing);
    return { bodyHinge, wingHinge, qAlign, sign, wing };
  }
  const R = buildSide(1, qAlignR, qAlignRInv);
  const L = buildSide(-1, qAlignL, qAlignLInv);

  const FOLD_A = 1.26;    /* корпус вниз ~72° */
  const FOLD_B = 1.12;    /* крылья обратно, лёгкий диэдр */
  const qTmp = new THREE.Quaternion();
  function setFold(a, b) {
    /* корпус ВВЕРХ от нижнего гребня-киля, крылья — вниз от верхних
       биговок: киль висит под крыльями, как у настоящего дротика */
    R.bodyHinge.rotation.z = a;
    L.bodyHinge.rotation.z = -a;
    R.wingHinge.quaternion.copy(R.qAlign).multiply(qTmp.setFromAxisAngle(zAxis, b));
    L.wingHinge.quaternion.copy(L.qAlign).multiply(qTmp.setFromAxisAngle(zAxis, -b));
  }
  setFold(0, 0);

  /* штрихи скорости позади хвоста — комикс-ветер (виден только в позе) */
  const windGeo = new THREE.BufferGeometry();
  windGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -.16, .2, -1.5,  -.16, .2, -1.95,
     .02, .04, -1.62, .02, .04, -2.12,
     .18, .15, -1.55, .18, .15, -1.9,
  ], 3));
  const windMat = new THREE.LineBasicMaterial({ color: 0x4b2f1d, transparent: true, opacity: 0 });
  craft.add(new THREE.LineSegments(windGeo, windMat));

  /* ── дуга захода на парковку: финальный вектор — вверх-вправо,
     ровно в направление носа в позе логотипа ── */
  const flight = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .5, 0),
    new THREE.Vector3(-1.6, .78, .5),
    new THREE.Vector3(-2.1, -.42, .3),
    new THREE.Vector3(-.75, -.62, -.1),
    new THREE.Vector3(0, 0, 0),
  ], false, 'catmullrom', .5);

  const TRAIL_N = 72;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
  {
    const ta = trailGeo.getAttribute('position');
    const tv = new THREE.Vector3();
    for (let i = 0; i < TRAIL_N; i++) {
      flight.getPoint(i / (TRAIL_N - 1), tv);
      ta.setXYZ(i, tv.x, tv.y, tv.z);
    }
  }
  trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.PointsMaterial({
    size: .085, map: makeDot('rgba(163,35,24,1)'), color: 0xffffff,
    transparent: true, opacity: .8, depthWrite: false, alphaTest: .1, sizeAttenuation: true,
  });
  pose.add(new THREE.Points(trailGeo, trailMat));

  /* ── нейросеть-набросок вокруг ── */
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
      world.position.set(2.2, 0, 0);
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

  /* ── поза логотипа Telegram (подобрана визуально): нос вверх-вправо,
     видны верхняя плоскость и киль; движения — минимальные ── */
  const IDLE_E = new THREE.Euler(-.15, 1.05, .1);
  const eTmp = new THREE.Euler();
  const idleP = new THREE.Vector3();
  const idleQ = new THREE.Quaternion();
  function idlePose(t) {
    idleP.set(Math.sin(t * .33) * .05, Math.sin(t * .7) * .08, 0);
    eTmp.set(
      IDLE_E.x + Math.sin(t * .5) * .035 + mouse.y * .07,
      IDLE_E.y + Math.sin(t * .28) * .05 + mouse.x * .1,
      IDLE_E.z + Math.sin(t * .6) * .03 + mouse.x * .05
    );
    idleQ.setFromEuler(eTmp);
  }

  /* ── таймлайн интро ── */
  const DRIFT = .85;
  const FOLD1_AT = .8, FOLD1_DUR = .8;
  const FOLD2_AT = 1.5, FOLD2_DUR = .85;
  const SWOOP_AT = 2.5, SWOOP_DUR = 1.8;
  const DONE = SWOOP_AT + SWOOP_DUR;

  let phase = 0;            /* 0 ждём · 1 интро · 2 idle */
  let started = false;
  let animK = 0;            /* копится только в отрисованных кадрах */
  let prevT = 0;
  let rollT = -10;
  const clock = new THREE.Clock();

  const qPath = new THREE.Quaternion();
  const qFrom = new THREE.Quaternion();
  let qFromSet = false;
  const qRoll = new THREE.Quaternion();
  const dummy = new THREE.Object3D();
  const pNow = new THREE.Vector3();
  const pNext = new THREE.Vector3();

  function finishInstantly() {
    setFold(FOLD_A, FOLD_B);
    idlePose(0);
    craft.position.copy(idleP);
    craft.quaternion.copy(idleQ);
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

  /* стартовая поза: заготовка высоко, почти плашмя к зрителю */
  craft.position.set(0, 3.1, 0);
  craft.rotation.set(1.0, .35, 0);

  function tick(dt, t) {
    mouse.x += (mouse.tx - mouse.x) * .045;
    mouse.y += (mouse.ty - mouse.y) * .045;

    if (phase === 1) {
      animK += dt;
      const k = animK;

      if (k < SWOOP_AT) {
        /* заготовка опускается, тяжело покачиваясь (картон — не бумага),
           и застывает в ракурсе, где складки читаются */
        const drop = outCubic(clamp01(k / DRIFT));
        craft.position.set(0, 3.1 - 2.6 * drop, 0);
        craft.rotation.set(
          1.0 - .3 * drop,
          .35 + .17 * drop + Math.sin(k * .9) * .03,
          Math.sin(k * 1.6) * .1 * (1 - drop * .75)
        );
      }

      /* сгиб 1 — корпус; сгиб 2 — крылья; лёгкая пружина на обоих */
      const f1 = clamp01((k - FOLD1_AT) / FOLD1_DUR);
      const f2 = clamp01((k - FOLD2_AT) / FOLD2_DUR);
      setFold(FOLD_A * inOutBack(f1), FOLD_B * inOutBack(f2));

      /* заход на парковку */
      const sk = clamp01((k - SWOOP_AT) / SWOOP_DUR);
      if (sk > 0) {
        if (!qFromSet) { qFrom.copy(craft.quaternion); qFromSet = true; }
        const u = inOutCubic(sk);
        flight.getPoint(u, pNow);
        flight.getPoint(Math.min(u + .012, 1), pNext);
        if (pNext.distanceToSquared(pNow) > 1e-9) {
          dummy.position.copy(pNow);
          dummy.lookAt(pNext);
          qPath.copy(dummy.quaternion);
          qRoll.setFromAxisAngle(zAxis, -.42 * Math.sin(Math.PI * u));
          qPath.multiply(qRoll);
        }
        const blendIn = smooth(clamp01(u / .14));
        if (blendIn < 1) qPath.slerp(qFrom, 1 - blendIn);
        /* последние 30% — плавно в живую idle-позу (ноль дёрганья) */
        idlePose(t);
        const w = smooth(clamp01((u - .7) / .3));
        craft.position.lerpVectors(pNow, idleP, w);
        qPath.slerp(idleQ, w);
        craft.quaternion.copy(qPath);
        trailGeo.setDrawRange(0, Math.floor(u * TRAIL_N));
      }

      /* сеть проявляется во время захода */
      const o = clamp01((k - SWOOP_AT - .3) / .9);
      pointsMat.opacity = .55 * o;
      linesMat.opacity = .3 * o;
      accMat.opacity = .9 * o;

      if (k >= DONE) {
        setFold(FOLD_A, FOLD_B);
        phase = 2;
      }
    } else if (phase === 2) {
      if (trailMat.opacity > .01) trailMat.opacity -= dt * .7;
      else trailGeo.setDrawRange(0, 0);

      if (rayDirty) {
        rayDirty = false;
        raycaster.setFromCamera(ndc, camera);
        if (t - rollT > 2.6 && raycaster.intersectObjects([R.wing, L.wing], false).length) {
          rollT = t;
        }
      }

      idlePose(t);
      craft.position.copy(idleP);
      craft.quaternion.copy(idleQ);

      /* бочка по наведению — единственный «трюк» в idle */
      const rp = (t - rollT) / .95;
      if (rp >= 0 && rp <= 1) craft.rotateZ(Math.PI * 2 * inOutCubic(rp));

      /* комикс-штрихи ветра за хвостом дышат */
      windMat.opacity = .16 + Math.sin(t * 1.7) * .12;
    }

    shell.rotation.y = -t * .05 + mouse.x * .12;
    shell.rotation.x = mouse.y * .08;

    world.rotation.z = scrollT * -.12;
    camera.position.z = 9 + scrollT * 1.4;

    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw > 1 && ch > 1 &&
        (canvas.width !== Math.round(cw * DPR) || canvas.height !== Math.round(ch * DPR))) {
      layout();
    }

    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(() => {
    if (!inView || document.hidden) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(t - prevT, .066);
    prevT = t;
    tick(dt, t);
  });

  /* dev-хук: скраб таймлайна для визуальной проверки кадров */
  window.__nv = {
    scrub(k) {
      started = true; phase = 1; animK = 0; qFromSet = false;
      trailGeo.setDrawRange(0, 0);
      setFold(0, 0);
      craft.position.set(0, 3.1, 0);
      craft.rotation.set(1.0, .35, 0);
      /* прогоняем таймлайн мелкими шагами до k — состояние честное */
      const step = .03;
      for (let x = 0; x < k; x += step) tick(step, x);
      return renderer.domElement.toDataURL('image/png');
    },
    park() {
      finishInstantly();
      tick(0, 0);
      return renderer.domElement.toDataURL('image/png');
    },
    setPose(x, y, z, tilt) {
      IDLE_E.set(x, y, z);
      if (tilt !== undefined) pose.rotation.z = tilt;
      return this.park();
    },
  };
}
