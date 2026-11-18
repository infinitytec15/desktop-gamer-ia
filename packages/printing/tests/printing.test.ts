import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, strFromU8, zipSync, unzipSync } from "fflate";
import {
  briefSchema,
  localPlan,
  validateProposal,
  patchProfile,
  parseStl,
  orientedStl,
  rotatedSize,
  printerCatalog,
} from "../src/index.js";
export const fdm = {
  technology: "fdm",
  slicer: "bambu",
  printer: "Fixture printer",
  material: "Fixture PLA",
  goal: "quality",
  problem: "stringing",
  notes: "",
  build_volume: [220, 220, 250],
  limits_confirmed: true,
  nozzle: 0.4,
  line_width: 0.45,
  max_nozzle: 260,
  max_bed: 80,
  material_min: 195,
  material_max: 225,
  max_flow: 8,
  current: {
    layer_height: 0.2,
    nozzle_temperature: 210,
    bed_temperature: 60,
    outer_speed: 45,
    inner_speed: 65,
    first_layer_speed: 20,
    walls: 2,
    infill: 15,
    fan: 100,
    supports: true,
    brim: 0,
  },
} as const;
test("small nozzles and fractional flow limits never round speed above the cap", () => {
  const small = localPlan({
    ...fdm,
    nozzle: 0.1,
    line_width: 0.1,
    current: { ...fdm.current, layer_height: 0.05 },
  });
  assert.equal(small.fdm?.layer_height, 0.04);
  const capped = localPlan({
    ...fdm,
    nozzle: 2,
    line_width: 3,
    max_flow: 3.999,
    current: { ...fdm.current, layer_height: 1 },
  });
  assert.ok(capped.fdm);
  assert.ok(capped.fdm.outer_speed * capped.fdm.layer_height * 3 <= 3.999);
});
const resin = {
  technology: "resin",
  slicer: "chitubox",
  printer: "Fixture resin printer",
  material: "Calibrated resin",
  goal: "quality",
  problem: "layer_failure",
  notes: "",
  build_volume: [150, 100, 200],
  limits_confirmed: true,
  resin_temperature_c: 25,
  resin_min_c: 20,
  resin_max_c: 30,
  exposure_calibrated: true,
  layer_calibrated_mm: 0.05,
  exposure_min_s: 2,
  exposure_max_s: 3,
  max_lift_speed: 100,
  max_retract_speed: 150,
  max_lift_distance: 10,
  current: {
    layer_height: 0.05,
    exposure_s: 2.5,
    bottom_exposure_s: 25,
    bottom_layers: 4,
    lift_distance_mm: 6,
    lift_speed_mm_min: 60,
    retract_speed_mm_min: 100,
    rest_after_retract_s: 1,
  },
};
test("FDM respects manufacturer range, layer/nozzle and volumetric flow", () => {
  const b = briefSchema.parse(fdm),
    p = localPlan(b);
  assert.equal(p.fdm?.nozzle_temperature, 205);
  assert.equal(p.fdm?.layer_height, 0.12);
  assert.ok(
    Math.max(p.fdm!.outer_speed, p.fdm!.inner_speed) *
      b.line_width *
      p.fdm!.layer_height <=
      b.max_flow + 0.01,
  );
  assert.throws(() =>
    validateProposal(b, {
      summary: p.summary,
      rationale: p.rationale,
      calibration: p.calibration,
      resin: null,
      fdm: { ...p.fdm, nozzle_temperature: 300 },
    }),
  );
  assert.throws(() => briefSchema.parse({ ...fdm, limits_confirmed: false }));
  assert.throws(() => briefSchema.parse({ ...fdm, material_min: 300 }));
  assert.throws(() => briefSchema.parse({ ...fdm, nozzle: NaN }));
});
test("resin keeps calibrated exposure/layer and enforces mm/min/temperature limits", () => {
  const b = briefSchema.parse(resin),
    p = localPlan(b);
  assert.equal(p.resin?.exposure_s, 2.5);
  assert.equal(p.resin?.layer_height, 0.05);
  assert.equal(p.resin?.lift_speed_mm_min, 48);
  const { summary, rationale, calibration, fdm, resin: target } = p;
  assert.throws(() =>
    validateProposal(b, {
      summary,
      rationale,
      calibration,
      fdm,
      resin: { ...target, layer_height: 0.1 },
    }),
  );
  assert.throws(() => briefSchema.parse({ ...resin, resin_temperature_c: 10 }));
  assert.throws(() =>
    briefSchema.parse({ ...resin, exposure_calibrated: false }),
  );
});
test("PreForm uses guided-only plan without fabricated seconds or movement", () => {
  const p = localPlan({
    technology: "resin",
    slicer: "preform",
    printer: "Form fixture",
    material: "Official resin",
    goal: "quality",
    problem: "none",
    notes: "",
    build_volume: [150, 100, 200],
    limits_confirmed: true,
  });
  assert.equal(p.resin, null);
  assert.equal(p.fdm, null);
  assert.ok(p.rationale.join(" ").includes("oficiais"));
});
test("JSON patch preserves unknown fields, commands, array shape and selected plate", () => {
  const b = briefSchema.parse(fdm),
    p = localPlan(b);
  const original = {
    type: "process",
    name: "Duplicated fixture",
    inherits: "Official base",
    outer_wall_speed: ["120"],
    layer_height: "0.2",
    custom_gcode: "G28",
    unknown: { keep: true },
  };
  const bytes = strToU8(JSON.stringify(original)),
    patched = patchProfile(bytes, b, p);
  const parsed = JSON.parse(strFromU8(patched.bytes));
  assert.deepEqual(parsed.outer_wall_speed, [String(p.fdm!.outer_speed)]);
  assert.equal(parsed.custom_gcode, "G28");
  assert.deepEqual(parsed.unknown, { keep: true });
  assert.equal(parsed.name, original.name);
  assert.deepEqual(JSON.parse(strFromU8(bytes)), original);
  const filament = {
    type: "filament",
    name: "Copy",
    nozzle_temperature: ["210"],
    hot_plate_temp: ["65"],
    textured_plate_temp: ["70"],
  };
  const f = JSON.parse(
    strFromU8(
      patchProfile(strToU8(JSON.stringify(filament)), b, p, "textured").bytes,
    ),
  );
  assert.deepEqual(f.hot_plate_temp, ["65"]);
  assert.deepEqual(f.textured_plate_temp, ["60"]);
});
test("profiles reject machine configs, credentials, incompatible categories and unsafe multidata", () => {
  const b = briefSchema.parse(fdm),
    p = localPlan(b);
  for (const profile of [
    { type: "machine", layer_height: ".2" },
    { type: "process", password: "private-value", layer_height: ".2" },
    { type: "process", outer_wall_speed: ["40", "60"] },
  ])
    assert.throws(() => patchProfile(strToU8(JSON.stringify(profile)), b, p));
  const multiple = {
    type: "process",
    outer_wall_speed: ["40", "60"],
    layer_height: ".2",
  };
  const result = patchProfile(strToU8(JSON.stringify(multiple)), b, p);
  assert.deepEqual(JSON.parse(strFromU8(result.bytes)).outer_wall_speed, [
    "40",
    "60",
  ]);
  assert.ok(result.skipped.some((s) => s.includes("múltiplos")));
});
test("Cura stays a ZIP of INI containers and preserves extruder metadata", () => {
  const b = briefSchema.parse({ ...fdm, slicer: "cura" }),
    p = localPlan(b);
  const global =
    "[general]\nversion = 4\nname = Fixture Copy\n[metadata]\ntype = quality_changes\n[values]\nlayer_height = 0.2\nspeed_wall_0 = 100\n";
  const extruder =
    "[general]\nversion = 4\n[metadata]\nposition = 0\n[values]\nmaterial_print_temperature = 210\n";
  const out = patchProfile(
    zipSync({ global: strToU8(global), extruder: strToU8(extruder) }),
    b,
    p,
  );
  assert.equal(out.extension, "curaprofile");
  assert.equal(out.bytes[0], 0x50);
  const unzipped = unzipSync(out.bytes);
  assert.ok(strFromU8(unzipped.global).includes("layer_height = 0.12"));
  assert.ok(strFromU8(unzipped.extruder).includes("position = 0"));
  assert.throws(() => patchProfile(strToU8(global), b, p));
  assert.throws(() =>
    patchProfile(zipSync({ "../escape": strToU8(global) }), b, p),
  );
});
test("Prusa preserves percent speeds and refuses physical-printer bundles", () => {
  const b = briefSchema.parse({ ...fdm, slicer: "prusa" }),
    p = localPlan(b);
  const out = patchProfile(
    strToU8(
      "layer_height = 0.2\nfirst_layer_speed = 50%\nexternal_perimeter_speed = 60\ncustom_gcode = G28\n",
    ),
    b,
    p,
  );
  assert.ok(strFromU8(out.bytes).includes("first_layer_speed = 50%"));
  assert.ok(strFromU8(out.bytes).includes("custom_gcode = G28"));
  assert.throws(() =>
    patchProfile(
      strToU8("[physical_printer:fixture]\nprinthost_apikey=private\n"),
      b,
      p,
    ),
  );
});
function cube() {
  const vertices = [
      [0, 0, 0],
      [20, 0, 0],
      [20, 10, 0],
      [0, 10, 0],
      [0, 0, 5],
      [20, 0, 5],
      [20, 10, 5],
      [0, 10, 5],
    ],
    faces = [
      [0, 2, 1],
      [0, 3, 2],
      [4, 5, 6],
      [4, 6, 7],
      [0, 1, 5],
      [0, 5, 4],
      [1, 2, 6],
      [1, 6, 5],
      [2, 3, 7],
      [2, 7, 6],
      [3, 0, 4],
      [3, 4, 7],
    ];
  return new Float32Array(faces.flatMap((f) => f.flatMap((i) => vertices[i])));
}
test("STL topology and volume are measured, rotated copy preserves original geometry", () => {
  const positions = cube(),
    original = positions.slice(),
    bytes = orientedStl(positions, [0, 0, 0]),
    mesh = parseStl(bytes.buffer);
  assert.deepEqual(mesh.geometry.size_mm, [20, 10, 5]);
  assert.equal(mesh.geometry.boundary_edges, 0);
  assert.equal(mesh.geometry.nonmanifold_edges, 0);
  assert.ok(Math.abs(mesh.geometry.volume_mm3! - 1000) < 0.001);
  assert.deepEqual(
    rotatedSize(positions, [90, 0, 0]).map((n) => Math.round(n)),
    [20, 5, 10],
  );
  assert.deepEqual(positions, original);
  const rotated = parseStl(orientedStl(positions, [35, 0, 0]).buffer);
  assert.ok(Math.abs(rotated.geometry.volume_mm3! - 1000) < 0.01);
});
test("open meshes suppress volume and malformed STL never reports a print-ready model", () => {
  const mesh = cube().slice(9),
    open = parseStl(orientedStl(mesh, [0, 0, 0]).buffer);
  assert.equal(open.geometry.volume_mm3, null);
  assert.ok(open.geometry.boundary_edges > 0);
  assert.throws(() => parseStl(new Uint8Array(10).buffer));
  const bad = orientedStl(cube(), [0, 0, 0]);
  new DataView(bad.buffer).setFloat32(96, NaN, true);
  assert.throws(() => parseStl(bad.buffer));
});
test("printer catalogue covers requested brands with source links, without invented thermal limits", () => {
  for (const brand of ["Bambu Lab", "Creality", "Flashforge", "Elegoo"])
    assert.ok(
      printerCatalog.some(
        (p) => p.brand === brand && p.technology === "fdm" && p.models.length,
      ),
    );
  assert.ok(
    printerCatalog
      .filter((p) => p.technology === "fdm")
      .reduce((n, p) => n + p.models.length, 0) > 160,
  );
  assert.ok(printerCatalog.every((p) => p.source.startsWith("https://")));
});
