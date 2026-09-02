# Washing Machine

A front-loading drum washing machine you can just sit and watch.
Soft-body laundry tumbles, soaks, and gets flung against the drum wall during spin, all in plain Canvas 2D with no dependencies.

**Live demo:** https://skykhs3.github.io/washing-machine/

![Washing machine running a wash cycle](docs/screenshot.png)

## Features

- Full standard cotton course (about 57 minutes) that runs on its own: fill → wash → drain → short spin → two rinses with the same drain and short spin → 10 minute final spin → done, then repeats. The LED shows the time left in the course
- Add T-shirts, socks, towels, and pants (up to 20). Tap the drum to drop a random piece where you tapped
- Water level, tilted water surface, foam, and buoyancy for anything under the surface
- Manual mode with an RPM slider, direction toggle, water toggle, and pause
- Procedural sound driven by the physics: motor hum that follows RPM, a whine at spin speed, sloshing that grows with the swirl, thuds and splashes when laundry lands, fill and drain noise, and an end-of-cycle beep. Mute or set the volume from the panel
- Works on desktop and mobile, English and Korean UI, remembers your load between visits

## Controls

| Control | What it does |
|---|---|
| Laundry buttons / Random | Queue one piece; pieces drop in one at a time |
| Tap the drum | Drop a random piece at the tap point |
| Remove / Empty | Remove the last piece or clear the drum |
| AUTO / MANUAL | Follow the wash program, or take over the motor |
| RPM slider, Reverse, Water | Manual mode only (touching them switches to manual) |
| Pause, Skip stage | Freeze everything, or jump to the next stage in AUTO |
| Sound, volume slider | Mute or set the level. Sound starts after your first tap or key press (browser rule) |
| Low graphics | Lighter rendering for slow devices (see below) |
| × / Controls | Close the panel, or bring it back with the Controls button |
| Space, ← →, ↑ ↓, A, S, Esc | Pause, direction, RPM ±5, mode toggle, skip stage, toggle panel |

## Wash program

Timings follow a typical standard cotton course on a household front loader.

| Stage | Length | Drum | Water |
|---|---|---|---|
| Fill | 3 min | stopped | fills to 35 % |
| Wash | 18 min | 45 RPM, 12 s each way with 3 s pauses | 35 % |
| Drain | 1.5 min | stopped | drains |
| Spin | 2 min | 60 RPM to distribute, 120 RPM, coast down | empty |
| Fill / Rinse / Drain / Spin | 2.5 / 5 / 1.5 / 2 min | as above | 30 % |
| Fill / Rinse / Drain | 2.5 / 5 / 1.5 min | as above | 30 % |
| Final spin | 10 min | 60 → 120 → 200 RPM, 1 min coast down | empty |
| Done | 2 min | stopped | empty |

Total: about 57 minutes, then the course starts again. The RPM shown is the simulated drum speed. Real spin speeds (800 ~ 1200 RPM) cannot be shown meaningfully at 60 fps, so the final spin runs at 200 RPM. Anything above ~60 RPM already pins the laundry to the wall because the drum radius and gravity are scaled like a real 50 cm drum.

## How it works

- **Laundry** is a small grid of particles joined by distance constraints (structural plus diagonal shear) and solved with position-based dynamics on top of Verlet integration. Wet laundry gets heavier, floppier, and darker.
- **The drum** is a circular boundary with three lifter capsules that rotate with it. Contacts get Coulomb friction against the moving wall, so at low speed clothes ride up the wall and fall, and at high speed the centripetal term keeps them pinned.
- **Water** applies buoyancy and drag below a surface that tilts and swirls with the drum. Foam and bubbles are purely visual.
- **Sound** is synthesised with the Web Audio API from two oscillators and one noise buffer. Motor pitch and level follow RPM and load, slosh level follows the water swirl and how fast laundry moves through the water, and each landing after time in the air fires a one-shot thud (or a splash under the surface) scaled by approach speed and wetness.
- **Rendering** uses one canvas. The machine body, back plate, glass, and LED display are cached offscreen. Fast rotation is drawn as a running average of sub-frame poses cross-faded into a pre-blurred back plate so the hole pattern never strobes.

## Run locally

ES modules do not load from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Add `?debug` to the URL for particles, constraints, lifter capsules, and frame timings. Add `?reset` to clear saved state.

## Project layout

```
index.html, style.css      page and overlay UI
src/main.js                loop, fixed-step accumulator, app state
src/config.js              tuning constants, wash program, laundry types
src/cycle.js               wash program state machine
src/physics/               world (SoA particles), soft bodies, drum, water, motor, spatial hash
src/render/                viewport, body, back plate, water, laundry, lifters, foam, glass, HUD
src/ui/                    panel, laundry picker, panel toggle, tap input, localStorage
```

## Browser support

Any recent browser with ES modules, `ResizeObserver`, `Path2D`, and Pointer Events.

**Low graphics** is a rendering preset for slow devices. It caps the canvas at 1x device pixels, skips the fabric patterns on the laundry, halves the foam, drops the sub-frame motion blur, and limits the load to 12 items. The physics is unchanged. It turns on by itself when the browser reports 4 or fewer cores or 4 GB or less of memory, or when the first seconds run slower than about 45 fps. The toggle in the panel overrides the automatic choice and is remembered.

## License

MIT
