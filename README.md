# Space Explorers

Free-fly through a procedural stellar neighborhood built with Three.js + TypeScript + Vite.

## Run

```bash
npm install
npm run dev
```

Then open the printed localhost URL.

## Controls

- **Click canvas** — engage pointer lock
- **Mouse** — look around
- **W / A / S / D** — fly forward / strafe
- **Space / Ctrl** — fly up / down
- **Shift** — boost (10×)
- **Scroll** — change base cruise speed
- **Esc** — release pointer lock

## Earth textures

Earth works with procedurally generated fallbacks out of the box, but for the full photo-realistic look drop these files into `public/textures/`:

- `earth_day.jpg` — day diffuse (Blue Marble)
- `earth_night.jpg` — city lights / night side
- `earth_normal.jpg` — normal map
- `earth_specular.jpg` — water/land specular mask
- `earth_clouds.jpg` — cloud alpha layer

Free public-domain textures: https://www.solarsystemscope.com/textures/

The app auto-detects whichever files are present and falls back to shader-generated placeholders for missing ones.

## Architecture

See `src/`:

- `main.ts` — renderer, loop, resize
- `scene/SpaceScene.ts` — owns all world objects
- `controls/FlyControls.ts` — pointer-lock + WASD
- `objects/` — Earth, StarField, FeaturedStar, ProceduralPlanet, Nebula
- `shaders/` — GLSL strings for custom materials
- `world/` — seeded RNG + universe generator
- `ui/` — HUD + hover labels
