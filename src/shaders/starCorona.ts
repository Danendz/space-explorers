import { NOISE_GLSL } from './lib/noise';

export const CORONA_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vObjPos;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vObjPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const CORONA_FRAG = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vObjPos;
uniform vec3 uColor;
uniform float uTime;

${NOISE_GLSL}

// The corona is the primary HDR source for the outward bloom halo.
// We push the rim color well above 1.0 so the bloom pass picks it up
// and spreads it into a soft surrounding glow. The tight fresnel (pow 3.0)
// keeps the visible polygon concentrated at the silhouette so close range
// doesn't turn into fog.
void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  float fres = 1.0 - max(dot(vNormal, V), 0.0);
  fres = pow(fres, 3.0);

  vec3 p = normalize(vObjPos);
  float flow = fbm(p * 3.0 + vec3(uTime * 0.15, uTime * 0.1, -uTime * 0.12), 5);
  flow = 0.5 + 0.5 * flow;

  // Alpha stays moderate — the corona shouldn't fog the view.
  float a = fres * (0.35 + flow * 0.4);

  // HDR color: 3.5–6.0× uColor at the rim. Heavily tinted toward the
  // star's spectral color so red stars bleed red, blue stars bleed blue.
  vec3 col = uColor * (3.5 + flow * 2.5);

  gl_FragColor = vec4(col * a, a * 0.72);
}
`;

export const STAR_SURFACE_VERT = /* glsl */ `
varying vec3 vObjPos;
void main() {
  vObjPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const STAR_SURFACE_FRAG = /* glsl */ `
varying vec3 vObjPos;
uniform vec3 uColor;
uniform float uTime;

${NOISE_GLSL}

// HDR-peak strategy:
//   - Cool / mid surface stays at ~0.5-0.9 (below bloom threshold, visible as
//     textured surface close up).
//   - Only the narrow "hot" noise peaks are pushed well above 1.0 so they
//     trip the bloom threshold and flare dramatically without washing out
//     the rest of the disc.
void main() {
  vec3 p = normalize(vObjPos);
  float n = fbm(p * 4.0 + vec3(uTime * 0.25, 0.0, uTime * 0.18), 5);
  float hot = smoothstep(-0.2, 0.6, n);

  // Base: textured surface that stays perceptually visible close up.
  vec3 col = mix(uColor * 0.45, uColor * 1.05 + vec3(0.05), hot);

  // Narrow HDR hot peaks — only the top fraction (pow^6) gets a big boost
  // into the 5.0–7.5 range so bloom picks them up selectively. Warm-white
  // core color so the hot spots flare bright while the rest of the disc
  // keeps the star's spectral hue.
  float peak = pow(hot, 6.0);
  col += vec3(1.0, 0.92, 0.78) * peak * 7.0;

  // Mid-range warmth — pushes more of the surface above 1.0 so the inner
  // corona reads as continuously bright instead of just a few hot dots.
  col += uColor * pow(hot, 2.5) * 0.55;

  gl_FragColor = vec4(col, 1.0);
}
`;
