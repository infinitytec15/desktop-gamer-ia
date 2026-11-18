import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { slicer } from "./catalog.js";
import { validateProposal, type PrintBrief, type Proposal } from "./domain.js";
type Patch = { field: string; before: unknown; after: unknown };
export type ProfileExport = {
  bytes: Uint8Array;
  extension: string;
  patches: Patch[];
  skipped: string[];
  warning: string;
};
const MAX = 1024 * 1024;
function decode(b: Uint8Array) {
  if (b.length > MAX) throw new Error("Perfil excede 1 MiB");
  return new TextDecoder("utf-8", { fatal: true }).decode(b);
}
function scanCredentials(text: string) {
  if (
    /(?:api[_ -]?key|password|access[_ -]?token|secret|printhost[_ -]?apikey)\s*["']?\s*[:=]\s*["']?[^\s"'\r\n,;\]}]{3}/i.test(
      text,
    )
  )
    throw new Error(
      "Perfil contém campos de credencial. Exporte somente processo/filamento, sem impressoras físicas.",
    );
}
function values(b: PrintBrief, p: Proposal) {
  validateProposal(b, {
    summary: p.summary,
    rationale: p.rationale,
    calibration: p.calibration,
    fdm: p.fdm,
    resin: p.resin,
  });
  if (b.technology !== "fdm" || !p.fdm)
    throw new Error("Este fatiador de resina requer aplicação guiada");
  return p.fdm;
}
function scalar(original: unknown, value: number | boolean | string): unknown {
  if (Array.isArray(original)) {
    if (original.length !== 1)
      throw new Error(
        "Preset com múltiplos extrusores/valores: exporte um preset individual para evitar alterar todos os materiais.",
      );
    return [scalar(original[0], value)];
  }
  if (typeof original === "number") {
    if (typeof value === "string") {
      const parsed = Number(value.replace(/%$/, ""));
      if (!Number.isFinite(parsed))
        throw new Error("Formato numérico incompatível");
      return parsed;
    }
    if (typeof value !== "number") return value ? 1 : 0;
    return value;
  }
  if (typeof original === "boolean") return Boolean(value);
  if (typeof original !== "string" || /[=\n\r]/.test(original))
    throw new Error("Campo usa fórmula ou formato não suportado");
  if (typeof value === "boolean")
    return original === "true" || original === "false"
      ? String(value)
      : value
        ? "1"
        : "0";
  return String(value);
}
export function patchProfile(
  bytes: Uint8Array,
  brief: PrintBrief,
  proposal: Proposal,
  plate: "textured" | "smooth" | "cool" | "engineering" = "textured",
): ProfileExport {
  const type = slicer(brief.slicer).adapter,
    v = values(brief, proposal);
  if (type === "guided")
    throw new Error(
      "Formato proprietário: use a tabela guiada ou o relatório JSON/CSV, sem renomear como preset nativo.",
    );
  const patches: Patch[] = [],
    skipped: string[] = [];
  const applyJson = (text: string) => {
    scanCredentials(text);
    const obj = JSON.parse(text);
    if (
      !obj ||
      Array.isArray(obj) ||
      typeof obj !== "object" ||
      !["process", "filament"].includes(obj.type)
    )
      throw new Error("Use um preset individual JSON de processo ou filamento");
    let mapping: Record<string, number | boolean | string>;
    if (obj.type === "process")
      mapping = {
        layer_height: v.layer_height,
        outer_wall_speed: v.outer_speed,
        inner_wall_speed: v.inner_speed,
        initial_layer_speed: v.first_layer_speed,
        wall_loops: v.walls,
        sparse_infill_density: v.infill + "%",
        enable_support: v.supports,
        brim_width: v.brim,
      };
    else {
      const bed =
        plate === "textured"
          ? "textured_plate_temp"
          : plate === "smooth"
            ? "hot_plate_temp"
            : plate === "cool"
              ? "cool_plate_temp"
              : "eng_plate_temp";
      mapping = {
        nozzle_temperature: v.nozzle_temperature,
        nozzle_temperature_initial_layer: v.nozzle_temperature,
        [bed]: v.bed_temperature,
        [bed + "_initial_layer"]: v.bed_temperature,
      };
    }
    for (const [field, value] of Object.entries(mapping)) {
      if (!Object.hasOwn(obj, field)) {
        skipped.push(field);
        continue;
      }
      try {
        const after = scalar(obj[field], value);
        if (JSON.stringify(after) !== JSON.stringify(obj[field])) {
          patches.push({ field, before: obj[field], after });
          obj[field] = after;
        }
      } catch (e) {
        skipped.push(field + ": " + (e as Error).message);
      }
    }
    if (!patches.length)
      throw new Error(
        "Nenhum campo compatível precisa de alteração. Confira categoria e valores do preset.",
      );
    return JSON.stringify(obj, null, 2) + "\n";
  };
  const patchIni = (text: string, family: "cura" | "prusa", entry = "") => {
    scanCredentials(text);
    if (family === "prusa" && /^\s*\[/m.test(text))
      throw new Error(
        "Use Export Config .ini simples, sem bundle/seções de impressoras",
      );
    let section = "";
    const mapping: Record<string, number | boolean | string> =
      family === "cura"
        ? {
            layer_height: v.layer_height,
            speed_wall_0: v.outer_speed,
            speed_wall_x: v.inner_speed,
            speed_layer_0: v.first_layer_speed,
            wall_line_count: v.walls,
            infill_sparse_density: v.infill,
            support_enable: v.supports,
            brim_width: v.brim,
            material_print_temperature: v.nozzle_temperature,
            material_print_temperature_layer_0: v.nozzle_temperature,
            material_bed_temperature: v.bed_temperature,
            material_bed_temperature_layer_0: v.bed_temperature,
          }
        : {
            layer_height: v.layer_height,
            external_perimeter_speed: v.outer_speed,
            perimeter_speed: v.inner_speed,
            first_layer_speed: v.first_layer_speed,
            perimeters: v.walls,
            fill_density: v.infill + "%",
            support_material: v.supports,
            brim_width: v.brim,
            temperature: v.nozzle_temperature,
            first_layer_temperature: v.nozzle_temperature,
            bed_temperature: v.bed_temperature,
            first_layer_bed_temperature: v.bed_temperature,
          };
    const lines = text.split(/\r?\n/).map((line) => {
      const head = line.match(/^\s*\[([^\]]+)\]/);
      if (head) section = head[1];
      const match = line.match(/^(\s*)([a-zA-Z0-9_]+)(\s*=\s*)(.*)$/);
      if (!match || (family === "cura" && section !== "values")) return line;
      const key = match[2],
        original = match[4];
      if (!Object.hasOwn(mapping, key)) return line;
      if (
        original.startsWith("=") ||
        (/[,;]|%/.test(original) && key !== "fill_density")
      ) {
        skipped.push(
          entry +
            key +
            ": fórmula, percentual ou múltiplos valores preservados",
        );
        return line;
      }
      let after =
        typeof mapping[key] === "boolean"
          ? family === "cura"
            ? mapping[key]
              ? "True"
              : "False"
            : mapping[key]
              ? "1"
              : "0"
          : String(mapping[key]);
      if (after !== original) {
        patches.push({ field: entry + key, before: original, after });
        return match[1] + key + match[3] + after;
      }
      return line;
    });
    return lines.join("\n");
  };
  let output: Uint8Array, extension: string;
  if (type === "json") {
    output = strToU8(applyJson(decode(bytes)));
    extension = "json";
  } else if (type === "ini") {
    output = strToU8(patchIni(decode(bytes), "prusa"));
    extension = "ini";
  } else {
    if (bytes.length > MAX || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
      throw new Error("Cura exige ZIP .curaprofile real");
    let total = 0,
      files = 0;
    const archive = unzipSync(bytes, {
      filter: (e) => {
        files++;
        total += e.originalSize;
        if (
          files > 16 ||
          !Number.isFinite(e.originalSize) ||
          total > MAX ||
          e.name.includes("..") ||
          /[/\\]/.test(e.name)
        )
          throw new Error(
            "Pacote Cura excede limites ou contém caminhos não permitidos",
          );
        return true;
      },
    });
    for (const [name, data] of Object.entries(archive)) {
      const text = decode(data);
      if (
        !/\[general\]/.test(text) ||
        !/\[metadata\]/.test(text) ||
        !/\[values\]/.test(text)
      )
        throw new Error("Container Cura inválido");
      archive[name] = strToU8(patchIni(text, "cura", name + ":"));
    }
    output = zipSync(archive);
    extension = "curaprofile";
  }
  if (!patches.length)
    throw new Error(
      "Nenhum campo existente foi alterado. Parâmetros herdados devem ser ajustados no fatiador.",
    );
  return {
    bytes: output,
    extension,
    patches,
    skipped,
    warning:
      "Cópia validada estruturalmente, ainda não homologada na sua versão do fatiador. O nome interno foi preservado: importe somente uma cópia previamente duplicada e confira se a importação substituirá essa cópia. Campos não listados, G-code e limites de máquina não foram modificados.",
  };
}
