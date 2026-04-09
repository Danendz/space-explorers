export const ATMOSPHERE_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// Rendered on a larger sphere with BackSide + additive blending.
// Fresnel-based rim glow biased toward the lit side.
export const ATMOSPHERE_FRAG = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;
uniform vec3 uSunDir;      // direction light comes FROM (toward sun)
uniform vec3 uGlowColor;
uniform float uIntensity;

void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  float rim = 1.0 - max(dot(vNormal, V), 0.0);
  rim = pow(rim, 2.8);

  // Lit side gets more glow, dark side subtle blue haze
  float sunSide = max(dot(normalize(vNormal), normalize(uSunDir)), 0.0);
  float lit = mix(0.15, 1.0, sunSide);

  vec3 col = uGlowColor * rim * uIntensity * lit;
  gl_FragColor = vec4(col, rim * lit);
}
`;
