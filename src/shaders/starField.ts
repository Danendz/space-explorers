export const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
uniform float uPixelRatio;
uniform float uSizeScale;

void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Size attenuated by distance but clamped so distant stars stay visible.
  float dist = max(-mv.z, 1.0);
  gl_PointSize = aSize * uSizeScale * uPixelRatio * (200.0 / dist);
  gl_PointSize = clamp(gl_PointSize, 1.0, 12.0);
}
`;

export const STAR_FRAG = /* glsl */ `
varying vec3 vColor;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  // Soft circular falloff + tight bright core
  float halo = smoothstep(0.5, 0.0, d);
  float core = smoothstep(0.22, 0.0, d);
  float a = halo * 0.55 + core;
  gl_FragColor = vec4(vColor * (0.7 + core * 1.5), a);
}
`;
