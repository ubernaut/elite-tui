# Elite TUI

A clean-room Elite-inspired terminal flight demo built with Deno, Three.js, and the local `deno_tui` Three ASCII
renderer.

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

The code intentionally does not copy NES Elite source, ROM, image, or ship data. It uses procedural Three.js geometry
and a local vendored snapshot of `deno_tui`.
