# Elite TUI

A clean-room Elite-inspired terminal flight demo built with Deno, Three.js, and the local `deno_tui` Three ASCII
renderer.

![Elite TUI cockpit help overlay](assets/screenshots/cockpit-help.svg)

![Elite TUI scanner and render options](assets/screenshots/scanner-render-options.svg)

Run it with:

```sh
deno task start
```

Controls:

- Arrow keys: pitch and roll
- `A` / `D`: yaw
- `W` / `S`: throttle
- Space: pulse laser
- `Tab`: cycle target
- `H`: hyperspace reset
- `P`: pause
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

The code intentionally does not copy NES Elite source, ROM, image, or ship data. It uses procedural Three.js geometry
and a local vendored snapshot of `deno_tui`.
