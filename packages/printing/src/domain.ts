import { z } from "zod";
import { slicer, slicers } from "./catalog.js";
const positive = z.number().finite().positive();
const dimensions = z.tuple([
  positive.max(3000),
  positive.max(3000),
  positive.max(3000),
]);
export const fdmSettings = z.strictObject({
  layer_height: z.number().min(0.04).max(1),
  nozzle_temperature: z.number().min(0).max(450),
  bed_temperature: z.number().min(0).max(150),
  outer_speed: z.number().min(1).max(500),
  inner_speed: z.number().min(1).max(700),
  first_layer_speed: z.number().min(1).max(150),
  walls: z.number().int().min(1).max(20),
  infill: z.number().min(0).max(100),
  fan: z.number().min(0).max(100),
  supports: z.boolean(),
  brim: z.number().min(0).max(30),
});
export const resinSettings = z.strictObject({
  layer_height: z.number().min(0.01).max(0.2),
  exposure_s: z.number().min(0.1).max(120),
  bottom_exposure_s: z.number().min(1).max(180),
  bottom_layers: z.number().int().min(1).max(20),
  lift_distance_mm: z.number().min(0.5).max(30),
  lift_speed_mm_min: z.number().min(1).max(600),
  retract_speed_mm_min: z.number().min(1).max(600),
  rest_after_retract_s: z.number().min(0).max(60),
});
export type FdmSettings = z.infer<typeof fdmSettings>;
export type ResinSettings = z.infer<typeof resinSettings>;
const common = {
  slicer: z.enum(slicers.map((s) => s.id)),
  printer: z.string().trim().min(2).max(100),
  material: z.string().trim().min(2).max(120),
  goal: z.enum(["quality", "speed", "strength", "supports"]),
  problem: z.enum([
    "none",
    "stringing",
    "warping",
    "weak_layers",
    "poor_surface",
    "support_marks",
    "detachment",
    "layer_failure",
  ]),
  notes: z.string().max(500),
  build_volume: dimensions,
  limits_confirmed: z.literal(true),
};
export const briefSchema = z
  .union([
    z.strictObject({
      ...common,
      slicer: z.enum(
        slicers.filter((s) => s.technology === "fdm").map((s) => s.id),
      ),
      technology: z.literal("fdm"),
      nozzle: positive.min(0.1).max(2),
      line_width: positive.min(0.1).max(3),
      max_nozzle: positive.max(450),
      max_bed: z.number().min(0).max(150),
      material_min: positive.max(450),
      material_max: positive.max(450),
      max_flow: positive.max(100),
      current: fdmSettings,
    }),
    z.strictObject({
      ...common,
      slicer: z.enum(
        slicers
          .filter((s) => s.technology === "resin" && s.id !== "preform")
          .map((s) => s.id),
      ),
      technology: z.literal("resin"),
      resin_temperature_c: z.number().min(5).max(60),
      resin_min_c: z.number().min(5).max(60),
      resin_max_c: z.number().min(5).max(60),
      exposure_calibrated: z.literal(true),
      layer_calibrated_mm: z.number().min(0.01).max(0.2),
      exposure_min_s: positive.max(120),
      exposure_max_s: positive.max(120),
      max_lift_speed: positive.max(600),
      max_retract_speed: positive.max(600),
      max_lift_distance: positive.max(30),
      current: resinSettings,
    }),
    z.strictObject({
      ...common,
      technology: z.literal("resin"),
      slicer: z.literal("preform"),
    }),
  ])
  .superRefine((b, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (slicer(b.slicer).technology !== b.technology)
      fail("Fatiador e tecnologia incompatíveis");
    if (b.technology === "fdm") {
      if (b.material_min > b.material_max || b.material_min > b.max_nozzle)
        fail("Faixa do material incompatível com a impressora");
      if (b.line_width < b.nozzle * 0.8 || b.line_width > b.nozzle * 1.5)
        fail("Largura de linha deve estar entre 80% e 150% do bico");
      if (
        b.current.nozzle_temperature < b.material_min ||
        b.current.nozzle_temperature > Math.min(b.max_nozzle, b.material_max) ||
        b.current.bed_temperature > b.max_bed ||
        b.current.layer_height > b.nozzle * 0.75
      )
        fail("Perfil atual excede os limites informados");
    } else if (b.slicer !== "preform") {
      if (
        b.resin_min_c > b.resin_max_c ||
        b.resin_temperature_c < b.resin_min_c ||
        b.resin_temperature_c > b.resin_max_c
      )
        fail(
          "Estabilize a resina dentro da faixa da ficha técnica antes de calibrar",
        );
      if (
        b.exposure_min_s > b.exposure_max_s ||
        b.current.exposure_s < b.exposure_min_s ||
        b.current.exposure_s > b.exposure_max_s
      )
        fail("Exposição atual fora da faixa calibrada");
      if (b.current.layer_height !== b.layer_calibrated_mm)
        fail("Informe a altura de camada usada na calibração de exposição");
      if (
        b.current.lift_speed_mm_min > b.max_lift_speed ||
        b.current.retract_speed_mm_min > b.max_retract_speed ||
        b.current.lift_distance_mm > b.max_lift_distance
      )
        fail("Movimento atual excede os limites da impressora");
    }
  });
export type PrintBrief = z.infer<typeof briefSchema>;
export const geometrySchema = z.strictObject({
  triangles: z.number().int().min(1).max(200000),
  size_mm: dimensions,
  area_mm2: positive,
  volume_mm3: z.number().min(0).nullable(),
  boundary_edges: z.number().int().min(0),
  nonmanifold_edges: z.number().int().min(0),
  inconsistent_edges: z.number().int().min(0),
  degenerate_triangles: z.number().int().min(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Geometry = z.infer<typeof geometrySchema>;
export const proposalSchema = z.strictObject({
  summary: z.string().min(1).max(1500),
  rationale: z.array(z.string().max(600)).min(1).max(12),
  calibration: z.array(z.string().max(600)).min(1).max(10),
  fdm: fdmSettings.nullable(),
  resin: resinSettings.nullable(),
});
export type Proposal = z.infer<typeof proposalSchema>;
export type PrintPlan = Proposal & {
  credits_used?: number;
  credits_reserved?: number;
  source: "local" | "anthropic" | "openai";
  model: string;
  warnings: string[];
};
export function validateProposal(brief: PrintBrief, value: unknown): Proposal {
  const p = proposalSchema.parse(value);
  if (brief.technology === "fdm") {
    if (!p.fdm || p.resin) throw new Error("Plano deve conter somente FDM");
    const v = p.fdm;
    if (
      v.nozzle_temperature < brief.material_min ||
      v.nozzle_temperature > Math.min(brief.material_max, brief.max_nozzle) ||
      v.bed_temperature > brief.max_bed ||
      v.layer_height > brief.nozzle * 0.75 ||
      v.layer_height < brief.nozzle * 0.15
    )
      throw new Error("Plano excede limites térmicos ou de camada");
    if (
      Math.max(v.outer_speed, v.inner_speed, v.first_layer_speed) *
        brief.line_width *
        v.layer_height >
      brief.max_flow + 0.01
    )
      throw new Error("Plano excede vazão volumétrica informada");
  } else if (brief.slicer === "preform") {
    if (p.fdm || p.resin)
      throw new Error(
        "PreForm utiliza somente recomendações guiadas, sem valores de exposição/movimento",
      );
  } else {
    if (!p.resin || p.fdm) throw new Error("Plano deve conter somente resina");
    const v = p.resin;
    if (
      v.layer_height !== brief.layer_calibrated_mm ||
      v.exposure_s < brief.exposure_min_s ||
      v.exposure_s > brief.exposure_max_s ||
      v.bottom_exposure_s < v.exposure_s ||
      v.lift_speed_mm_min > brief.max_lift_speed ||
      v.retract_speed_mm_min > brief.max_retract_speed ||
      v.lift_distance_mm > brief.max_lift_distance
    )
      throw new Error("Plano excede limites calibrados de resina");
  }
  return p;
}
const round = (v: number, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function localPlan(input: unknown): PrintPlan {
  const b = briefSchema.parse(input),
    warnings = [
      "Ponto de partida para teste. Não certifica resistência, encaixe, segurança ou ausência de falhas. Reimporte a cópia do perfil e confira a prévia de camadas antes de imprimir.",
    ];
  let fdm: FdmSettings | null = null,
    resin: ResinSettings | null = null;
  const rationale: string[] = [],
    calibration: string[] = [];
  if (b.technology === "fdm") {
    fdm = { ...b.current };
    fdm.layer_height = round(
      clamp(
        b.goal === "quality"
          ? b.nozzle * 0.3
          : b.goal === "speed"
            ? b.nozzle * 0.65
            : b.nozzle * 0.5,
        Math.max(0.04, b.nozzle * 0.15),
        Math.min(1, b.nozzle * 0.75),
      ),
    );
    fdm.walls =
      b.goal === "strength" ? Math.max(4, fdm.walls) : Math.max(2, fdm.walls);
    fdm.infill = b.goal === "strength" ? Math.max(30, fdm.infill) : fdm.infill;
    const thermal =
      b.problem === "weak_layers" ? 5 : b.problem === "stringing" ? -5 : 0;
    fdm.nozzle_temperature = clamp(
      fdm.nozzle_temperature + thermal,
      b.material_min,
      Math.min(b.material_max, b.max_nozzle),
    );
    if (b.problem === "warping") fdm.brim = Math.max(6, fdm.brim);
    if (b.goal === "supports")
      rationale.push(
        "O suporte depende da orientação e das ilhas reais do modelo. Revise a prévia; não desativamos suportes só para reduzir material.",
      );
    const factor = b.goal === "quality" ? 0.75 : b.goal === "speed" ? 1.15 : 1;
    const cap = b.max_flow / (b.line_width * fdm.layer_height);
    if (cap < 1)
      throw new Error(
        "A vazão informada não permite a velocidade mínima de 1 mm/s nessa camada. Confira a vazão e a altura de camada.",
      );
    const capSpeed = (speed: number) =>
      Math.min(round(speed, 1), Math.floor(cap * 10) / 10);
    fdm.outer_speed = capSpeed(
      Math.max(1, Math.min(500, fdm.outer_speed * factor, cap)),
    );
    fdm.inner_speed = capSpeed(
      Math.max(1, Math.min(700, fdm.inner_speed * factor, cap)),
    );
    fdm.first_layer_speed = capSpeed(
      Math.max(1, Math.min(fdm.first_layer_speed, 150, cap)),
    );
    rationale.push(
      `Altura de ${fdm.layer_height} mm respeita o bico de ${b.nozzle} mm. Velocidades limitadas à vazão de ${b.max_flow} mm³/s.`,
      `Temperatura fica entre ${b.material_min} °C e ${Math.min(b.material_max, b.max_nozzle)} °C. Mesa e ventilação são preservadas: dependem do material e da superfície.`,
    );
    if (b.problem === "stringing")
      calibration.push(
        "Seque o material conforme fabricante e faça teste de retração. Retração/pressure advance permanecem no perfil original; não há ajuste universal seguro.",
      );
    calibration.push(
      "Imprima torre de temperatura dentro da faixa do fabricante; depois calibre fluxo e vazão máxima.",
      "Use uma pequena amostra da peça para avaliar superfície, adesão, encaixe e marcas dos suportes.",
      "Compare a prévia de camadas e o tempo estimado no próprio fatiador. Não há promessa de redução de tempo ou material.",
    );
  } else {
    if (b.slicer !== "preform") {
      resin = { ...b.current };
      if (b.problem === "detachment" || b.problem === "layer_failure") {
        resin.lift_speed_mm_min = round(
          Math.max(1, resin.lift_speed_mm_min * 0.8),
          1,
        );
        resin.rest_after_retract_s = round(
          Math.max(1, resin.rest_after_retract_s),
          1,
        );
      }
      rationale.push(
        "A altura de camada e a exposição calibradas foram preservadas. Mudar a camada exige calibrar novamente.",
        "Velocidades de elevação/retração usam mm/min; confirme se o fatiador usa movimento em um ou dois estágios. Não copie esses números para mm/s.",
      );
    } else
      rationale.push(
        "PreForm usa parâmetros e materiais oficiais, incluindo energia de exposição. Não convertemos segundos nem sobrescrevemos parâmetros do perfil oficial.",
      );
    calibration.push(
      "Confirme impressora, resina, versão do perfil e temperatura real da resina; não confunda temperatura do ambiente com a da cuba.",
      "Faça o teste de exposição recomendado pelo fabricante na mesma camada e condição térmica.",
      "Inspecione ilhas, áreas de sucção, pontes, contatos e drenagem na prévia. Não feche cavidades com resina retida.",
      "Para reduzir marcas, reoriente a peça e revise contatos em faces não críticas. Faça uma amostra antes do lote.",
    );
    warnings.push(
      "A seção trata SLA/MSLA/DLP por orientação de processo; não envia comandos à máquina e não gera suportes, furos de drenagem nem arquivos fatiados.",
    );
  }
  const proposal = validateProposal(b, {
    summary:
      b.technology === "fdm"
        ? "Perfil FDM proposto para revisão"
        : "Revisão de processo para resina",
    rationale,
    calibration,
    fdm,
    resin,
  });
  return { ...proposal, source: "local", model: "printing-rules-v1", warnings };
}
export const settingLabels: Record<string, { label: string; unit: string }> = {
  layer_height: { label: "Altura de camada", unit: "mm" },
  nozzle_temperature: { label: "Temperatura do bico", unit: "°C" },
  bed_temperature: { label: "Temperatura da mesa", unit: "°C" },
  outer_speed: { label: "Parede externa", unit: "mm/s" },
  inner_speed: { label: "Parede interna", unit: "mm/s" },
  first_layer_speed: { label: "Primeira camada", unit: "mm/s" },
  walls: { label: "Perímetros / paredes", unit: "" },
  infill: { label: "Preenchimento", unit: "%" },
  fan: { label: "Ventilação", unit: "%" },
  supports: { label: "Suportes", unit: "" },
  brim: { label: "Largura do brim", unit: "mm" },
  exposure_s: { label: "Exposição normal", unit: "s" },
  bottom_exposure_s: { label: "Exposição da base", unit: "s" },
  bottom_layers: { label: "Camadas de base", unit: "" },
  lift_distance_mm: { label: "Distância de elevação (total)", unit: "mm" },
  lift_speed_mm_min: { label: "Velocidade de elevação", unit: "mm/min" },
  retract_speed_mm_min: { label: "Velocidade de retorno", unit: "mm/min" },
  rest_after_retract_s: { label: "Repouso após retorno", unit: "s" },
};
export function differences(b: PrintBrief, p: Proposal) {
  if (b.slicer === "preform") return [];
  const target = b.technology === "fdm" ? p.fdm : p.resin;
  if (!target) throw new Error("Tecnologia incompatível");
  return Object.entries(target).map(([key, after]) => ({
    key,
    ...settingLabels[key],
    before: (b.current as Record<string, number | boolean>)[key],
    after,
    changed: (b.current as Record<string, number | boolean>)[key] !== after,
  }));
}
