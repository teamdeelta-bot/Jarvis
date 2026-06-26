/* JENNY Orb — animated WebGL energy sphere that reacts to voice + state */
(function () {
  const canvas = document.getElementById('orbCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 3;

  // Color presets per state (neon holographic palette)
  const STATE_COLORS = {
    idle:      new THREE.Color(0xa64bff),
    listening: new THREE.Color(0x2bf5ff),
    thinking:  new THREE.Color(0xff3db1),
    speaking:  new THREE.Color(0xff7be6),
  };

  const uniforms = {
    uTime:      { value: 0 },
    uLevel:     { value: 0 },        // audio amplitude 0..1
    uActive:    { value: 0.15 },     // overall energy
    uColorA:    { value: STATE_COLORS.idle.clone() },
    uColorB:    { value: new THREE.Color(0x2bf5ff) },
    uColorC:    { value: new THREE.Color(0xff3db1) },
  };

  const vertex = `
    varying vec3 vNormal;
    varying vec3 vPos;
    uniform float uTime;
    uniform float uLevel;
    uniform float uActive;

    // simplex-ish noise (cheap)
    vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
    float snoise(vec3 v){
      const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
      vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
      vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
      vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
      i=mod289(i);
      vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
      float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
      vec4 j=p-49.0*floor(p*ns.z*ns.z);
      vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
      vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
      vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
      vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
      vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
      vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
      vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
      return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }

    void main(){
      vNormal = normal;
      float t = uTime * 0.45;
      float energy = uActive + uLevel * 1.4;
      float n = snoise(normal * (1.8 + uLevel*2.0) + vec3(t));
      n += 0.5 * snoise(normal * 4.0 - vec3(t*1.3));
      float disp = n * (0.10 + energy * 0.28);
      vec3 pos = position + normal * disp;
      vPos = pos;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  const fragment = `
    varying vec3 vNormal;
    varying vec3 vPos;
    uniform float uTime;
    uniform float uLevel;
    uniform float uActive;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uColorC;

    void main(){
      vec3 viewDir = normalize(cameraPosition - vPos);
      float fres = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.2);
      float core = smoothstep(0.0, 1.0, dot(normalize(vNormal), viewDir));
      // Iridescent band that shifts across the surface and over time
      float band = sin(vPos.y*3.0 + vPos.x*2.0 + uTime*1.2) * 0.5 + 0.5;
      vec3 irid = mix(uColorA, uColorC, band);
      vec3 col = mix(irid, uColorB, fres);
      col += core * 0.30;
      col += fres * (1.3 + uLevel * 2.2);
      float flicker = 0.9 + 0.1 * sin(uTime*6.0 + vPos.y*8.0);
      col *= flicker;
      float alpha = clamp(fres * 1.5 + core * 0.5 + 0.16, 0.0, 1.0);
      gl_FragColor = vec4(col, alpha);
    }
  `;

  const geo = new THREE.IcosahedronGeometry(1, 48);
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vertex, fragmentShader: fragment,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const orb = new THREE.Mesh(geo, mat);
  scene.add(orb);

  // Inner solid glow core
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x1a0a30, transparent: true, opacity: 0.55 });
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.82, 32, 32), coreMat);
  scene.add(coreMesh);

  // Particle halo
  const pCount = 600;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const r = 1.3 + Math.random() * 0.8;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pPos[i*3]   = r * Math.sin(ph) * Math.cos(th);
    pPos[i*3+1] = r * Math.sin(ph) * Math.sin(th);
    pPos[i*3+2] = r * Math.cos(ph);
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xff9fe8, size: 0.022, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  function resize() {
    const s = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(s, h, false);
    camera.aspect = s / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // Smoothed level
  let level = 0, targetLevel = 0, targetActive = 0.15;
  let targetColor = STATE_COLORS.idle.clone();
  let colorOverride = null; // when set, state changes don't change hue

  const NAMED_COLORS = {
    rot: 0xff3b5b, red: 0xff3b5b,
    blau: 0x1b9dff, blue: 0x1b9dff,
    grün: 0x3affa3, gruen: 0x3affa3, green: 0x3affa3,
    lila: 0xb061ff, violett: 0xb061ff, purple: 0xb061ff,
    pink: 0xff3df0, magenta: 0xff3df0,
    gold: 0xffc14a, gelb: 0xffe24a, yellow: 0xffe24a,
    orange: 0xff8a3a,
    cyan: 0x38e8ff, türkis: 0x38e8ff, tuerkis: 0x38e8ff,
    weiß: 0xeaffff, weiss: 0xeaffff, white: 0xeaffff,
  };

  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    const dt = clock.getDelta();
    uniforms.uTime.value += dt;
    level += (targetLevel - level) * Math.min(1, dt * 12);
    uniforms.uLevel.value = level;
    uniforms.uActive.value += (targetActive - uniforms.uActive.value) * Math.min(1, dt*5);
    uniforms.uColorA.value.lerp(targetColor, Math.min(1, dt * 4));
    orb.rotation.y += dt * 0.25;
    orb.rotation.x += dt * 0.06;
    particles.rotation.y -= dt * 0.12;
    coreMesh.scale.setScalar(0.95 + level * 0.25);
    renderer.render(scene, camera);
  }

  // Public API
  window.JennyOrb = {
    boot() { resize(); loop(); },
    setLevel(v) { targetLevel = Math.max(0, Math.min(1, v)); },
    setState(state) {
      if (!colorOverride) targetColor = (STATE_COLORS[state] || STATE_COLORS.idle).clone();
      targetActive = state === 'idle' ? 0.22 : state === 'listening' ? 0.55 : state === 'thinking' ? 0.72 : 0.95;
    },
    setColor(name) {
      const hex = NAMED_COLORS[String(name).toLowerCase()];
      if (hex == null) return false;
      colorOverride = new THREE.Color(hex);
      targetColor = colorOverride.clone();
      return true;
    },
    resetColor() { colorOverride = null; targetColor = STATE_COLORS.idle.clone(); },
    colorNames: Object.keys(NAMED_COLORS),
  };
})();
