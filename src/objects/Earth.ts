import * as THREE from 'three';
import { EARTH_RADIUS } from '../config';
import { ATMOSPHERE_FRAG, ATMOSPHERE_VERT } from '../shaders/earthAtmosphere';
import { EARTH_PROC_FRAG, EARTH_PROC_VERT } from '../shaders/earthSurface';

/**
 * Earth anchor planet.
 *
 * Tries to load NASA-style textures from public/textures/. If any are missing
 * it falls back to a procedural shader Earth so the scene still looks good
 * on first clone.
 */
export class Earth {
  readonly group = new THREE.Group();
  private surfaceMat: THREE.Material;
  private atmosphereMat: THREE.ShaderMaterial;
  private clouds?: THREE.Mesh;
  private cloudsMat?: THREE.MeshStandardMaterial;
  private surfaceShaderUniforms?: { uTime: { value: number } };
  private sunDir = new THREE.Vector3(1, 0.3, 0.5).normalize();

  constructor() {
    const sphereGeo = new THREE.SphereGeometry(EARTH_RADIUS, 128, 96);

    // Async texture load, with procedural fallback up front.
    this.surfaceMat = this.createProceduralSurfaceMat();
    const mesh = new THREE.Mesh(sphereGeo, this.surfaceMat);
    mesh.rotation.x = THREE.MathUtils.degToRad(23.4);
    this.group.add(mesh);

    // Try to upgrade to textured material
    this.tryLoadTextures().then((mat) => {
      if (mat) {
        mesh.material = mat;
        this.surfaceMat.dispose();
        this.surfaceMat = mat;
      }
    });

    // Atmosphere — intensity pushed into HDR range so the rim glow
    // participates in the bloom pass.
    this.atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      uniforms: {
        uSunDir: { value: this.sunDir.clone() },
        uGlowColor: { value: new THREE.Color(0.35, 0.55, 1.0) },
        uIntensity: { value: 2.2 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const atmoGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.07, 64, 48);
    const atmoMesh = new THREE.Mesh(atmoGeo, this.atmosphereMat);
    this.group.add(atmoMesh);

    this.group.rotation.order = 'YXZ';
  }

  private createProceduralSurfaceMat(): THREE.ShaderMaterial {
    const uniforms = {
      uSunDir: { value: this.sunDir.clone() },
      uTime: { value: 0 },
    };
    this.surfaceShaderUniforms = uniforms;
    return new THREE.ShaderMaterial({
      vertexShader: EARTH_PROC_VERT,
      fragmentShader: EARTH_PROC_FRAG,
      uniforms,
    });
  }

  private async tryLoadTextures(): Promise<THREE.MeshStandardMaterial | null> {
    const loader = new THREE.TextureLoader();
    const load = (url: string) =>
      new Promise<THREE.Texture | null>((res) => {
        loader.load(
          url,
          (t) => res(t),
          undefined,
          () => res(null),
        );
      });

    const [day, night, normal, spec, clouds] = await Promise.all([
      load('/textures/earth_day.jpg'),
      load('/textures/earth_night.jpg'),
      load('/textures/earth_normal.jpg'),
      load('/textures/earth_specular.jpg'),
      load('/textures/earth_clouds.jpg'),
    ]);

    // If the critical day texture is missing, stay procedural.
    if (!day) return null;
    day.colorSpace = THREE.SRGBColorSpace;
    if (night) night.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map: day,
      normalMap: normal ?? undefined,
      roughnessMap: spec ?? undefined,
      roughness: spec ? 1 : 0.8,
      metalness: 0,
      emissiveMap: night ?? undefined,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: night ? 1.2 : 0,
    });

    // Night-light blending: only show emissive where unlit.
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         #ifdef USE_EMISSIVEMAP
         float nightFade = smoothstep(-0.1, 0.2, dot(normalize(vNormal), directionalLights[0].direction));
         totalEmissiveRadiance *= (1.0 - nightFade);
         #endif
        `,
      );
    };

    // Add clouds layer
    if (clouds) {
      clouds.colorSpace = THREE.SRGBColorSpace;
      this.cloudsMat = new THREE.MeshStandardMaterial({
        map: clouds,
        transparent: true,
        alphaMap: clouds,
        depthWrite: false,
      });
      this.clouds = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.015, 96, 64),
        this.cloudsMat,
      );
      this.clouds.rotation.x = THREE.MathUtils.degToRad(23.4);
      this.group.add(this.clouds);
    }

    return mat;
  }

  setSunDir(worldDir: THREE.Vector3) {
    this.sunDir.copy(worldDir).normalize();
    (this.atmosphereMat.uniforms.uSunDir.value as THREE.Vector3).copy(
      this.sunDir,
    );
    if (this.surfaceShaderUniforms) {
      (
        (this.surfaceMat as THREE.ShaderMaterial).uniforms.uSunDir
          .value as THREE.Vector3
      ).copy(this.sunDir);
    }
  }

  update(dt: number, elapsed: number) {
    this.group.rotation.y += dt * 0.03;
    if (this.clouds) this.clouds.rotation.y += dt * 0.01;
    if (this.surfaceShaderUniforms) {
      this.surfaceShaderUniforms.uTime.value = elapsed;
    }
  }
}
