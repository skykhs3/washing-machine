# Washing Machine

A front-loading drum washing machine you can just sit and watch.
Soft-body laundry tumbles, soaks, and gets flung against the drum wall during spin, all in plain Canvas 2D with no dependencies.

**Live demo:** https://skykhs3.github.io/washing-machine/

![Washing machine running a wash cycle](docs/screenshot.png)

## Features

- Full standard cotton course (about 57 minutes) that runs on its own: fill → wash → drain → short spin → two rinses with the same drain and short spin → 10 minute final spin → done, then repeats. The LED shows the time left in the course
- Add T-shirts, socks, towels, and pants (up to 20)
- Water level, tilted water surface, foam, and buoyancy for anything under the surface
- Manual mode with an RPM slider, direction toggle, water toggle, and pause
- Procedural sound driven by the physics, calibrated against the balance of a real front loader: broadband rumble that carries the spin, water in the bubble band pulsed as the lifters scoop it, a fill whose Helmholtz resonance climbs three octaves as the tub fills, a drain pump with its impeller whine and the gurgle of air breaking in, water flung out of a wet load during extraction, inlet valve clicks and the water hammer of the valve closing, the door interlock, thuds and splashes when laundry lands, and an end-of-cycle beep. Mute or set the volume from the panel
- Works on desktop and mobile, English and Korean UI, remembers your load between visits

## Controls

| Control | What it does |
|---|---|
| Laundry buttons / Random | Queue one piece; pieces drop in one at a time |
| Tap the door grip | Works the latch: it clicks in and springs back |
| Tap the console | Keypad beep |
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
- **Water** applies buoyancy and drag below a surface that tilts and swirls with the drum.
- **Foam** is air entrained into a surfactant solution, so it needs both detergent and mechanical work. Entrainment is gated by the Froude number `Fr = w^2 R / g`: below the centrifuging threshold the load rides up the wall and drops back through the water, which drags air under, and above it everything is pinned to the wall and the plunging stops. With the drum scaled like a real 50 cm machine the threshold lands near 60 RPM, so foam peaks around 50 ~ 60 RPM and collapses above that. The amount is a volume integrated as `dV/dt = G(1 - V) - V/tau`, so it climbs to a plateau over tens of seconds instead of growing without bound, and sags once the agitation stops. Filling foams on its own because the incoming jet entrains air, each rinse starts with less surfactant so its foam is weaker and shorter lived, and draining thins the films so the head collapses as the level falls. Individual bubbles rise at a terminal velocity proportional to `r^2` along the *effective* gravity, which is gravity plus the centrifugal term, so at speed they migrate toward the drum axis rather than straight up; they coarsen as `dr/dt = k/r` (Ostwald ripening, mean radius growing like `sqrt(t)`) until the film ruptures. Above the surface the foam is given cohesion so it packs, rides up the wall, and shears off in clumps. The foam does not push back on the laundry or the water.
- Drive it in MANUAL with the water on and sweep the RPM to see the non-monotonic response; `?debug` prints `Fr`, the tumbling gate, the generation rate, and the foam volume.
- **The door** has hinges on the left and the grip on the right. The grip is drawn outside the cached glass layer because it animates: tapping it works the latch, which snaps in and springs back past rest, and fires a click. Tapping the console beeps. Neither changes any state; they are there because a machine you sit and watch should answer when you touch it.
- **Sound** is synthesised with the Web Audio API from oscillators and one noise buffer, which several phase-offset sources read so the beds are not filtered copies of the same signal. The output is opened at load so that just watching has sound; browsers that withhold it until a gesture get a "tap for sound" prompt instead. On iOS the session type is raised to `playback`, because Web Audio otherwise sits in the `ambient` category and is silenced by the hardware mute switch, and the context is resumed from `interrupted` as well as `suspended` so it comes back after a screen lock or a call.
- **What the sound is modelled on.** Levels are set so the A-weighted balance between stages matches a real machine, where extraction is far louder than a tumble wash. Imbalance force grows with the square of the drum speed, so the rumble does too and a spin-up grows instead of arriving at full level. Water noise is confined to the band the Minnaert resonance `f = 3.28/a` gives for the bubble sizes water entrains, roughly 320 Hz to 4 kHz; unbounded noise puts most of its energy above 8 kHz and reads as hiss rather than water. Water is pulsed at the rate the three lifters pass, which is the rhythm a front loader actually has, over the slower rocking of the water body at `sqrt(g/R)/2pi`. The rumble is modulated once per revolution by the load. Pitches are proportional to speed with no constant offset, so timbre brightens with rpm rather than merely transposing; because the drum tops out at 200 rpm, an 11 g extraction against a real machine's 1200 rpm, tonal pitch follows a warped speed that maps the tumble to its true rate and the spin to the pitch of a real extraction, while levels use the unwarped speed. Impacts ring the cabinet as fixed decaying sinusoids rather than a swept tone, wet cloth landing darker and shorter than dry, and splashes add the bubble tones that separate a splash from a noise burst. Hits arriving in the same frame are merged by the incoherent-sum rule, each quieter by `1/sqrt(n)`, instead of being thinned to one.
- **Rendering** uses one canvas. The machine body, back plate, glass, and LED display are cached offscreen. Fast rotation is drawn as a running average of sub-frame poses cross-faded into a pre-blurred back plate so the hole pattern never strobes.

## Run locally

ES modules do not load from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Add `?debug` to the URL for particles, constraints, lifter capsules, frame timings, the foam state, and the audio output state. Add `?reset` to clear saved state.

## Project layout

```
index.html, style.css      page and overlay UI
src/main.js                loop, fixed-step accumulator, app state
src/config.js              tuning constants, wash program, laundry types
src/cycle.js               wash program state machine
src/physics/               world (SoA particles), soft bodies, drum, water, motor, spatial hash
src/render/                viewport, body, back plate, water, laundry, lifters, foam, glass, door handle, HUD
src/ui/                    panel, laundry picker, panel toggle, canvas taps, localStorage
```

## Browser support

Any recent browser with ES modules, `ResizeObserver`, `Path2D`, and Pointer Events.

**Low graphics** is a rendering preset for slow devices. It caps the canvas at 1x device pixels, skips the fabric patterns on the laundry, halves the foam and drops its per-bubble highlights, drops the sub-frame motion blur, and limits the load to 12 items. The physics is unchanged. It turns on by itself when the browser reports 4 or fewer cores or 4 GB or less of memory, or when the first seconds run slower than about 45 fps. The toggle in the panel overrides the automatic choice and is remembered.

## License

MIT
