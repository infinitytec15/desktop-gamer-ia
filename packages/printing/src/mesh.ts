import type { Geometry } from "./domain.js";
export type Mesh = {
  positions: Float32Array;
  geometry: Omit<Geometry, "sha256">;
  warnings: string[];
};
const LIMIT = 200000,
  MAX_BYTES = 20 * 1024 * 1024;
export function parseStl(
  buffer: ArrayBuffer,
  unit: "mm" | "inch" = "mm",
): Mesh {
  if (buffer.byteLength < 15 || buffer.byteLength > MAX_BYTES)
    throw new Error("STL deve ter até 20 MiB");
  const scale = unit === "inch" ? 25.4 : 1;
  const view = new DataView(buffer);
  const count = buffer.byteLength >= 84 ? view.getUint32(80, true) : 0;
  let points: number[] | Float32Array;
  if (count > 0 && 84 + count * 50 === buffer.byteLength) {
    if (count > LIMIT)
      throw new Error("Limite de 200 mil triângulos por análise");
    points = new Float32Array(count * 9);
    for (let i = 0; i < count; i++)
      for (let j = 0; j < 9; j++)
        points[i * 9 + j] =
          view.getFloat32(84 + i * 50 + 12 + j * 4, true) * scale;
  } else {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (!/^\s*solid\b/i.test(text) || !/endsolid/i.test(text))
      throw new Error("STL binário ou ASCII inválido");
    points = [];
    let vertices = 0;
    for (const m of text.matchAll(
      /\bvertex\s+([+-]?[\d.eE+-]+)\s+([+-]?[\d.eE+-]+)\s+([+-]?[\d.eE+-]+)/g,
    )) {
      if (++vertices > LIMIT * 3)
        throw new Error("Limite de 200 mil triângulos por análise");
      points.push(
        Number(m[1]) * scale,
        Number(m[2]) * scale,
        Number(m[3]) * scale,
      );
    }
    if (!vertices || vertices % 3)
      throw new Error("Quantidade de vértices inválida");
  }
  const positions =
    points instanceof Float32Array ? points : new Float32Array(points);
  if (positions.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6))
    throw new Error("Coordenadas inválidas ou fora do limite");
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const a = i % 3;
    min[a] = Math.min(min[a], positions[i]);
    max[a] = Math.max(max[a], positions[i]);
  }
  const size = max.map((v, i) => v - min[i]) as [number, number, number];
  if (size.some((v) => v <= 0 || v > 3000))
    throw new Error(
      "Modelo deve ter volume 3D e dimensões até 3.000 mm. Confirme a unidade.",
    );
  let area = 0,
    volume = 0,
    degenerate = 0;
  const edges = new Map<string, { count: number; direction: number }>();
  const anchor = Array.from(positions.slice(0, 3));
  const key = (i: number) =>
    [0, 1, 2].map((a) => Math.round(positions[i + a] * 100000)).join(",");
  for (let i = 0; i < positions.length; i += 9) {
    const a = Array.from(positions.slice(i, i + 3)),
      b = Array.from(positions.slice(i + 3, i + 6)),
      c = Array.from(positions.slice(i + 6, i + 9));
    const u = b.map((v, j) => v - a[j]),
      v = c.map((v, j) => v - a[j]);
    const n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ],
      triangleArea = Math.hypot(...n) / 2;
    if (triangleArea < 1e-10) {
      degenerate++;
      continue;
    }
    area += triangleArea;
    const aa = a.map((v, j) => v - anchor[j]),
      bb = b.map((v, j) => v - anchor[j]),
      cc = c.map((v, j) => v - anchor[j]);
    volume +=
      (aa[0] * (bb[1] * cc[2] - bb[2] * cc[1]) +
        aa[1] * (bb[2] * cc[0] - bb[0] * cc[2]) +
        aa[2] * (bb[0] * cc[1] - bb[1] * cc[0])) /
      6;
    const keys = [key(i), key(i + 3), key(i + 6)];
    for (let j = 0; j < 3; j++) {
      const p = keys[j],
        q = keys[(j + 1) % 3],
        name = p < q ? p + "|" + q : q + "|" + p;
      const old = edges.get(name) || { count: 0, direction: 0 };
      old.count++;
      old.direction += p < q ? 1 : -1;
      edges.set(name, old);
    }
  }
  let boundary = 0,
    nonmanifold = 0,
    inconsistent = 0;
  for (const e of edges.values()) {
    if (e.count === 1) boundary++;
    else if (e.count !== 2) nonmanifold++;
    else if (e.direction !== 0) inconsistent++;
  }
  const closed =
    boundary === 0 &&
    nonmanifold === 0 &&
    inconsistent === 0 &&
    degenerate === 0;
  const warnings = [
    "STL não contém unidade: análise convertida para mm conforme sua escolha. A malha fica neste dispositivo.",
    "Análise topológica básica: não detecta todas as auto-interseções, ilhas ou cavidades. Não equivale a reparo nem a certificação de impressão.",
  ];
  if (!closed)
    warnings.push(
      "Malha aberta, inconsistente ou degenerada: volume não estimado. Repare no CAD/fatiador antes de imprimir.",
    );
  return {
    positions,
    geometry: {
      triangles: positions.length / 9,
      size_mm: size,
      area_mm2: area,
      volume_mm3: closed ? Math.abs(volume) : null,
      boundary_edges: boundary,
      nonmanifold_edges: nonmanifold,
      inconsistent_edges: inconsistent,
      degenerate_triangles: degenerate,
    },
    warnings,
  };
}
export function orientedStl(
  positions: Float32Array,
  rotation: [number, number, number],
): Uint8Array {
  if (
    positions.length % 9 ||
    positions.length / 9 > LIMIT ||
    !rotation.every((n) => Number.isFinite(n) && Math.abs(n) <= 360)
  )
    throw new Error("Orientação inválida");
  const angles = rotation.map((a) => (a * Math.PI) / 180),
    cs = angles.map(Math.cos),
    ss = angles.map(Math.sin),
    out = new Float32Array(positions.length),
    min = [Infinity, Infinity, Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    let [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
    [y, z] = [y * cs[0] - z * ss[0], y * ss[0] + z * cs[0]];
    [x, z] = [x * cs[1] + z * ss[1], -x * ss[1] + z * cs[1]];
    [x, y] = [x * cs[2] - y * ss[2], x * ss[2] + y * cs[2]];
    [x, y, z].forEach((v, a) => {
      out[i + a] = v;
      min[a] = Math.min(min[a], out[i + a]);
    });
  }
  for (let i = 0; i < out.length; i++) out[i] -= min[i % 3];
  const bytes = new Uint8Array(84 + (out.length / 9) * 50),
    view = new DataView(bytes.buffer);
  bytes.set(
    new TextEncoder().encode(
      "GameForge STL copy | millimeters | orientation only",
    ),
  );
  view.setUint32(80, out.length / 9, true);
  for (let i = 0; i < out.length; i += 9) {
    const o = 84 + (i / 9) * 50,
      u = [
        out[i + 3] - out[i],
        out[i + 4] - out[i + 1],
        out[i + 5] - out[i + 2],
      ],
      v = [
        out[i + 6] - out[i],
        out[i + 7] - out[i + 1],
        out[i + 8] - out[i + 2],
      ],
      n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ],
      len = Math.hypot(...n);
    for (let a = 0; a < 3; a++)
      view.setFloat32(o + a * 4, len ? n[a] / len : 0, true);
    for (let a = 0; a < 9; a++)
      view.setFloat32(o + 12 + a * 4, out[i + a], true);
  }
  return bytes;
}
export function rotatedSize(
  positions: Float32Array,
  rotation: [number, number, number],
) {
  const data = orientedStl(positions, rotation);
  const max = [0, 0, 0];
  const v = new DataView(data.buffer);
  for (let i = 0; i < positions.length / 9; i++)
    for (let j = 0; j < 9; j++)
      max[j % 3] = Math.max(
        max[j % 3],
        v.getFloat32(84 + i * 50 + 12 + j * 4, true),
      );
  return max as [number, number, number];
}
