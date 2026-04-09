import * as THREE from 'three';
import type { FeaturedStar } from '../objects/FeaturedStar';

/**
 * Simple crosshair-raycast label: if the center of the screen is pointed
 * at a featured star's target sphere, show its name in the HUD.
 */
export class Labels {
  private el = document.getElementById('star-label')!;
  private raycaster = new THREE.Raycaster();
  private targets: THREE.Object3D[];

  constructor(
    private camera: THREE.Camera,
    stars: FeaturedStar[],
  ) {
    this.raycaster.far = 50000;
    this.targets = stars.map((s) => s.raycastTarget);
  }

  update() {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.raycaster.intersectObjects(this.targets, false);
    if (hits.length > 0) {
      const star = hits[0].object.userData.star as { name: string } | undefined;
      if (star) {
        const worldPos = new THREE.Vector3();
        hits[0].object.getWorldPosition(worldPos);
        const dist = this.camera.position.distanceTo(worldPos);
        this.el.textContent = `${star.name} · ${dist.toFixed(0)} u`;
        this.el.classList.remove('hidden');
        return;
      }
    }
    this.el.classList.add('hidden');
  }
}
