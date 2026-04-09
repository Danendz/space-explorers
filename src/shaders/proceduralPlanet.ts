import { NOISE_GLSL } from './lib/noise';

export const PLANET_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vObjPos;
varying vec3 vWorldPos;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vObjPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const PLANET_FRAG = /* glsl */ `
varying vec3 vNormal;
varying vec3 vObjPos;
varying vec3 vWorldPos;

uniform vec3 uColorA;  // deep
uniform vec3 uColorB;  // mid
uniform vec3 uColorC;  // high
uniform vec3 uSunPos;   // world-space sun
uniform vec3 uSunColor;
uniform float uFreq;
uniform float uAmp;
uniform float uSeed;
uniform float uGas;     // 1.0 = gas giant, 0.0 = rocky
uniform float uTime;

${NOISE_GLSL}

void main() {
  vec3 p = normalize(vObjPos);
  vec3 seedOffset = vec3(uSeed * 0.731, uSeed * 1.317, uSeed * 2.113);

  float h;
  if (uGas > 0.5) {
    // Gas giant: horizontal bands driven by latitude + swirly noise
    float bands = sin(p.y * uFreq * 4.0 + fbm(p * 1.5 + seedOffset, 4) * 2.0);
    float swirl = fbm(vec3(p.x * 3.0, p.y * 8.0, p.z * 3.0) + vec3(uTime * 0.04, 0.0, 0.0) + seedOffset, 5) * 0.5;
    h = bands * 0.5 + swirl;
  } else {
    // Rocky: fbm elevation
    float base = fbm(p * uFreq + seedOffset, 6) * uAmp;
    float detail = fbm(p * uFreq * 3.0 + seedOffset * 1.7, 4) * 0.25;
    h = base + detail;
  }

  float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
  vec3 col;
  if (t < 0.5) {
    col = mix(uColorA, uColorB, t * 2.0);
  } else {
    col = mix(uColorB, uColorC, (t - 0.5) * 2.0);
  }

  // Fake normal perturbation for rocky surfaces (tangent-ish bumping)
  vec3 N = normalize(vNormal);
  if (uGas < 0.5) {
    float dx = fbm(p * uFreq * 2.0 + vec3(0.1, 0.0, 0.0) + seedOffset, 4)
             - fbm(p * uFreq * 2.0 - vec3(0.1, 0.0, 0.0) + seedOffset, 4);
    float dy = fbm(p * uFreq * 2.0 + vec3(0.0, 0.1, 0.0) + seedOffset, 4)
             - fbm(p * uFreq * 2.0 - vec3(0.0, 0.1, 0.0) + seedOffset, 4);
    N = normalize(N + vec3(dx, dy, 0.0) * 0.35);
  }

  // Lighting from world-space sun position
  vec3 L = normalize(uSunPos - vWorldPos);
  vec3 Lview = normalize(mat3(viewMatrix) * L);
  float lambert = max(dot(N, Lview), 0.0);
  float ambient = 0.06;

  vec3 lit = col * (ambient + lambert) * uSunColor;

  // Slight rim glow
  vec3 V = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - max(dot(normalize(vNormal), V), 0.0), 3.5);
  lit += uSunColor * rim * 0.15;

  gl_FragColor = vec4(lit, 1.0);
}
`;
