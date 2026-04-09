import * as THREE from 'three';
import { PLANET_FRAG, PLANET_VERT } from '../shaders/proceduralPlanet';
import type { PlanetData } from '../world/generate';

export class ProceduralPlanet {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private uniforms: Record<string, { value: unknown }>;
  private orbitAngle: number;

  constructor(
    private data: PlanetData,
    starColor: THREE.Color,
    private starWorldPos: THREE.Vector3,
  ) {
    this.orbitAngle = data.orbitPhase;

    const geom = new THREE.SphereGeometry(data.radius, 96, 64);
    this.uniforms = {
      uColorA: { value: data.palette[0].clone() },
      uColorB: { value: data.palette[1].clone() },
      uColorC: { value: data.palette[2].clone() },
      uSunPos: { value: starWorldPos.clone() },
      uSunColor: { value: starColor.clone().multiplyScalar(1.2) },
      uFreq: { value: data.noiseFreq },
      uAmp: { value: data.noiseAmp },
      uSeed: { value: data.seed % 1000 },
      uGas: { value: data.gasGiant ? 1.0 : 0.0 },
      uTime: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms: this.uniforms,
    });
    this.mesh = new THREE.Mesh(geom, this.material);
    this.group.add(this.mesh);

    if (data.rings) {
      const inner = data.radius * 1.4;
      const outer = data.radius * 2.1;
      const ringGeo = new THREE.RingGeometry(inner, outer, 64);
      // Set custom UVs so we can fade toward edges
      const pos = ringGeo.attributes.position;
      const uv = ringGeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const r = Math.sqrt(x * x + y * y);
        uv.setXY(i, (r - inner) / (outer - inner), 0);
      }
      const ringMat = new THREE.MeshBasicMaterial({
        color: data.palette[1].clone().lerp(new THREE.Color(0xffffff), 0.4),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2 + 0.2;
      this.mesh.add(ring);
    }
  }

  update(dt: number, elapsed: number) {
    this.orbitAngle += dt * this.data.orbitSpeed;

    // Orbit in plane defined by orbitAxis
    const axis = this.data.orbitAxis;
    const radial = new THREE.Vector3(1, 0, 0);
    // Build a basis perpendicular to axis
    const right = new THREE.Vector3().crossVectors(axis, radial);
    if (right.lengthSq() < 1e-4) right.set(0, 0, 1);
    right.normalize();
    const forward = new THREE.Vector3().crossVectors(axis, right).normalize();

    const offset = new THREE.Vector3()
      .addScaledVector(right, Math.cos(this.orbitAngle) * this.data.orbit)
      .addScaledVector(forward, Math.sin(this.orbitAngle) * this.data.orbit);

    this.group.position.copy(this.starWorldPos).add(offset);
    this.mesh.rotation.y += dt * 0.1;

    // Update sun pos (follows star) + time
    (this.uniforms.uSunPos.value as THREE.Vector3).copy(this.starWorldPos);
    (this.uniforms.uTime.value as number) = elapsed;
    this.uniforms.uTime.value = elapsed;
  }

  /** Used by ProceduralPlanet.raycast-friendly label attach points. */
  get worldPosition(): THREE.Vector3 {
    return this.group.position;
  }
}
