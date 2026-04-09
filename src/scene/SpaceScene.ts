import * as THREE from 'three';
import { buildUniverse } from '../world/generate';
import { StarField } from '../objects/StarField';
import { Earth } from '../objects/Earth';
import { FeaturedStar } from '../objects/FeaturedStar';
import { Nebula } from '../objects/Nebula';

export class SpaceScene {
  readonly root = new THREE.Scene();
  readonly earth: Earth;
  readonly starField: StarField;
  readonly featuredStars: FeaturedStar[] = [];
  readonly nebulae: Nebula[] = [];

  private sun: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private elapsed = 0;

  constructor(seed: number) {
    this.root.background = new THREE.Color(0x000008);

    const universe = buildUniverse(seed);

    // Background stars
    this.starField = new StarField(universe.bgStars);
    this.root.add(this.starField.points);

    // Nebulae
    for (const nd of universe.nebulae) {
      const n = new Nebula(nd);
      this.nebulae.push(n);
      this.root.add(n.mesh);
    }

    // Earth at origin
    this.earth = new Earth();
    this.root.add(this.earth.group);

    // Earth's "sun" — a simple directional light that also drives the
    // earth atmosphere shader. We park it at a fixed direction so Earth
    // always has a consistent terminator, regardless of where the user
    // actually flies.
    const sunDir = new THREE.Vector3(1, 0.3, 0.4).normalize();
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.8);
    this.sun.position.copy(sunDir.clone().multiplyScalar(100));
    this.sun.target.position.set(0, 0, 0);
    this.root.add(this.sun);
    this.root.add(this.sun.target);
    this.earth.setSunDir(sunDir);

    // Tiny ambient so the dark side isn't pitch-black
    this.ambient = new THREE.AmbientLight(0x0a1026, 0.5);
    this.root.add(this.ambient);

    // Featured stars + planets
    for (const fs of universe.featured) {
      const star = new FeaturedStar(fs);
      this.featuredStars.push(star);
      this.root.add(star.group);
      for (const p of star.planets) this.root.add(p.group);
    }
  }

  update(dt: number, camera: THREE.Camera) {
    this.elapsed += dt;
    this.earth.update(dt, this.elapsed);
    for (const s of this.featuredStars) s.update(dt, this.elapsed);
    for (const n of this.nebulae) n.update(this.elapsed, camera);
  }
}
