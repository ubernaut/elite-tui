/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
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
  BoxObject,
  Computed,
  createAnsiStyle,
  createWebTui,
  Signal,
  TextObject,
  ThreeAsciiObject,
} from "../vendor/deno_tui/mod.web.ts";
import type { TextRectangle } from "../vendor/deno_tui/src/canvas/text.ts";
import type { TerminalGlyphStyle } from "../vendor/deno_tui/src/three_ascii/glyphs.ts";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app mount element.");

const VIEW_MIN_WIDTH = 44;
const DASHBOARD_HEIGHT = 11;
const SCANNER_WIDTH = 30;
const MAX_SPEED = 36;
const TARGET_COUNT = 5;
const HOLD_CAPACITY = 20;

const neon = {
  void: "#02030a",
  panel: "#050915",
  cyan: "#4dfcff",
  magenta: "#ff3bc8",
  lime: "#b7ff5a",
  amber: "#ffd166",
  red: "#ff4d6d",
  text: "#e8fbff",
  muted: "#6b7d91",
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

const state = {
  speed: 0,
  throttle: 18,
  pitch: 0,
  roll: 0,
  yaw: 0,
  energy: 100,
  foreShield: 100,
  aftShield: 100,
  hull: 100,
  laserHeat: 0,
  missiles: 3,
  score: 0,
  credits: 180,
  cargo: 0,
  fuel: 7,
  systemIndex: 0,
  alert: "GREEN" as Alert,
  paused: false,
  targetIndex: 0,
  message: "WEBGPU FLIGHT DECK ONLINE",
};

const systems = [
  { name: "LAVE", buy: 28, sell: 42, fuel: 14 },
  { name: "ZAONCE", buy: 34, sell: 58, fuel: 18 },
  { name: "REORTE", buy: 22, sell: 37, fuel: 12 },
  { name: "LEESTI", buy: 46, sell: 71, fuel: 21 },
];

const hud = {
  title: new Signal(""),
  mode: new Signal(""),
  status: new Signal(""),
  gauges: Array.from({ length: 7 }, () => new Signal("")),
  scanner: Array.from({ length: 8 }, () => new Signal("")),
  target: new Signal(""),
  message: new Signal(""),
  render: new Signal(""),
};

const renderOptions = {
  glyphStyle: "mixed" as TerminalGlyphStyle,
  edges: true,
  fill: true,
  invertLuminance: false,
};

const host = createWebTui({
  root,
  refreshRate: 1000 / 60,
  sinkOptions: {
    cellWidth: 9,
    cellHeight: 17,
    foreground: neon.text,
    background: neon.void,
    font: "14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  platformOptions: {
    cellWidth: 9,
    cellHeight: 17,
  },
});
root.addEventListener("contextmenu", (event) => event.preventDefault());

const scene = new Scene();
scene.background = new Color("#000000");
const camera = new PerspectiveCamera(45, 1, 0.1, 700);
camera.position.set(0, 1.1, 13);
camera.lookAt(0, 0, -45);

scene.add(new AmbientLight(new Color("#7d4dff"), 1.1));
const keyLight = new DirectionalLight(new Color(neon.cyan), 2.4);
keyLight.position.set(8, 8, 8);
scene.add(keyLight);
const magentaLight = new DirectionalLight(new Color(neon.magenta), 0.9);
magentaLight.position.set(-6, 2, 4);
scene.add(magentaLight);

const world = new Group();
scene.add(world);
const stars = createStarfield(260);
world.add(stars);

const planet = new Mesh(
  new SphereGeometry(14, 42, 28),
  new MeshPhongMaterial({ color: new Color("#176e8d"), emissive: new Color("#08182b"), shininess: 12 }),
);
planet.position.set(-42, -24, -150);
world.add(planet);

const sun = new Mesh(
  new SphereGeometry(9, 34, 20),
  new MeshPhongMaterial({ color: new Color(neon.amber), emissive: new Color("#6e214a"), shininess: 18 }),
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
laserBeams.visible = false;
scene.add(laserBeams);

const ascii = new ThreeAsciiObject({
  canvas: host.canvas,
  rectangle: new Computed(() => ({
    column: 1,
    row: 2,
    width: Math.max(VIEW_MIN_WIDTH, columns() - (scannerFits() ? SCANNER_WIDTH + 4 : 2)),
    height: Math.max(12, rows() - DASHBOARD_HEIGHT - 3),
  })),
  style: createAnsiStyle({}),
  zIndex: 1,
  scene,
  camera,
  effect: {
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
  },
  terminalGlyphStyle: renderOptions.glyphStyle,
  terminalEdgeBias: 0.9,
  frameInterval: 1000 / 24,
  onFrame: updateWorld,
});
ascii.draw();

buildHud();
bindInput();
refreshHud();
host.start();
root.focus();

globalThis.addEventListener("beforeunload", () => host.destroy());

function buildHud(): void {
  new BoxObject({
    canvas: host.canvas,
    rectangle: new Computed(() => ({ column: 0, row: 0, width: columns(), height: rows() })),
    filler: " ",
    style: createAnsiStyle({ background: [2, 3, 10] }),
    zIndex: -2,
  }).draw();

  text(new Computed<TextRectangle>(() => ({ column: 2, row: 0, width: 48 })), hud.title, neon.cyan, 3);
  text(
    new Computed<TextRectangle>(() => ({ column: Math.max(2, Math.floor(columns() / 2) - 14), row: 0, width: 32 })),
    hud.mode,
    neon.amber,
    3,
  );
  text(
    new Computed<TextRectangle>(() => ({ column: Math.max(30, columns() - 48), row: 0, width: 46 })),
    hud.render,
    neon.magenta,
    3,
  );

  const dashboard = new Computed(() => ({
    column: 1,
    row: Math.max(4, rows() - DASHBOARD_HEIGHT),
    width: Math.max(42, columns() - 2),
    height: DASHBOARD_HEIGHT - 1,
  }));
  text(
    new Computed<TextRectangle>(() => ({ column: 2, row: dashboard.value.row, width: dashboard.value.width - 2 })),
    hud.status,
    neon.text,
    4,
  );
  hud.gauges.forEach((line, index) => {
    text(
      new Computed<TextRectangle>(() => ({
        column: 2,
        row: dashboard.value.row + 2 + index,
        width: dashboard.value.width - 2,
      })),
      line,
      index === 3 ? neon.amber : index === 6 ? neon.muted : neon.text,
      4,
    );
  });
  text(
    new Computed<TextRectangle>(() => ({ column: 2, row: dashboard.value.row + 9, width: dashboard.value.width - 2 })),
    hud.message,
    neon.amber,
    4,
  );

  const scanner = new Computed(() => ({
    column: Math.max(2, columns() - SCANNER_WIDTH - 2),
    row: 2,
    width: SCANNER_WIDTH,
    height: 13,
  }));
  text(
    new Computed<TextRectangle>(() => ({
      column: scanner.value.column + 1,
      row: scanner.value.row,
      width: SCANNER_WIDTH - 2,
    })),
    new Signal("LOCAL SCANNER // LAVE"),
    neon.cyan,
    5,
  );
  hud.scanner.forEach((line, index) => {
    text(
      new Computed<TextRectangle>(() => ({
        column: scanner.value.column + 1,
        row: scanner.value.row + 2 + index,
        width: SCANNER_WIDTH - 2,
      })),
      line,
      neon.lime,
      5,
    );
  });
  text(
    new Computed<TextRectangle>(() => ({
      column: scanner.value.column + 1,
      row: scanner.value.row + 11,
      width: SCANNER_WIDTH - 2,
    })),
    hud.target,
    neon.text,
    5,
  );
}

function text(
  rectangle: TextRectangle | Computed<TextRectangle>,
  value: string | Signal<string> | Computed<string>,
  color: string,
  zIndex: number,
): void {
  new TextObject({
    canvas: host.canvas,
    rectangle,
    value,
    overwriteRectangle: true,
    style: createAnsiStyle({ foreground: hexToRgb(color) }),
    zIndex,
  }).draw();
}

function bindInput(): void {
  host.on("keyPress", ({ key }) => {
    switch (key) {
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
      case "m":
        fireMissile();
        break;
      case "tab":
        cycleTarget();
        break;
      case "h":
        hyperspaceJump();
        break;
      case "p":
        state.paused = !state.paused;
        state.message = state.paused ? "FLIGHT COMPUTER PAUSED" : "FLIGHT COMPUTER ACTIVE";
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
        renderOptions.edges = !renderOptions.edges;
        ascii.setEffectOptions({ edges: renderOptions.edges });
        state.message = `ASCII EDGES ${renderOptions.edges ? "ON" : "OFF"}`;
        break;
      case "f":
        renderOptions.fill = !renderOptions.fill;
        ascii.setEffectOptions({ fill: renderOptions.fill });
        state.message = `ASCII FILL ${renderOptions.fill ? "ON" : "OFF"}`;
        break;
      case "i":
        renderOptions.invertLuminance = !renderOptions.invertLuminance;
        ascii.setEffectOptions({ invertLuminance: renderOptions.invertLuminance });
        state.message = `ASCII INVERT ${renderOptions.invertLuminance ? "ON" : "OFF"}`;
        break;
    }
    refreshHud();
  });

  host.on("mousePress", (event) => {
    if (!inFlightView(event.x, event.y) || event.ctrl || event.meta || event.shift) return;
    if (event.drag && event.button === 0) {
      state.yaw = clamp(state.yaw + event.movementX * 0.035, -1, 1);
      state.pitch = clamp(state.pitch - event.movementY * 0.04, -1, 1);
      state.message = "MOUSELOOK VECTORING";
    } else if (!event.release && event.button === 2) {
      cycleTarget();
    }
    refreshHud();
  });

  host.on("mouseScroll", (event) => {
    if (!inFlightView(event.x, event.y) || event.ctrl || event.meta || event.shift) return;
    state.throttle = clamp(state.throttle - event.scroll * 4, 0, MAX_SPEED);
    state.message = event.scroll < 0 ? "MOUSE WHEEL THROTTLE OPEN" : "MOUSE WHEEL THROTTLE CLOSED";
    refreshHud();
  });
}

function updateWorld(deltaTime: number): void {
  if (!state.paused && state.hull > 0) {
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
    const closestHostile = targets.filter((target) =>
      target.hostile && target.integrity > 0
    ).sort((a, b) => a.group.position.length() - b.group.position.length())[0];
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
  const p = target.group.position;
  const centered = Math.abs(p.x) < 10 && Math.abs(p.y) < 8 && p.z < -12 && p.z > -130;
  if (centered && target.integrity > 0) {
    target.integrity = clamp(target.integrity - 34, 0, 100);
    state.message = target.integrity <= 0 ? `${target.id} DESTROYED` : `${target.id} HIT`;
    if (target.integrity <= 0) destroyTarget(target);
  } else {
    state.message = "PULSE LASER FIRED";
  }
}

function fireMissile(): void {
  const target = activeTarget();
  if (state.missiles <= 0 || target === station || target.integrity <= 0 || Math.abs(target.group.position.z) > 150) {
    state.message = state.missiles <= 0 ? "MISSILE BAY EMPTY" : "MISSILE LOCK FAILED";
    return;
  }
  state.missiles -= 1;
  target.integrity = 0;
  laserBeams.visible = true;
  state.message = `MISSILE DESTROYED ${target.id}`;
  destroyTarget(target);
}

function destroyTarget(target: Target): void {
  if (target.hostile) {
    state.score += 1;
    state.credits += 100;
  }
  target.group.visible = false;
  setTimeout(() => {
    target.group.visible = true;
    target.integrity = 100;
    placeRaider(target, Math.random() * 90 - 45, Math.random() * 36 - 12, -100 - Math.random() * 80);
  }, 1800);
}

function hyperspaceJump(): void {
  if (state.fuel <= 0) {
    state.message = "HYPERSPACE DENIED - NO FUEL";
    return;
  }
  state.fuel -= 1;
  state.systemIndex = (state.systemIndex + 1) % systems.length;
  world.rotation.set(0, 0, 0);
  for (const [index, target] of targets.entries()) {
    if (target === station) continue;
    target.group.visible = true;
    target.integrity = 100;
    placeRaider(target, Math.sin(index * 2.1) * 48, Math.cos(index * 1.8) * 20, -90 - index * 18);
  }
  state.message = `WITCHSPACE EXIT: ${currentSystem().name}`;
}

function cycleTarget(): void {
  state.targetIndex = (state.targetIndex + 1) % targets.length;
  state.message = `TARGET ${activeTarget().id}`;
}

function setGlyphStyle(glyphStyle: TerminalGlyphStyle): void {
  renderOptions.glyphStyle = glyphStyle;
  ascii.setTerminalGlyphStyle(glyphStyle);
  state.message = `ASCII GLYPHS: ${glyphStyle.toUpperCase()}`;
}

function refreshHud(): void {
  const target = activeTarget();
  const market = currentSystem();
  const range = Math.max(0, Math.round(Math.abs(target.group.position.z)));
  const alertSigil = state.alert === "RED" ? "!!" : state.alert === "YELLOW" ? "<>" : "--";
  hud.title.value = ` ELITE TUI WEB // NEON EXODUS  SCORE ${String(state.score).padStart(3)} `;
  hud.mode.value = `${alertSigil} ${state.paused ? "PAUSED" : "FLIGHT"} // ${state.alert} ${alertSigil}`;
  hud.status.value = clearLine(
    ` SPD ${state.speed.toFixed(1).padStart(4)}  THR ${
      state.throttle.toFixed(0).padStart(2)
    }  ALT 156  MISS ${state.missiles}  CR ${state.credits.toString().padStart(4)}  CARGO ${
      String(state.cargo).padStart(2)
    }/${HOLD_CAPACITY}  FUEL ${state.fuel}/7  ALERT ${state.alert}  LOCK ${target.id}`,
  );
  hud.render.value = ` ASCII ${renderOptions.glyphStyle.toUpperCase()}  EDGE ${onOff(renderOptions.edges)}  FILL ${
    onOff(renderOptions.fill)
  }  INV ${onOff(renderOptions.invertLuminance)} `;
  [
    `SHIELD  FORE ${bar(state.foreShield)}  AFT ${bar(state.aftShield)}`,
    `CORE    ENER ${bar(state.energy)}  HULL ${bar(state.hull)}  LASER ${bar(100 - state.laserHeat)}`,
    `VECTOR  PIT ${axisBar(state.pitch)}  ROL ${axisBar(state.roll)}  YAW ${axisBar(state.yaw)}`,
    `MARKET  ${market.name.padEnd(6)} BUY ${String(market.buy).padStart(2)}  SELL ${
      String(market.sell).padStart(2)
    }  FUEL ${String(market.fuel).padStart(2)}  WEBGPU`,
    `TRADE   Terminal build keeps docking market  H jump`,
    `COMBAT  Space laser  M missile  Tab/right-click target  1/2/3 ASCII  E/F/I render`,
    `MOUSE   Left-drag look  Wheel throttle`,
  ].forEach((line, index) => hud.gauges[index]!.value = clearLine(line));
  scannerGrid().forEach((line, index) => hud.scanner[index]!.value = line);
  hud.target.value = clearLine(
    `LOCK ${target.id.padEnd(8)} ${target.kind.padEnd(7)} RNG ${String(range).padStart(3)} INT ${
      target.integrity.toFixed(0).padStart(3)
    }`,
  );
  hud.message.value = clearLine(`>> ${state.message}`);
}

function scannerGrid(): string[] {
  const width = 26;
  const height = 8;
  const rows = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));
  rows[Math.floor(height / 2)]![Math.floor(width / 2)] = "^";
  for (const [index, target] of targets.entries()) {
    if (!target.group.visible || target.integrity <= 0) continue;
    const p = target.group.position;
    const x = clamp(Math.round(width / 2 + p.x / 8), 0, width - 1);
    const y = clamp(Math.round(height / 2 + p.z / 24), 0, height - 1);
    rows[y]![x] = index === state.targetIndex ? "*" : target.hostile ? "x" : "o";
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
  return new Points(geometry, new PointsMaterial({ color: new Color("#dff8ff"), size: 1.4, sizeAttenuation: true }));
}

function createWireBox(id: string, size: number, color: string): Target {
  const group = new Group();
  group.add(
    new LineSegments(
      new EdgesGeometry(new BoxGeometry(size, size, size)),
      new LineBasicMaterial({ color: new Color(color) }),
    ),
  );
  return { id, kind: "STATION", group, velocity: new Vector3(0, 0, 0), hostile: false, integrity: 100 };
}

function createRaider(index: number): Target {
  const color = index % 2 === 0 ? neon.red : neon.amber;
  const group = new Group();
  group.add(
    new LineSegments(
      new EdgesGeometry(new IcosahedronGeometry(3.4 + (index % 3) * 0.4, 1)),
      new LineBasicMaterial({ color: new Color(color) }),
    ),
  );
  const engine = new Mesh(
    new TorusGeometry(1.2, 0.08, 8, 24),
    new MeshPhongMaterial({ color: new Color(neon.cyan), emissive: new Color("#093d47") }),
  );
  engine.position.z = 1.4;
  engine.rotation.x = Math.PI / 2;
  group.add(engine);
  const target = {
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
  group.add(new LineSegments(geometry, new LineBasicMaterial({ color: new Color(neon.magenta) })));
  return group;
}

function createLaserBeams(): Group {
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(-2.2, -1.2, -4),
    new Vector3(-0.25, -0.05, -70),
    new Vector3(2.2, -1.2, -4),
    new Vector3(0.25, -0.05, -70),
  ]);
  const group = new Group();
  group.add(new LineSegments(geometry, new LineBasicMaterial({ color: new Color(neon.red) })));
  return group;
}

function activeTarget(): Target {
  return targets[state.targetIndex] ?? targets[0]!;
}

function currentSystem(): (typeof systems)[number] {
  return systems[state.systemIndex] ?? systems[0]!;
}

function inFlightView(x: number, y: number): boolean {
  const rect = ascii.rectangle.peek();
  return x >= rect.column && x < rect.column + rect.width && y >= rect.row && y < rect.row + rect.height;
}

function scannerFits(): boolean {
  return columns() >= VIEW_MIN_WIDTH + SCANNER_WIDTH + 8 && rows() >= 28;
}

function columns(): number {
  return host.platform.size.value.columns;
}

function rows(): number {
  return host.platform.size.value.rows;
}

function bar(value: number, width = 12): string {
  const filled = Math.round(clamp(value, 0, 100) / 100 * width);
  return `${"/".repeat(filled)}${"-".repeat(width - filled)}`;
}

function axisBar(value: number): string {
  const width = 9;
  const center = Math.floor(width / 2);
  const mark = clamp(Math.round(center + value * center), 0, width - 1);
  return Array.from({ length: width }, (_, index) => index === mark ? "*" : index === center ? "|" : "-").join("");
}

function clearLine(value: string): string {
  return value.padEnd(160);
}

function onOff(value: boolean): string {
  return value ? "ON" : "OFF";
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
