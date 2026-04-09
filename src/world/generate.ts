import * as THREE from 'three';
import { Rng } from './rng';
import {
  BG_STAR_COUNT,
  BG_STAR_INNER,
  BG_STAR_OUTER,
  FEATURED_COUNT,
  FEATURED_MAX_DIST,
  FEATURED_MIN_DIST,
  FEATURED_MIN_SEP,
  NEBULA_COUNT,
} from '../config';

// Approximate sRGB colors for main-sequence spectral classes.
// Weights control how common each class is in the background field.
const SPECTRAL_CLASSES: Array<{
  name: string;
  color: [number, number, number];
  weight: number;
  sizeMul: number;
}> = [
  { name: 'O', color: [0.62, 0.74, 1.0], weight: 0.01, sizeMul: 1.7 },
  { name: 'B', color: [0.72, 0.82, 1.0], weight: 0.05, sizeMul: 1.5 },
  { name: 'A', color: [0.9, 0.94, 1.0], weight: 0.1, sizeMul: 1.3 },
  { name: 'F', color: [1.0, 1.0, 0.95], weight: 0.15, sizeMul: 1.15 },
  { name: 'G', color: [1.0, 0.96, 0.78], weight: 0.2, sizeMul: 1.0 },
  { name: 'K', color: [1.0, 0.82, 0.55], weight: 0.25, sizeMul: 0.9 },
  { name: 'M', color: [1.0, 0.6, 0.38], weight: 0.24, sizeMul: 0.8 },
];

function pickSpectral(rng: Rng) {
  const r = rng.next();
  let acc = 0;
  for (const s of SPECTRAL_CLASSES) {
    acc += s.weight;
    if (r <= acc) return s;
  }
  return SPECTRAL_CLASSES[SPECTRAL_CLASSES.length - 1];
}

// Fun name generator — not real astronomy, just flavor.
const NAME_PREFIXES = [
  'Keph', 'Vex', 'Orinth', 'Sol', 'Myra', 'Drav', 'Ithil', 'Zent', 'Aur', 'Luma',
  'Thal', 'Nex', 'Qar', 'Oph', 'Yr', 'Vela', 'Hesp', 'Tyr', 'Kal', 'Ner',
];
const NAME_SUFFIXES = [
  'ai', 'on', 'ara', 'is', 'ex', 'or', 'ys', 'um', 'ix', 'an',
];

function makeName(rng: Rng): string {
  const p = rng.pick(NAME_PREFIXES);
  const s = rng.pick(NAME_SUFFIXES);
  const n = rng.int(1, 999);
  return `${p}${s}-${n}`;
}

export interface PlanetData {
  radius: number;
  orbit: number;
  orbitSpeed: number;
  orbitPhase: number;
  orbitAxis: THREE.Vector3;
  gasGiant: boolean;
  palette: [THREE.Color, THREE.Color, THREE.Color];
  noiseFreq: number;
  noiseAmp: number;
  seed: number;
  rings: boolean;
}

export interface FeaturedStarData {
  name: string;
  position: THREE.Vector3;
  color: THREE.Color;
  radius: number;
  intensity: number;
  planets: PlanetData[];
}

export interface BgStarsData {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
}

export interface NebulaData {
  position: THREE.Vector3;
  size: number;
  color: THREE.Color;
  seed: number;
}

export interface Universe {
  bgStars: BgStarsData;
  featured: FeaturedStarData[];
  nebulae: NebulaData[];
}

function generateBgStars(rng: Rng): BgStarsData {
  const positions = new Float32Array(BG_STAR_COUNT * 3);
  const colors = new Float32Array(BG_STAR_COUNT * 3);
  const sizes = new Float32Array(BG_STAR_COUNT);

  const tmp: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < BG_STAR_COUNT; i++) {
    rng.unitVector3(tmp);
    // Distance distribution biased outward (cube root of uniform → volume uniform)
    const u = rng.next();
    const dist =
      BG_STAR_INNER + (BG_STAR_OUTER - BG_STAR_INNER) * Math.cbrt(u);
    positions[i * 3] = tmp[0] * dist;
    positions[i * 3 + 1] = tmp[1] * dist;
    positions[i * 3 + 2] = tmp[2] * dist;

    const sp = pickSpectral(rng);
    // Slight brightness variation
    const brightness = 0.6 + rng.next() * 0.4;
    colors[i * 3] = sp.color[0] * brightness;
    colors[i * 3 + 1] = sp.color[1] * brightness;
    colors[i * 3 + 2] = sp.color[2] * brightness;

    sizes[i] = (1.5 + rng.next() * 3.5) * sp.sizeMul;
  }

  return { positions, colors, sizes, count: BG_STAR_COUNT };
}

function generatePlanets(starRng: Rng, starRadius: number): PlanetData[] {
  const count = starRng.int(1, 4);
  const planets: PlanetData[] = [];
  let lastOrbit = starRadius * 4;
  for (let i = 0; i < count; i++) {
    const gasGiant = starRng.next() < 0.35;
    const radius = gasGiant
      ? starRng.range(6, 14)
      : starRng.range(2, 5);
    const orbit = lastOrbit + starRng.range(30, 80);
    lastOrbit = orbit + radius + 10;

    // Random orbit axis (slight tilt from ecliptic)
    const axis = new THREE.Vector3(
      starRng.range(-0.15, 0.15),
      1,
      starRng.range(-0.15, 0.15),
    ).normalize();

    // Palette: 3 harmonious colors via HSL.
    const baseHue = starRng.next();
    const palette: [THREE.Color, THREE.Color, THREE.Color] = [
      new THREE.Color().setHSL(baseHue, 0.55, 0.2),
      new THREE.Color().setHSL(
        (baseHue + starRng.range(0.02, 0.1)) % 1,
        0.6,
        0.45,
      ),
      new THREE.Color().setHSL(
        (baseHue + starRng.range(0.1, 0.25)) % 1,
        0.7,
        0.75,
      ),
    ];

    planets.push({
      radius,
      orbit,
      orbitSpeed: starRng.range(0.015, 0.05) * (gasGiant ? 0.6 : 1),
      orbitPhase: starRng.range(0, Math.PI * 2),
      orbitAxis: axis,
      gasGiant,
      palette,
      noiseFreq: gasGiant
        ? starRng.range(1.5, 3.5)
        : starRng.range(1.8, 4.5),
      noiseAmp: starRng.range(0.6, 1.2),
      seed: starRng.int(0, 0x7fffffff),
      rings: gasGiant && starRng.next() < 0.5,
    });
  }
  return planets;
}

function generateFeatured(rng: Rng): FeaturedStarData[] {
  const stars: FeaturedStarData[] = [];
  const tmp: [number, number, number] = [0, 0, 0];
  let attempts = 0;

  while (stars.length < FEATURED_COUNT && attempts < 500) {
    attempts++;
    rng.unitVector3(tmp);
    const dist = rng.range(FEATURED_MIN_DIST, FEATURED_MAX_DIST);
    const pos = new THREE.Vector3(
      tmp[0] * dist,
      tmp[1] * dist * 0.3, // flatten toward "galactic plane"
      tmp[2] * dist,
    );

    // Enforce minimum separation
    let ok = true;
    for (const other of stars) {
      if (other.position.distanceTo(pos) < FEATURED_MIN_SEP) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const sp = pickSpectral(rng);
    const starRng = rng.child(stars.length + 1);
    const radius = starRng.range(14, 30) * sp.sizeMul;
    const color = new THREE.Color(sp.color[0], sp.color[1], sp.color[2]);
    const name = makeName(starRng);

    stars.push({
      name,
      position: pos,
      color,
      radius,
      intensity: starRng.range(1.5, 3.5),
      planets: generatePlanets(starRng, radius),
    });
  }

  return stars;
}

function generateNebulae(rng: Rng): NebulaData[] {
  const nebulae: NebulaData[] = [];
  const tmp: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < NEBULA_COUNT; i++) {
    rng.unitVector3(tmp);
    const dist = rng.range(3000, 8000);
    const hue = rng.next();
    nebulae.push({
      position: new THREE.Vector3(
        tmp[0] * dist,
        tmp[1] * dist * 0.4,
        tmp[2] * dist,
      ),
      size: rng.range(1800, 3500),
      color: new THREE.Color().setHSL(hue, 0.75, 0.55),
      seed: rng.int(0, 0x7fffffff),
    });
  }
  return nebulae;
}

export function buildUniverse(seed: number): Universe {
  const rng = new Rng(seed);
  return {
    bgStars: generateBgStars(rng.child(1)),
    featured: generateFeatured(rng.child(2)),
    nebulae: generateNebulae(rng.child(3)),
  };
}
