import { NOISE_GLSL } from './lib/noise';

/**
 * Procedural Earth fallback shader — used when NASA textures aren't
 * dropped into public/textures/. It's not photoreal, but it gives us
 * continents, oceans, ice caps, and a day/night terminator so the
 * anchor planet looks good out of the box.
 */
export const EARTH_PROC_VERT = /* glsl */ `
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

export const EARTH_PROC_FRAG = /* glsl */ `
varying vec3 vNormal;
varying vec3 vObjPos;
varying vec3 vWorldPos;
uniform vec3 uSunDir;
uniform float uTime;

${NOISE_GLSL}

vec3 continents(vec3 p) {
  float base = fbm(p * 1.4, 6);
  float ridges = fbm(p * 3.1 + 17.0, 4) * 0.4;
  float h = base + ridges;

  float lat = abs(p.y);
  float iceMask = smoothstep(0.78, 0.92, lat);

  vec3 deepOcean = vec3(0.02, 0.09, 0.22);
  vec3 shallow   = vec3(0.05, 0.28, 0.45);
  vec3 sand      = vec3(0.78, 0.72, 0.45);
  vec3 grass     = vec3(0.18, 0.42, 0.18);
  vec3 forest    = vec3(0.08, 0.25, 0.10);
  vec3 mountain  = vec3(0.42, 0.36, 0.28);
  vec3 snow      = vec3(0.95, 0.97, 1.0);

  vec3 col;
  if (h < -0.05) col = mix(deepOcean, shallow, smoothstep(-0.3, -0.05, h));
  else if (h < 0.0) col = mix(shallow, sand, smoothstep(-0.05, 0.0, h));
  else if (h < 0.15) col = mix(sand, grass, smoothstep(0.0, 0.08, h));
  else if (h < 0.35) col = mix(grass, forest, smoothstep(0.15, 0.3, h));
  else if (h < 0.55) col = mix(forest, mountain, smoothstep(0.35, 0.5, h));
  else col = mix(mountain, snow, smoothstep(0.5, 0.65, h));

  col = mix(col, snow, iceMask);
  return col;
}

float cloudMask(vec3 p, float t) {
  float n = fbm(p * 2.2 + vec3(t * 0.02, 0.0, 0.0), 5);
  return smoothstep(0.1, 0.55, n);
}

void main() {
  vec3 n = normalize(vObjPos);
  vec3 baseCol = continents(n);

  // City lights: noise-based sparkles where "land"
  float landMask = step(0.0, fbm(n * 1.4, 6));
  float citySparkle = pow(max(fbm(n * 14.0, 4), 0.0), 5.0) * landMask;
  vec3 cityCol = vec3(1.0, 0.85, 0.5) * citySparkle * 2.0;

  // Clouds (procedural, drifting)
  float cl = cloudMask(n, uTime);
  baseCol = mix(baseCol, vec3(1.0), cl * 0.6);

  // Lighting
  vec3 N = normalize(vNormal);
  vec3 L = normalize(mat3(viewMatrix) * uSunDir);
  float lambert = max(dot(N, L), 0.0);
  float ambient = 0.05;

  vec3 day = baseCol * (lambert + ambient);
  vec3 night = cityCol * (1.0 - lambert);

  // Soft terminator bluish glow
  float terminator = smoothstep(0.0, 0.3, lambert) * (1.0 - smoothstep(0.0, 0.6, lambert));
  vec3 term = vec3(0.6, 0.5, 0.35) * terminator * 0.25;

  gl_FragColor = vec4(day + night + term, 1.0);
}
`;
