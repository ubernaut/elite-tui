# Elite TUI

A clean-room Elite-inspired terminal flight demo built with Deno, Three.js, and the local `deno_tui` Three ASCII
renderer.

<figure>
  <img src="assets/screenshots/startup-help.png" alt="Live Elite TUI startup help overlay capture" width="100%">
  <figcaption>Real 180x54 terminal capture from <code>deno task start</code>: startup help overlay, live Three ASCII scene, scanner, and dashboard. <a href="assets/screenshots/startup-help.png">Open full size</a>.</figcaption>
</figure>

<figure>
  <img src="assets/screenshots/flight-scanner.png" alt="Live Elite TUI flight and scanner capture" width="100%">
  <figcaption>Real 180x54 terminal capture after hiding help: flight view, scanner contacts, target readout, and dashboard telemetry. <a href="assets/screenshots/flight-scanner.png">Open full size</a>.</figcaption>
</figure>

<figure>
  <img src="assets/screenshots/render-options.png" alt="Live Elite TUI render options capture" width="100%">
  <figcaption>Real 180x54 terminal capture after switching ASCII glyph mode and toggling fill rendering. <a href="assets/screenshots/render-options.png">Open full size</a>.</figcaption>
</figure>

<figure>
  <img src="assets/screenshots/hyperspace-reset.png" alt="Live Elite TUI hyperspace jump capture" width="100%">
  <figcaption>Real 180x54 terminal capture after pressing <code>H</code> for a fuel-consuming hyperspace jump. <a href="assets/screenshots/hyperspace-reset.png">Open full size</a>.</figcaption>
</figure>

Run it with:

```sh
deno task start
```

Build the browser version with:

```sh
deno task web:build
```

Then serve `dist/` with any static file server. The browser build uses the vendored `deno_tui` web canvas host plus the
same Three ASCII WebGPU renderer path; browsers without a WebGPU adapter show an in-canvas offline message.

Controls:

- Arrow keys: pitch and roll
- `A` / `D`: yaw
- Left mouse drag in the flight view: mouselook pitch and yaw
- Mouse wheel in the flight view: throttle
- Right click in the flight view: cycle target
- `W` / `S`: throttle
- Space: pulse laser
- `M`: fire missile
- `Tab`: cycle target
- `C`: dock and refit when locked on the station at low speed
- `B` / `V`: buy or sell cargo while docked
- `R`: refuel while docked
- `H`: hyperspace jump or reboot after hull breach
- `P`: pause, or launch after docking
- `?`: show or hide help
- `1` / `2` / `3`: switch ASCII blocks, glyphs, or mixed mode
- `E` / `F` / `I`: toggle edges, fill, or inverted luminance
- `Q`, `Esc`, or `Ctrl+C`: quit

Sound effects use terminal bell cues for laser fire, locks, hits, kills, hyperspace, pause, and control toggles. Disable
them with:

```sh
ELITE_TUI_SOUND=0 deno task start
```

The scanner panel appears when the terminal has enough width and height; compact terminals prioritize the flight view,
help overlay, and dashboard.

Hostile raiders return fire when they close to weapon range. Keep shields up, manage laser heat, use missiles for quick
kills, and dock at the Coriolis station to restore hull, shields, energy, heat, and missile stores.

Docking also opens a small market loop. Buy machinery, jump to the next system, sell for a different local price, and
refuel before leaving the station.

The code intentionally does not copy NES Elite source, ROM, image, or ship data. It uses procedural Three.js geometry
and a local vendored snapshot of `deno_tui`.
