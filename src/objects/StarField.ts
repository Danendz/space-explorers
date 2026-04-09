import * as THREE from 'three';
import type { BgStarsData } from '../world/generate';
import { STAR_FRAG, STAR_VERT } from '../shaders/starField';

export class StarField {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;

  constructor(data: BgStarsData) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geom.setAttribute('aColor', new THREE.BufferAttribute(data.colors, 3));
    geom.setAttribute('aSize', new THREE.BufferAttribute(data.sizes, 1));
    // Large bounding sphere so frustum culling doesn't drop us.
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSizeScale: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geom, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -2;
  }
}
