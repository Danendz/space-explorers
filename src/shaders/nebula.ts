import { NOISE_GLSL } from './lib/noise';

// Camera-facing quad. Uses UVs as radial coordinates for soft falloff.
export const NEBULA_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const NEBULA_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uSeed;
uniform float uTime;

${NOISE_GLSL}

void main() {
  vec2 uv = vUv - 0.5;
  float r = length(uv) * 2.0;
  if (r > 1.0) discard;

  vec3 seedOffset = vec3(uSeed * 0.31, uSeed * 0.71, uSeed * 1.13);
  vec3 p = vec3(uv * 3.0, uSeed * 0.01);
  float n1 = fbm(p + seedOffset, 6);
  float n2 = fbm(p * 2.3 + seedOffset + vec3(uTime * 0.005, 0.0, 0.0), 5);
  float density = smoothstep(-0.1, 0.7, n1) * (0.5 + n2 * 0.5);

  float edge = 1.0 - smoothstep(0.3, 1.0, r);
  float a = density * edge * 0.55;

  // Color shift by density
  vec3 warm = uColor * 1.4;
  vec3 cool = uColor * 0.5 + vec3(0.02, 0.04, 0.08);
  vec3 col = mix(cool, warm, smoothstep(0.2, 0.85, density));

  gl_FragColor = vec4(col * a, a);
}
`;
