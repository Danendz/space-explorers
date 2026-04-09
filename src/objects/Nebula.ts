import * as THREE from 'three';
import type { NebulaData } from '../world/generate';
import { NEBULA_FRAG, NEBULA_VERT } from '../shaders/nebula';

export class Nebula {
  readonly mesh: THREE.Mesh;
  private uniforms: Record<string, { value: unknown }>;

  constructor(data: NebulaData) {
    this.uniforms = {
      uColor: { value: data.color.clone() },
      uSeed: { value: data.seed % 1000 },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(data.size, data.size);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(data.position);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  update(elapsed: number, camera: THREE.Camera) {
    this.uniforms.uTime.value = elapsed;
    // Keep facing the camera (billboard).
    this.mesh.quaternion.copy(camera.quaternion);
  }
}
