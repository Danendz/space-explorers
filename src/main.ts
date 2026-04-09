import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, MASTER_SEED } from './config';
import { SpaceScene } from './scene/SpaceScene';
import { FlyControls } from './controls/FlyControls';
import { TouchControls } from './controls/TouchControls';
import { isTouchDevice } from './controls/detectTouch';
import { HUD } from './ui/HUD';
import { Labels } from './ui/Labels';
import { AmbientMusic } from './audio/AmbientMusic';
import {
  enterFullscreen,
  isFullscreen,
  toggleFullscreen,
  tryLockLandscape,
} from './ui/fullscreen';

const appEl = document.getElementById('app')!;
const loadingEl = document.getElementById('loading')!;

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
appEl.appendChild(renderer.domElement);

// --- Camera -----------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(
  CAMERA_FOV,
  window.innerWidth / window.innerHeight,
  CAMERA_NEAR,
  CAMERA_FAR,
);
camera.position.set(0, 3, 20);
camera.lookAt(0, 0, 0);

// --- Mode detection ---------------------------------------------------------
const touchMode = isTouchDevice();
if (touchMode) document.body.classList.add('touch-mode');

// --- World ------------------------------------------------------------------
const scene = new SpaceScene(MASTER_SEED);

// --- Controls ---------------------------------------------------------------
const controls = new FlyControls(camera, renderer.domElement, {
  mode: touchMode ? 'touch' : 'desktop',
});

// --- Audio ------------------------------------------------------------------
const music = new AmbientMusic();
let musicStarted = false;

function toggleMusic() {
  if (!musicStarted) {
    music.start();
    musicStarted = true;
  } else {
    music.toggleMute();
  }
  hud.setMuted(music.muted);
}

function nextTrack() {
  // First press also counts as a user gesture for starting music.
  if (!musicStarted) {
    music.start();
    musicStarted = true;
    hud.setMuted(false);
  }
  const name = music.nextTrack();
  hud.setTrackName(name);
  hud.showTrackToast(name);
}

// --- UI ---------------------------------------------------------------------
const hud = new HUD({
  onAudioToggle: toggleMusic,
  onNextTrack: nextTrack,
  onToggleFullscreen: () => void toggleFullscreen(document.documentElement),
});
hud.setTrackName(music.trackName);
if (touchMode) hud.setTouchMode(true);
const labels = new Labels(camera, scene.featuredStars);

// --- Touch controls ---------------------------------------------------------
let touchControls: TouchControls | null = null;
if (touchMode) {
  touchControls = new TouchControls(controls, () => {
    // First touch = dismiss overlay, start music, request fullscreen, lock orientation.
    if (!musicStarted) {
      music.start();
      musicStarted = true;
      hud.setMuted(false);
    }
    document.getElementById('tap-to-explore')?.classList.add('hidden');
    void enterFullscreen(document.documentElement).then(() => tryLockLandscape());
  });
}
void touchControls;

// Pointer lock → HUD (dim panel, hide click-to-start) and music start trigger.
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  hud.setPointerLocked(locked);
  if (locked && !musicStarted) {
    music.start();
    musicStarted = true;
    hud.setMuted(false);
  }
});

// Fullscreen state → HUD icon swap (include webkit prefix for older iOS Safari).
const onFullscreenChange = () => hud.setFullscreen(isFullscreen());
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

// Initial HUD state: pointer lock is off, so show click-to-start and keep
// the instructions panel at full opacity. (No-op in touch mode.)
hud.setPointerLocked(false);

// Keyboard shortcuts: M = mute, N = next track, H = toggle instructions, F = fullscreen.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    if (!musicStarted) {
      music.start();
      musicStarted = true;
    } else {
      music.toggleMute();
    }
    hud.setMuted(music.muted);
  } else if (e.code === 'KeyN') {
    nextTrack();
  } else if (e.code === 'KeyH') {
    hud.toggleInstructions();
  } else if (e.code === 'KeyF') {
    void toggleFullscreen(document.documentElement);
  }
});

// --- Post-processing --------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene.root, camera));
// HDR-peak bloom: high threshold means only the HDR hot-spots (star surface
// peaks, corona rim, Earth atmosphere rim) trigger bloom. The rest of the
// scene stays clean and close-range stars don't whiteout the frame.
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.3, // strength — cinematic glow
  0.85, // radius — wider falloff
  1.0, // threshold — keep at 1.0 so only HDR peaks bloom (no whiteout up close)
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// --- Resize -----------------------------------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', onResize);

// --- Loop -------------------------------------------------------------------
const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  controls.update(dt);
  scene.update(dt, camera);
  hud.update(controls.currentSpeed, camera.position);
  labels.update();
  music.update(dt, controls.effectiveBoost);
  composer.render();
  requestAnimationFrame(tick);
}

// Hide loading overlay once first frame is scheduled.
requestAnimationFrame(() => {
  loadingEl.classList.add('hidden');
  tick();
});
