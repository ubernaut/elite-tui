import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "npm:three@0.183.2";

import {
  Box,
  Computed,
  emptyStyle,
  Frame,
  handleInput,
  Signal,
  Text,
  ThreeAscii,
  Tui,
} from "../vendor/deno_tui/mod.ts";
import type { TextRectangle } from "../vendor/deno_tui/src/canvas/text.ts";
import type { TerminalGlyphStyle } from "../vendor/deno_tui/src/three_ascii/glyphs.ts";

const VIEW_MIN_WIDTH = 44;
const DASHBOARD_HEIGHT = 10;
const SCANNER_WIDTH = 28;
const MAX_SPEED = 36;
const TARGET_COUNT = 5;

const neon = {
  void: "#02030a",
  panel: "#050915",
  cyan: "#4dfcff",
  cyanDim: "#137d91",
  magenta: "#ff3bc8",
  violet: "#8a5cff",
  lime: "#b7ff5a",
  amber: "#ffd166",
  red: "#ff4d6d",
  text: "#e8fbff",
  muted: "#6b7d91",
};

const style = {
  title: crayon.bgHex(neon.panel).hex(neon.cyan),
  render: crayon.bgHex(neon.panel).hex(neon.magenta),
  frame: crayon.hex(neon.cyanDim),
  frameHot: crayon.hex(neon.magenta),
  panel: crayon.bgHex(neon.panel),
  label: crayon.hex(neon.cyan),
  text: crayon.hex(neon.text),
  muted: crayon.hex(neon.muted),
  good: crayon.hex(neon.lime),
  caution: crayon.hex(neon.amber),
  danger: crayon.hex(neon.red),
};

type Alert = "GREEN" | "YELLOW" | "RED";

interface Target {
  id: string;
  kind: string;
  group: Group;
  velocity: Vector3;
  hostile: boolean;
  integrity: number;
}

interface ShipState {
  speed: number;
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
  energy: number;
  foreShield: number;
  aftShield: number;
  laserHeat: number;
  missiles: number;
  score: number;
  alert: Alert;
  paused: boolean;
  targetIndex: number;
  message: string;
}

const state: ShipState = {
  speed: 0,
  throttle: 18,
  pitch: 0,
  roll: 0,
  yaw: 0,
  energy: 100,
  foreShield: 100,
  aftShield: 100,
  laserHeat: 0,
  missiles: 3,
  score: 0,
  alert: "GREEN",
  paused: false,
  targetIndex: 0,
  message: "LAUNCHED FROM LAVE ORBITAL",
};

const hud = {
  title: new Signal(""),
  mode: new Signal(""),
  status: new Signal(""),
  gauges: Array.from({ length: 4 }, () => new Signal("")),
  scanner: Array.from({ length: 8 }, () => new Signal("")),
  target: new Signal(""),
  message: new Signal(""),
  render: new Signal(""),
};

const textRect = (compute: () => TextRectangle): Computed<TextRectangle> => new Computed<TextRectangle>(compute);
const helpVisible = new Signal(true);

const renderOptions = {
  glyphStyle: "mixed" as TerminalGlyphStyle,
  edges: true,
  fill: true,
  invertLuminance: false,
};

const tui = new Tui({
  style: crayon.bgHex(neon.void),
  refreshRate: 1000 / 30,
});

void handleInput(tui);
tui.dispatch();
tui.run();

const scene = new Scene();
scene.background = new Color("#000000");

const camera = new PerspectiveCamera(45, 1, 0.1, 700);
camera.position.set(0, 1.1, 13);
camera.lookAt(0, 0, -45);

scene.add(new AmbientLight(new Color("#7d4dff"), 1.1));

const keyLight = new DirectionalLight(new Color("#4dfcff"), 2.4);
keyLight.position.set(8, 8, 8);
scene.add(keyLight);

const blueLight = new DirectionalLight(new Color("#ff3bc8"), 0.9);
blueLight.position.set(-6, 2, 4);
scene.add(blueLight);

const world = new Group();
scene.add(world);

const stars = createStarfield(260);
world.add(stars);

const planet = new Mesh(
  new SphereGeometry(14, 42, 28),
  new MeshPhongMaterial({
    color: new Color("#176e8d"),
    emissive: new Color("#08182b"),
    shininess: 12,
    specular: new Color("#ff3bc8"),
  }),
);
planet.position.set(-42, -24, -150);
world.add(planet);

const sun = new Mesh(
  new SphereGeometry(9, 34, 20),
  new MeshPhongMaterial({
    color: new Color("#ffd166"),
    emissive: new Color("#6e214a"),
    shininess: 18,
  }),
);
sun.position.set(58, 30, -190);
world.add(sun);

const station = createWireBox("CORIOLIS", 8, neon.cyan);
station.group.position.set(0, -4, -95);
station.group.rotation.set(0.6, 0.2, 0.2);
world.add(station.group);

const targets: Target[] = [station];
for (let index = 0; index < TARGET_COUNT; index += 1) {
  const target = createRaider(index);
  targets.push(target);
  world.add(target.group);
}

const reticle = createReticle();
scene.add(reticle);

const laserBeams = createLaserBeams();
scene.add(laserBeams);
laserBeams.visible = false;

const asciiEffect = {
  exposure: 1.32,
  attenuation: 1.08,
  blendWithBase: 0.58,
  asciiColor: neon.cyan,
  backgroundColor: neon.void,
  depthFalloff: 0.08,
  depthOffset: 125,
  edgeThreshold: 8.5,
  normalThreshold: 0.13,
  depthThreshold: 0.08,
  edges: true,
  fill: true,
  invertLuminance: false,
};

const ascii = new ThreeAscii({
  parent: tui,
  theme: { base: emptyStyle },
  rectangle: new Computed(() => {
    const wide = scannerFits();
    return {
      column: 1,
      row: 1,
      width: Math.max(VIEW_MIN_WIDTH, tui.rectangle.value.width - (wide ? SCANNER_WIDTH + 4 : 2)),
      height: Math.max(12, tui.rectangle.value.height - DASHBOARD_HEIGHT - 3),
    };
  }),
  zIndex: 1,
  scene,
  camera,
  effect: asciiEffect,
  terminalGlyphStyle: renderOptions.glyphStyle,
  terminalEdgeBias: 0.9,
  frameInterval: 1000 / 24,
  onFrame: updateWorld,
});

buildHud();
bindKeys();
refreshHud();

function renderColumn(): number {
  return Math.max(30, tui.rectangle.value.width - 47);
}

function scannerFits(): boolean {
  return tui.rectangle.value.width >= VIEW_MIN_WIDTH + SCANNER_WIDTH + 8 && tui.rectangle.value.height >= 28;
}

function helpWidth(): number {
  if (!scannerFits()) return tui.rectangle.value.width - 8;

  const scannerColumn = Math.max(2, tui.rectangle.value.width - SCANNER_WIDTH - 2);
  return scannerColumn - 8;
}

function buildHud(): void {
  new Box({
    parent: tui,
    theme: { base: style.panel },
    rectangle: new Computed(() => ({
      column: 0,
      row: 0,
      width: Math.max(1, tui.rectangle.value.width),
      height: 1,
    })),
    zIndex: 2,
  });

  new Text({
    parent: tui,
    theme: { base: style.title },
    text: hud.title,
    overwriteWidth: true,
    rectangle: textRect(() => ({
      column: 2,
      row: 0,
      width: Math.min(42, Math.max(1, renderColumn() - 4)),
    })),
    zIndex: 4,
  });

  new Text({
    parent: tui,
    theme: { base: style.caution },
    text: hud.mode,
    overwriteWidth: true,
    rectangle: textRect(() => ({
      column: Math.max(2, Math.floor(tui.rectangle.value.width / 2) - 14),
      row: 0,
      width: 28,
    })),
    zIndex: 4,
  });

  new Text({
    parent: tui,
    theme: { base: style.render },
    text: hud.render,
    overwriteWidth: true,
    rectangle: textRect(() => ({
      column: renderColumn(),
      row: 0,
      width: 45,
    })),
    zIndex: 4,
  });

  const dashboardRect = new Computed(() => ({
    column: 2,
    row: Math.max(3, tui.rectangle.value.height - DASHBOARD_HEIGHT),
    width: Math.max(42, tui.rectangle.value.width - 4),
    height: DASHBOARD_HEIGHT - 2,
  }));

  new Frame({
    parent: tui,
    theme: { base: style.frameHot },
    rectangle: dashboardRect,
    charMap: "rounded",
    zIndex: 3,
  });

  new Text({
    parent: tui,
    theme: { base: style.text },
    text: hud.status,
    overwriteWidth: true,
    rectangle: textRect(() => ({
      column: 3,
      row: dashboardRect.value.row,
      width: Math.max(1, dashboardRect.value.width - 2),
    })),
    zIndex: 4,
  });

  const helpRect = new Computed(() => ({
    column: 3,
    row: 2,
    width: Math.min(48, Math.max(32, helpWidth())),
    height: 10,
  }));

  new Box({
    parent: tui,
    theme: { base: style.panel },
    rectangle: helpRect,
    visible: helpVisible,
    zIndex: 8,
  });

  new Frame({
    parent: tui,
    theme: { base: style.frameHot },
    rectangle: helpRect,
    charMap: "rounded",
    visible: helpVisible,
    zIndex: 9,
  });

  const helpLines = [
    "NEON EXODUS FLIGHT DECK",
    "? hide/show   Q quit   P pause",
    "ARROWS pitch/roll     A/D yaw",
    "W/S throttle          Space pulse laser",
    "Tab target            H hyperspace reset",
    "ASCII 1 blocks   2 glyphs   3 mixed",
    "E edges   F fill   I invert luminance",
    "Center target before firing",
    "Scanner symbols: ◆ lock  × hostile  ○ neutral",
  ];

  helpLines.forEach((line, index) => {
    new Text({
      parent: tui,
      theme: { base: index === 0 ? style.render : index === 8 ? style.muted : style.text },
      text: line,
      overwriteWidth: true,
      rectangle: textRect(() => ({
        column: helpRect.value.column + 1,
        row: helpRect.value.row + index,
        width: Math.max(1, helpRect.value.width - 2),
      })),
      visible: helpVisible,
      zIndex: 10,
    });
  });

  hud.gauges.forEach((line, index) => {
    new Text({
      parent: tui,
      theme: { base: index === 3 ? style.muted : index === 2 ? style.caution : style.good },
      text: line,
      overwriteWidth: true,
      rectangle: textRect(() => ({
        column: 3,
        row: dashboardRect.value.row + 2 + index,
        width: Math.max(1, dashboardRect.value.width - 2),
      })),
      zIndex: 4,
    });
  });

  new Text({
    parent: tui,
    theme: { base: style.caution },
    text: hud.message,
    overwriteWidth: true,
    rectangle: textRect(() => ({
      column: 3,
      row: dashboardRect.value.row + 7,
      width: Math.max(1, dashboardRect.value.width - 2),
    })),
    zIndex: 4,
  });

  const scannerVisible = new Computed(scannerFits);
  const scannerRect = new Computed(() => ({
    column: Math.max(2, tui.rectangle.value.width - SCANNER_WIDTH - 2),
    row: 2,
    width: SCANNER_WIDTH,
    height: 13,
  }));

  new Box({
    parent: tui,
    theme: { base: style.panel },
    rectangle: scannerRect,
    visible: scannerVisible,
    zIndex: 3,
  });

  new Frame({
    parent: tui,
    theme: { base: style.frame },
    rectangle: scannerRect,
    visible: scannerVisible,
    charMap: "rounded",
    zIndex: 4,
  });

  new Text({
    parent: tui,
    theme: { base: style.label },
    text: "LOCAL SCANNER // LAVE",
    rectangle: new Computed(() => ({ column: scannerRect.value.column + 1, row: scannerRect.value.row })),
    visible: scannerVisible,
    zIndex: 5,
  });

  hud.scanner.forEach((line, index) => {
    new Text({
      parent: tui,
      theme: { base: index === 4 ? style.caution : style.good },
      text: line,
      overwriteWidth: true,
      rectangle: textRect(() => ({
        column: scannerRect.value.column + 1,
        row: scannerRect.value.row + 2 + index,
        width: SCANNER_WIDTH - 2,
      })),
      visible: scannerVisible,
      zIndex: 5,
    });
  });

  new Text({
    parent: tui,
    theme: { base: style.text },
    text: hud.target,
    overwriteWidth: true,
    rectangle: textRect(() => ({
      column: scannerRect.value.column + 1,
      row: scannerRect.value.row + 11,
      width: SCANNER_WIDTH - 2,
    })),
    visible: scannerVisible,
    zIndex: 5,
  });
}

function bindKeys(): void {
  tui.on("keyPress", ({ key, ctrl, meta }) => {
    if (ctrl && key === "c") {
      tui.emit("destroy");
      return;
    }
    if (meta) return;

    const inputKey = key.length === 1 ? key.toLowerCase() : key;

    switch (inputKey) {
      case "escape":
      case "q":
        tui.emit("destroy");
        return;
      case "?":
        helpVisible.value = !helpVisible.peek();
        state.message = helpVisible.peek() ? "HELP OVERLAY OPEN" : "HELP OVERLAY HIDDEN";
        break;
      case "1":
        setGlyphStyle("blocks");
        break;
      case "2":
        setGlyphStyle("glyphs");
        break;
      case "3":
        setGlyphStyle("mixed");
        break;
      case "e":
        setRenderEffect({ edges: !renderOptions.edges });
        break;
      case "f":
        setRenderEffect({ fill: !renderOptions.fill });
        break;
      case "i":
        setRenderEffect({ invertLuminance: !renderOptions.invertLuminance });
        break;
      case "up":
        state.pitch = clamp(state.pitch + 0.18, -1, 1);
        state.message = "NOSE DOWN";
        break;
      case "down":
        state.pitch = clamp(state.pitch - 0.18, -1, 1);
        state.message = "NOSE UP";
        break;
      case "left":
        state.roll = clamp(state.roll - 0.22, -1, 1);
        state.message = "ROLL LEFT";
        break;
      case "right":
        state.roll = clamp(state.roll + 0.22, -1, 1);
        state.message = "ROLL RIGHT";
        break;
      case "a":
        state.yaw = clamp(state.yaw - 0.2, -1, 1);
        state.message = "YAW LEFT";
        break;
      case "d":
        state.yaw = clamp(state.yaw + 0.2, -1, 1);
        state.message = "YAW RIGHT";
        break;
      case "w":
        state.throttle = clamp(state.throttle + 4, 0, MAX_SPEED);
        state.message = "THROTTLE OPEN";
        break;
      case "s":
        state.throttle = clamp(state.throttle - 4, 0, MAX_SPEED);
        state.message = "THROTTLE CLOSED";
        break;
      case "space":
        fireLaser();
        break;
      case "tab":
        state.targetIndex = (state.targetIndex + 1) % targets.length;
        state.message = `TARGET ${activeTarget().id}`;
        break;
      case "h":
        hyperspaceReset();
        break;
      case "p":
        state.paused = !state.paused;
        state.message = state.paused ? "FLIGHT COMPUTER PAUSED" : "FLIGHT COMPUTER ACTIVE";
        break;
    }

    refreshHud();
  });
}

function setGlyphStyle(glyphStyle: TerminalGlyphStyle): void {
  renderOptions.glyphStyle = glyphStyle;
  ascii.drawnObjects.three_ascii?.setTerminalGlyphStyle(glyphStyle);
  state.message = `ASCII GLYPHS: ${glyphStyle.toUpperCase()}`;
  refreshHud();
}

function setRenderEffect(patch: Partial<Pick<typeof renderOptions, "edges" | "fill" | "invertLuminance">>): void {
  Object.assign(renderOptions, patch);
  ascii.drawnObjects.three_ascii?.setEffectOptions(patch);

  if ("edges" in patch) {
    state.message = `ASCII EDGES ${renderOptions.edges ? "ON" : "OFF"}`;
  } else if ("fill" in patch) {
    state.message = `ASCII FILL ${renderOptions.fill ? "ON" : "OFF"}`;
  } else {
    state.message = `ASCII INVERT ${renderOptions.invertLuminance ? "ON" : "OFF"}`;
  }

  refreshHud();
}

function updateWorld(deltaTime: number): void {
  if (!state.paused) {
    const dt = Math.min(deltaTime, 0.08);
    state.speed += (state.throttle - state.speed) * dt * 1.8;
    state.pitch *= 0.93;
    state.roll *= 0.92;
    state.yaw *= 0.9;
    state.energy = clamp(state.energy + dt * 2.2, 0, 100);
    state.foreShield = clamp(state.foreShield + dt * 1.7, 0, 100);
    state.aftShield = clamp(state.aftShield + dt * 1.4, 0, 100);
    state.laserHeat = clamp(state.laserHeat - dt * 38, 0, 100);

    world.rotation.x += state.pitch * dt * 0.9;
    world.rotation.y += state.yaw * dt * 0.9;
    world.rotation.z += state.roll * dt * 0.7;
    stars.rotation.z -= state.roll * dt * 0.28;
    planet.rotation.y += dt * 0.04;
    sun.rotation.y -= dt * 0.02;
    station.group.rotation.x += dt * 0.16;
    station.group.rotation.y += dt * 0.22;

    for (const target of targets) {
      if (target === station || target.integrity <= 0) continue;
      target.group.position.addScaledVector(target.velocity, dt);
      target.group.rotation.x += dt * 0.5;
      target.group.rotation.y += dt * 0.9;
      target.group.position.z += state.speed * dt * 0.32;
      if (target.group.position.z > 12 || target.group.position.length() > 160) {
        placeRaider(target, Math.random() * 80 - 40, Math.random() * 32 - 10, -80 - Math.random() * 80);
      }
    }

    const closestHostile = targets
      .filter((target) => target.hostile && target.integrity > 0)
      .sort((a, b) => a.group.position.length() - b.group.position.length())[0];
    state.alert = closestHostile && closestHostile.group.position.length() < 48
      ? "RED"
      : closestHostile
      ? "YELLOW"
      : "GREEN";

    if (laserBeams.visible && state.laserHeat < 80) {
      laserBeams.visible = false;
    }
  }

  refreshHud();
}

function fireLaser(): void {
  if (state.laserHeat > 82 || state.energy < 6) {
    state.message = "LASER TEMPERATURE CRITICAL";
    return;
  }

  state.laserHeat = clamp(state.laserHeat + 24, 0, 100);
  state.energy = clamp(state.energy - 4, 0, 100);
  laserBeams.visible = true;

  const target = activeTarget();
  const position = target.group.position;
  const centered = Math.abs(position.x) < 10 && Math.abs(position.y) < 8 && position.z < -12 && position.z > -130;
  if (centered && target.integrity > 0) {
    target.integrity = clamp(target.integrity - 34, 0, 100);
    state.message = target.integrity <= 0 ? `${target.id} DESTROYED` : `${target.id} HIT`;
    if (target.integrity <= 0) {
      state.score += target.hostile ? 1 : 0;
      target.group.visible = false;
      setTimeout(() => {
        target.group.visible = true;
        target.integrity = 100;
        placeRaider(target, Math.random() * 90 - 45, Math.random() * 36 - 12, -100 - Math.random() * 80);
      }, 1800);
    }
  } else {
    state.message = "PULSE LASER FIRED";
  }
}

function hyperspaceReset(): void {
  state.energy = 100;
  state.foreShield = 100;
  state.aftShield = 100;
  state.laserHeat = 0;
  state.throttle = 20;
  state.speed = 6;
  world.rotation.set(0, 0, 0);
  for (const [index, target] of targets.entries()) {
    if (target === station) continue;
    target.group.visible = true;
    target.integrity = 100;
    placeRaider(target, Math.sin(index * 2.1) * 48, Math.cos(index * 1.8) * 20, -90 - index * 18);
  }
  state.message = "WITCHSPACE EXIT COMPLETE";
}

function refreshHud(): void {
  const target = activeTarget();
  const range = Math.max(0, Math.round(Math.abs(target.group.position.z)));
  const alertSigil = state.alert === "RED" ? "!!" : state.alert === "YELLOW" ? "<>" : "--";
  hud.title.value = ` ELITE TUI // NEON EXODUS  SCORE ${String(state.score).padStart(3)} `;
  hud.mode.value = tui.rectangle.value.width >= 104
    ? `${alertSigil} ${state.paused ? "PAUSED" : "FLIGHT"} // ${state.alert} ${alertSigil}`
    : "";
  hud.status.value = ` SPD ${state.speed.toFixed(1).padStart(4)}  THR ${state.throttle.toFixed(0).padStart(2)}  ` +
    `ALT ${(planet.position.distanceTo(camera.position) - 14).toFixed(0).padStart(3)}  ` +
    `MISS ${state.missiles}  ALERT ${state.alert}  LOCK ${target.id}`;
  hud.render.value = ` ASCII ${renderOptions.glyphStyle.toUpperCase()}  EDGE ${onOff(renderOptions.edges)}  FILL ${
    onOff(renderOptions.fill)
  }  INV ${onOff(renderOptions.invertLuminance)} `;
  [
    `SHIELD  FORE ${bar(state.foreShield)}  AFT ${bar(state.aftShield)}`,
    `CORE    ENER ${bar(state.energy)}  LASER ${bar(100 - state.laserHeat)}`,
    `VECTOR  PIT ${axisBar(state.pitch)}  ROL ${axisBar(state.roll)}  YAW ${axisBar(state.yaw)}`,
    `? help   1 blocks  2 glyphs  3 mixed   E edges  F fill  I invert   Q quit`,
  ].forEach((line, index) => {
    hud.gauges[index]!.value = line;
  });
  scannerGrid().forEach((line, index) => {
    hud.scanner[index]!.value = line;
  });
  hud.target.value = `LOCK ${target.id.padEnd(8)} ${target.kind.padEnd(7)} RNG ${String(range).padStart(3)} INT ${
    target.integrity.toFixed(0).padStart(3)
  }`;
  hud.message.value = `>> ${state.message}`;
}

function scannerGrid(): string[] {
  const width = 24;
  const height = 8;
  const rows = Array.from({ length: height }, () => Array.from({ length: width }, () => "·"));
  rows[Math.floor(height / 2)]![Math.floor(width / 2)] = "▲";

  for (const [index, target] of targets.entries()) {
    if (!target.group.visible || target.integrity <= 0) continue;
    const p = target.group.position;
    const x = clamp(Math.round(width / 2 + p.x / 8), 0, width - 1);
    const y = clamp(Math.round(height / 2 + p.z / 24), 0, height - 1);
    rows[y]![x] = index === state.targetIndex ? "◆" : target.hostile ? "×" : "○";
  }

  return rows.map((row) => row.join(""));
}

function createStarfield(count: number): Points {
  const positions: number[] = [];
  for (let i = 0; i < count; i += 1) {
    positions.push((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 150, -20 - Math.random() * 260);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new Points(
    geometry,
    new PointsMaterial({
      color: new Color("#dff8ff"),
      size: 1.4,
      sizeAttenuation: true,
    }),
  );
}

function createWireBox(id: string, size: number, color: string): Target {
  const geometry = new BoxGeometry(size, size, size);
  const edges = new EdgesGeometry(geometry);
  const material = new LineBasicMaterial({ color: new Color(color) });
  const group = new Group();
  group.add(new LineSegments(edges, material));
  return {
    id,
    kind: "STATION",
    group,
    velocity: new Vector3(0, 0, 0),
    hostile: false,
    integrity: 100,
  };
}

function createRaider(index: number): Target {
  const color = index % 2 === 0 ? neon.red : neon.amber;
  const hull = new EdgesGeometry(new IcosahedronGeometry(3.4 + (index % 3) * 0.4, 1));
  const material = new LineBasicMaterial({ color: new Color(color) });
  const group = new Group();
  group.add(new LineSegments(hull, material));

  const engine = new Mesh(
    new TorusGeometry(1.2, 0.08, 8, 24),
    new MeshPhongMaterial({ color: new Color(neon.cyan), emissive: new Color("#093d47") }),
  );
  engine.position.z = 1.4;
  engine.rotation.x = Math.PI / 2;
  group.add(engine);

  const target: Target = {
    id: `BOA-${index + 1}`,
    kind: index % 2 === 0 ? "RAIDER" : "TRADER",
    group,
    velocity: new Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, 5 + Math.random() * 8),
    hostile: index % 2 === 0,
    integrity: 100,
  };

  placeRaider(target, Math.sin(index * 2.4) * 42, Math.cos(index * 1.8) * 18, -70 - index * 22);
  return target;
}

function placeRaider(target: Target, x: number, y: number, z: number): void {
  target.group.position.set(x, y, z);
  target.velocity.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 2.2, 4 + Math.random() * 7);
}

function createReticle(): Group {
  const material = new LineBasicMaterial({ color: new Color(neon.magenta) });
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(-1.8, 0, -9),
    new Vector3(-0.45, 0, -9),
    new Vector3(0.45, 0, -9),
    new Vector3(1.8, 0, -9),
    new Vector3(0, -1.1, -9),
    new Vector3(0, -0.3, -9),
    new Vector3(0, 0.3, -9),
    new Vector3(0, 1.1, -9),
  ]);
  const group = new Group();
  group.add(new LineSegments(geometry, material));
  return group;
}

function createLaserBeams(): Group {
  const material = new LineBasicMaterial({ color: new Color(neon.red) });
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(-2.2, -1.2, -4),
    new Vector3(-0.25, -0.05, -70),
    new Vector3(2.2, -1.2, -4),
    new Vector3(0.25, -0.05, -70),
  ]);
  const group = new Group();
  group.add(new LineSegments(geometry, material));
  return group;
}

function activeTarget(): Target {
  return targets[state.targetIndex] ?? targets[0]!;
}

function bar(value: number, width = 12): string {
  const filled = Math.round(clamp(value, 0, 100) / 100 * width);
  return `${"▰".repeat(filled)}${"▱".repeat(width - filled)}`;
}

function axisBar(value: number): string {
  const width = 9;
  const center = Math.floor(width / 2);
  const mark = clamp(Math.round(center + value * center), 0, width - 1);
  return Array.from({ length: width }, (_, index) => index === mark ? "◆" : index === center ? "│" : "─").join("");
}

function onOff(value: boolean): string {
  return value ? "ON" : "OFF";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
