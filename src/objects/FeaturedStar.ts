import * as THREE from 'three';
import type { FeaturedStarData } from '../world/generate';
import {
  CORONA_FRAG,
  CORONA_VERT,
  STAR_SURFACE_FRAG,
  STAR_SURFACE_VERT,
} from '../shaders/starCorona';
import { ProceduralPlanet } from './ProceduralPlanet';

export class FeaturedStar {
  readonly group = new THREE.Group();
  readonly planets: ProceduralPlanet[] = [];
  readonly data: FeaturedStarData;
  private surfaceUniforms: Record<string, { value: unknown }>;
  private coronaUniforms: Record<string, { value: unknown }>;
  private light: THREE.PointLight;

  // Raycast helper — a large invisible sphere so the label system
  // picks up the star from far away.
  readonly raycastTarget: THREE.Mesh;

  constructor(data: FeaturedStarData) {
    this.data = data;
    this.group.position.copy(data.position);

    // Surface
    this.surfaceUniforms = {
      uColor: { value: data.color.clone() },
      uTime: { value: 0 },
    };
    const surfaceMat = new THREE.ShaderMaterial({
      vertexShader: STAR_SURFACE_VERT,
      fragmentShader: STAR_SURFACE_FRAG,
      uniforms: this.surfaceUniforms,
    });
    const surface = new THREE.Mesh(
      new THREE.SphereGeometry(data.radius, 64, 48),
      surfaceMat,
    );
    this.group.add(surface);

    // Corona
    this.coronaUniforms = {
      uColor: { value: data.color.clone() },
      uTime: { value: 0 },
    };
    const coronaMat = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERT,
      fragmentShader: CORONA_FRAG,
      uniforms: this.coronaUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(data.radius * 1.9, 48, 32),
      coronaMat,
    );
    this.group.add(corona);

    // Point light with generous range (compressed universe)
    this.light = new THREE.PointLight(
      data.color,
      data.intensity * 150,
      data.radius * 80,
      1.5,
    );
    this.group.add(this.light);

    // Invisible larger sphere for easy raycast targeting
    this.raycastTarget = new THREE.Mesh(
      new THREE.SphereGeometry(data.radius * 2.0, 16, 12),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.raycastTarget.userData.star = data;
    this.group.add(this.raycastTarget);

    // Planets — positions computed in update()
    for (const pd of data.planets) {
      const planet = new ProceduralPlanet(pd, data.color, data.position);
      this.planets.push(planet);
    }
  }

  update(dt: number, elapsed: number) {
    this.surfaceUniforms.uTime.value = elapsed;
    this.coronaUniforms.uTime.value = elapsed;
    for (const p of this.planets) p.update(dt, elapsed);
  }
}
