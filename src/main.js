import * as THREE from 'three';
import './styles.css';

const canvas = document.querySelector('#bulltism-canvas');
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.z = 8;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

const clock = new THREE.Clock();
const pointer = new THREE.Vector2();
const scroll = { current: 0, target: 0 };
const palette = [0xef2d22, 0xffdf34, 0x0768b7, 0x35a849, 0xff8f1f];
const LOADER_DURATION = 4;
const IDLE_DELAY = 1.45;
const loaderState = { active: true, released: false };
const idle = { current: 0, target: 0, lastActivity: 0 };
const introLoader = document.querySelector('.intro-loader');
const prizePopup = document.querySelector('.prize-popup');
const prizeClose = document.querySelector('.prize-popup-close');
const prizeClaim = document.querySelector('.prize-popup-claim');
const prizeCopy = document.querySelector('.prize-popup-copy');
const prizeSound = new Audio('/assets/vegetarindo2.mp3');
prizeSound.preload = 'auto';

const imageAssets = [
  { src: '/assets/logo.png', title: 'logo' },
  { src: '/assets/card-uno.jpg', title: 'uno' },
  { src: '/assets/trading-room-a.jpg', title: 'trading' },
  { src: '/assets/empty-court.jpg', title: 'court' },
  { src: '/assets/chosen-one.jpg', title: 'chosen' },
  { src: '/assets/foam-flight.jpg', title: 'espuma' },
  { src: '/assets/grass-juice.jpg', title: 'grama' },
  { src: '/assets/cloud-walk.jpg', title: 'sky' },
  { src: '/assets/candle-bull.jpg', title: 'candle' },
  { src: '/assets/bored-portrait.jpg', title: 'bored' },
  { src: '/assets/blue-book.jpg', title: 'book' },
  { src: '/assets/trading-room-b.jpg', title: 'trading 2' },
];

const background = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2, 80, 80),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPointer: { value: pointer },
      uScroll: { value: 0 },
      uIdle: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec2 uPointer;
      uniform float uScroll;
      uniform float uIdle;

      void main() {
        vUv = uv;
        vec3 p = position;
        float water = 1.0 + uIdle * 3.6;
        float wave = sin((p.x * 10.0) + uTime * 0.9) * 0.012 * water;
        wave += sin((p.y * 13.0) - uTime * 0.7) * 0.01 * water;
        wave += sin(length(p.xy) * 24.0 - uTime * 2.2) * 0.01 * uIdle;
        p.z += wave + (uPointer.x + uPointer.y) * 0.006;
        gl_Position = vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      varying vec2 vUv;
      uniform float uTime;
      uniform vec2 uPointer;
      uniform float uScroll;
      uniform float uIdle;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float lineGrid(float value, float count, float thickness) {
        float d = abs(fract(value * count) - 0.5);
        return smoothstep(thickness, 0.0, d);
      }

      void main() {
        vec2 uv = vUv;
        vec2 center = uv - 0.5;
        float ripple = sin(length(center) * 44.0 - uTime * 2.8) * 0.0028 * uIdle;
        uv += normalize(center + 0.0001) * ripple;
        float n = hash(floor(uv * 260.0 + uTime * 0.15));
        float paper = 0.92 + n * 0.075;
        vec3 color = vec3(paper, paper * 0.985, paper * 0.94);

        float red = lineGrid(uv.x + sin(uv.y * 17.0 + uTime) * 0.002, 7.0, 0.015);
        float yellow = lineGrid(uv.y + sin(uv.x * 19.0 - uTime) * 0.002, 5.0, 0.012);
        float blue = lineGrid(uv.x + uv.y * 0.13 + uScroll * 0.0002, 4.0, 0.011);

        color = mix(color, vec3(0.95, 0.08, 0.05), red * 0.16);
        color = mix(color, vec3(1.0, 0.85, 0.06), yellow * 0.18);
        color = mix(color, vec3(0.02, 0.35, 0.72), blue * 0.13);
        color += vec3(0.11, 0.19, 0.18) * max(0.0, ripple * 160.0) * uIdle;

        float vignette = distance(uv, vec2(0.5));
        color *= 1.06 - vignette * 0.22;

        gl_FragColor = vec4(color, 0.96);
      }
    `,
  }),
);
background.position.z = -4;
scene.add(background);

const idleWaterOverlay = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2, 96, 96),
  new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uIdle: { value: 0 },
      uPointer: { value: pointer },
    },
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uIdle;

      void main() {
        vUv = uv;
        vec3 p = position;
        vec2 c = p.xy;
        float ring = sin(length(c) * 16.0 - uTime * 2.0) * 0.012 * uIdle;
        p.xy += normalize(c + 0.0001) * ring;
        gl_Position = vec4(p.xy, 0.72, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      varying vec2 vUv;
      uniform float uTime;
      uniform float uIdle;
      uniform vec2 uPointer;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 uv = vUv;
        vec2 waveUv = uv;
        waveUv.x += sin(uv.y * 24.0 + uTime * 0.9) * 0.012;
        waveUv.y += cos(uv.x * 30.0 - uTime * 1.1) * 0.012;

        float caustic = sin((waveUv.x + waveUv.y) * 34.0 + uTime * 1.7);
        caustic *= sin((waveUv.x - waveUv.y) * 27.0 - uTime * 1.25);
        caustic = smoothstep(0.42, 0.95, caustic);

        vec2 centerUv = uv - 0.5;
        float centerRipple = sin(length(centerUv) * 46.0 - uTime * 2.4) * 0.5 + 0.5;
        centerRipple *= 1.0 - smoothstep(0.05, 0.72, length(centerUv));

        vec3 water = mix(vec3(0.64, 0.96, 1.0), vec3(0.08, 0.53, 0.72), caustic * 0.55);
        water += vec3(0.45, 0.9, 1.0) * centerRipple * 0.28;

        float alpha = (caustic * 0.2 + centerRipple * 0.08) * uIdle;
        alpha = min(alpha, 0.28);
        alpha *= smoothstep(0.0, 0.35, uIdle);

        gl_FragColor = vec4(water, alpha);
      }
    `,
  }),
);
idleWaterOverlay.renderOrder = 80;
idleWaterOverlay.frustumCulled = false;
scene.add(idleWaterOverlay);

const world = new THREE.Group();
const scribbles = new THREE.Group();
const photoGroup = new THREE.Group();
const crayonGroup = new THREE.Group();
const introGroup = new THREE.Group();
scene.add(world);
scene.add(introGroup);
world.add(scribbles, photoGroup, crayonGroup);
world.visible = false;

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  aspect: window.innerWidth / window.innerHeight,
  frustum: 6,
};

function updateCamera() {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  sizes.aspect = sizes.width / sizes.height;
  sizes.frustum = sizes.aspect > 1 ? 6 : 8.5;
  camera.left = (-sizes.frustum * sizes.aspect) / 2;
  camera.right = (sizes.frustum * sizes.aspect) / 2;
  camera.top = sizes.frustum / 2;
  camera.bottom = -sizes.frustum / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(sizes.width, sizes.height);
}

function makeWobblyMaterial(texture, colorBoost = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: texture },
      uTime: { value: 0 },
      uMouse: { value: pointer },
      uBoost: { value: colorBoost },
      uAlpha: { value: 1 },
      uIdle: { value: 0 },
      uSoftMask: { value: 0 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      uniform vec2 uMouse;
      uniform float uIdle;
      varying vec2 vUv;
      varying float vWobble;

      void main() {
        vUv = uv;
        vec3 p = position;
        float edge = max(abs(p.x), abs(p.y));
        float idleWave = 1.0 + uIdle * 3.2;
        float wobble = sin(p.x * 9.0 + uTime * 1.7) * 0.028 * idleWave;
        wobble += cos(p.y * 11.0 - uTime * 1.2) * 0.022 * idleWave;
        wobble += sin((p.x + p.y) * 15.0 + uTime) * 0.015 * idleWave;
        wobble += sin(length(p.xy) * 18.0 - uTime * 2.5) * 0.03 * uIdle;
        p.z += wobble * (0.4 + edge);
        p.x += sin(p.y * 17.0 + uTime * 0.8) * 0.018 * idleWave;
        p.y += cos(p.x * 13.0 - uTime * 0.6) * 0.018 * idleWave;
        vWobble = wobble;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform sampler2D uTexture;
      uniform float uTime;
      uniform float uBoost;
      uniform float uAlpha;
      uniform float uIdle;
      uniform float uSoftMask;
      varying vec2 vUv;
      varying float vWobble;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(41.0, 289.0))) * 9358.5453);
      }

      void main() {
        vec2 uv = vUv;
        float idleWave = 1.0 + uIdle * 5.0;
        vec2 center = uv - 0.5;
        uv.x += sin(uv.y * 34.0 + uTime * 1.5) * 0.004 * idleWave;
        uv.y += cos(uv.x * 28.0 - uTime * 1.1) * 0.004 * idleWave;
        uv += normalize(center + 0.0001) * sin(length(center) * 36.0 - uTime * 2.4) * 0.007 * uIdle;
        vec4 tex = texture2D(uTexture, uv);

        float grain = hash(floor(uv * 500.0 + uTime * 0.4));
        tex.rgb = pow(tex.rgb, vec3(0.92));
        tex.rgb *= 0.94 + grain * 0.13 + abs(vWobble) * 2.0;
        tex.rgb = mix(tex.rgb, tex.rgb * vec3(1.08, 1.02, 0.92), 0.2 * uBoost);
        tex.rgb += vec3(0.08, 0.18, 0.18) * max(0.0, sin((uv.x + uv.y) * 42.0 + uTime * 1.6)) * uIdle * 0.22;

        vec2 maskUv = vUv;
        float edgeDistance = min(min(maskUv.x, 1.0 - maskUv.x), min(maskUv.y, 1.0 - maskUv.y));
        float organicEdge = edgeDistance + sin(maskUv.y * 24.0 + uTime * 0.8) * 0.02 + cos(maskUv.x * 29.0 - uTime * 0.7) * 0.016;
        float edgeMask = smoothstep(0.0, 0.22, organicEdge);
        vec2 blobUv = (maskUv - 0.5) * vec2(1.08, 0.9);
        float blobNoise = sin(maskUv.x * 18.0 + uTime * 0.65) * 0.028 + cos(maskUv.y * 22.0 - uTime * 0.55) * 0.024;
        float blobMask = 1.0 - smoothstep(0.48, 0.68, length(blobUv) + blobNoise);
        float mask = mix(1.0, edgeMask * blobMask, uSoftMask);

        gl_FragColor = vec4(tex.rgb, tex.a * uAlpha * mask);
      }
    `,
  });
}

function createCrayonStroke(index) {
  const points = [];
  const radius = 2.6 + (index % 5) * 0.42;
  const loops = 26 + index * 2;
  for (let i = 0; i < loops; i += 1) {
    const t = i / (loops - 1);
    const angle = t * Math.PI * (1.25 + (index % 3) * 0.35) + index;
    const wobble = Math.sin(t * 24 + index) * 0.16 + Math.cos(t * 17) * 0.08;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * (radius + wobble) + Math.sin(index) * 1.8,
        Math.sin(angle * 0.82) * (radius * 0.38 + wobble) + (index - 5) * 0.62,
        -1.8 - index * 0.02,
      ),
    );
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: palette[index % palette.length],
    transparent: true,
    opacity: 0.36,
  });
  const line = new THREE.Line(geometry, material);
  line.userData = { speed: 0.18 + index * 0.025, baseY: line.position.y };
  return line;
}

function createCrayonDots() {
  const geometry = new THREE.BufferGeometry();
  const count = 550;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 14;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
    positions[i * 3 + 2] = -2.5 - Math.random() * 1.5;
    color.setHex(palette[i % palette.length]);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.035,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.userData = { positions };
  return points;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function releaseLoader() {
  if (loaderState.released) return;

  loaderState.active = false;
  loaderState.released = true;
  introGroup.visible = false;
  world.visible = true;
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-loaded');
  introLoader?.setAttribute('aria-hidden', 'true');
  registerActivity();
  window.setTimeout(() => {
    placePrizePopup();
    prizePopup?.classList.add('is-visible');
  }, 650);
}

function placePrizePopup() {
  if (!prizePopup) return;

  const margin = window.innerWidth < 560 ? 18 : 34;
  const rect = prizePopup.getBoundingClientRect();
  const width = rect.width || 305;
  const height = Math.max(rect.height || 280, 430);
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  const x = margin + Math.random() * Math.max(0, maxX - margin);
  const y = margin + Math.random() * Math.max(0, maxY - margin);
  const tilt = -4 + Math.random() * 8;

  prizePopup.style.setProperty('--prize-x', `${Math.round(x)}px`);
  prizePopup.style.setProperty('--prize-y', `${Math.round(y)}px`);
  prizePopup.style.setProperty('--prize-tilt', `${tilt.toFixed(2)}deg`);
}

prizeClose?.addEventListener('click', () => {
  prizePopup?.classList.remove('is-visible');
});

prizeClaim?.addEventListener('click', () => {
  prizePopup?.classList.add('is-claimed');
  if (prizeCopy) {
    prizeCopy.textContent = 'Payment failed successfully. Your million dollars became one extremely bullish JPEG.';
  }
  prizeClaim.textContent = 'RECEIVED IN VIBES';
  prizeSound.currentTime = 0;
  prizeSound.play().catch(() => {});
});

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

imageAssets.forEach((asset, index) => {
  textureLoader.load(asset.src, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const isBanner = asset.src.includes('banner');
    const ratio = texture.image.width / texture.image.height;
    const width = isBanner ? 4.2 : 1.55 + (index % 3) * 0.16;
    const height = width / ratio;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height, 16, 16),
      makeWobblyMaterial(texture, isBanner ? 1.4 : 1),
    );

    const row = Math.floor(index / 4);
    const col = index % 4;
    mesh.position.x = (col - 1.5) * 2.45 + Math.sin(index * 1.7) * 0.38;
    mesh.position.y = 1.45 - row * 1.78 + Math.cos(index * 2.1) * 0.2;
    mesh.position.z = -0.15 + (index % 5) * 0.03;
    mesh.rotation.z = THREE.MathUtils.degToRad(((index % 2 ? -1 : 1) * (5 + (index % 5) * 3)));
    mesh.userData = {
      baseX: mesh.position.x,
      baseY: mesh.position.y,
      speed: 0.55 + index * 0.05,
      range: 0.05 + (index % 4) * 0.03,
      title: asset.title,
    };

    photoGroup.add(mesh);

    const introWidth = isBanner ? 3.65 : 1.48 + (index % 4) * 0.18;
    const introHeight = introWidth / ratio;
    const introMaterial = makeWobblyMaterial(texture, 1.55);
    introMaterial.depthTest = false;
    introMaterial.depthWrite = false;
    introMaterial.uniforms.uAlpha.value = 0;
    introMaterial.uniforms.uSoftMask.value = 1;

    const introMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(introWidth, introHeight, 18, 18),
      introMaterial,
    );
    introMesh.renderOrder = 30 + index;
    introMesh.rotation.z = THREE.MathUtils.degToRad((index % 2 ? -1 : 1) * (8 + index * 2));
    introMesh.userData = {
      introIndex: index,
      baseRotation: introMesh.rotation.z,
      laneX: Math.sin(index * 1.83) * (0.48 + (index % 3) * 0.18),
      laneY: Math.cos(index * 2.17) * (0.32 + (index % 4) * 0.1),
      maxScale: isBanner ? 2.6 : 3.15 + (index % 3) * 0.35,
    };
    introGroup.add(introMesh);
  });
});

for (let i = 0; i < 13; i += 1) {
  scribbles.add(createCrayonStroke(i));
}
crayonGroup.add(createCrayonDots());

function updateDomWiggle() {
  const letters = document.querySelectorAll('h1 span');
  letters.forEach((letter, index) => {
    letter.style.setProperty('--r', `${Math.sin(index * 5.22) * 7 + (index % 2 ? -4 : 4)}deg`);
    letter.style.setProperty('--y', `${Math.cos(index * 2.3) * 0.09}em`);
    letter.style.setProperty('--c', `var(--color-${(index % 5) + 1})`);
  });
}

function registerActivity() {
  idle.lastActivity = clock.getElapsedTime();
  idle.target = 0;
}

function onPointerMove(event) {
  registerActivity();
  pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
  pointer.y = -(event.clientY / window.innerHeight - 0.5) * 2;
}

function onScroll() {
  registerActivity();
  scroll.target = window.scrollY || document.documentElement.scrollTop;
}

function animateIntro(elapsed) {
  introGroup.visible = true;
  introGroup.rotation.z = Math.sin(elapsed * 1.1) * 0.025;
  introGroup.rotation.x = Math.sin(elapsed * 0.8) * 0.035;
  introGroup.rotation.y = Math.cos(elapsed * 0.7) * 0.035;

  introGroup.children.forEach((mesh, index) => {
    const start = index * 0.22;
    const duration = 1.22;
    const raw = (elapsed - start) / duration;
    const t = THREE.MathUtils.clamp(raw, 0, 1);
    const eased = easeOutCubic(t);
    const visible = raw >= 0 && raw <= 1.04;
    const alphaIn = THREE.MathUtils.smoothstep(t, 0.02, 0.2);
    const alphaOut = 1 - THREE.MathUtils.smoothstep(t, 0.72, 1);
    const alpha = visible ? Math.max(0, Math.min(1, alphaIn * alphaOut)) : 0;
    const endX = mesh.userData.laneX * sizes.frustum * sizes.aspect;
    const endY = mesh.userData.laneY * sizes.frustum;
    const scale = THREE.MathUtils.lerp(0.045, mesh.userData.maxScale, eased * eased);

    mesh.visible = alpha > 0.01;
    mesh.position.x = THREE.MathUtils.lerp(0, endX, eased);
    mesh.position.y = THREE.MathUtils.lerp(0, endY, eased);
    mesh.position.z = 3.2 + index * 0.01;
    mesh.scale.setScalar(scale);
    mesh.rotation.z = mesh.userData.baseRotation + Math.sin(elapsed * 4 + index) * 0.12 + eased * 0.24;
    mesh.material.uniforms.uTime.value = elapsed * 2.2 + index * 0.31;
    mesh.material.uniforms.uAlpha.value = alpha;
  });
}

function animate() {
  const elapsed = clock.getElapsedTime();
  scroll.current += (scroll.target - scroll.current) * 0.08;
  idle.target = !loaderState.active && elapsed - idle.lastActivity > IDLE_DELAY ? 1 : 0;
  idle.current += (idle.target - idle.current) * (idle.target > idle.current ? 0.035 : 0.18);
  const effectiveIdle = loaderState.active ? 0 : idle.current;

  background.material.uniforms.uTime.value = elapsed;
  background.material.uniforms.uScroll.value = scroll.current;
  background.material.uniforms.uIdle.value = effectiveIdle;
  idleWaterOverlay.material.uniforms.uTime.value = elapsed;
  idleWaterOverlay.material.uniforms.uIdle.value = effectiveIdle;

  if (loaderState.active) {
    animateIntro(elapsed);
    if (elapsed >= LOADER_DURATION) {
      releaseLoader();
    }
  }

  world.rotation.z = Math.sin(elapsed * 0.22) * 0.018 + pointer.x * 0.012;
  world.position.y = scroll.current * 0.0015;
  photoGroup.position.y = -scroll.current * 0.003;
  photoGroup.rotation.x = pointer.y * 0.045;
  photoGroup.rotation.y = pointer.x * 0.04;

  photoGroup.children.forEach((mesh, index) => {
    mesh.material.uniforms.uTime.value = elapsed + index;
    mesh.material.uniforms.uIdle.value = effectiveIdle;
    mesh.position.x = mesh.userData.baseX + Math.sin(elapsed * mesh.userData.speed + index) * mesh.userData.range;
    mesh.position.y = mesh.userData.baseY + Math.cos(elapsed * mesh.userData.speed * 0.9 + index) * mesh.userData.range;
    mesh.rotation.z += Math.sin(elapsed + index) * 0.0007;
  });

  scribbles.children.forEach((line, index) => {
    line.rotation.z = Math.sin(elapsed * line.userData.speed + index) * 0.08;
    line.position.y = Math.sin(elapsed * 0.35 + index) * 0.12;
  });

  const dots = crayonGroup.children[0];
  if (dots) {
    dots.rotation.z = elapsed * 0.025;
    dots.rotation.x = Math.sin(elapsed * 0.18) * 0.08;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

updateCamera();
updateDomWiggle();
registerActivity();
window.addEventListener('resize', updateCamera);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('wheel', registerActivity, { passive: true });
window.addEventListener('touchmove', registerActivity, { passive: true });
window.addEventListener('keydown', registerActivity);
animate();
