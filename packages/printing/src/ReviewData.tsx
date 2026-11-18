const labels: Record<string, string> = {
  area_mm2: "Área (mm²)",
  boundary_edges: "Arestas abertas",
  nonmanifold_edges: "Arestas não manifold",
  inconsistent_edges: "Arestas inconsistentes",
  degenerate_triangles: "Triângulos degenerados",
  exposure_s: "Exposição (s)",
  bottom_exposure_s: "Exposição da base (s)",
  lift_distance_mm: "Distância de elevação (mm)",
  lift_speed_mm_min: "Elevação (mm/min)",
  retract_speed_mm_min: "Retorno (mm/min)",
  rest_after_retract_s: "Repouso após retorno (s)",
  brief: "Cenário de impressão",
  geometry: "Resumo da geometria",
  technology: "Tecnologia",
  slicer: "Fatiador",
  printer: "Impressora",
  material: "Material",
  goal: "Objetivo",
  problem: "Problema",
  notes: "Observações",
  build_volume: "Volume de impressão (mm)",
  limits_confirmed: "Limites confirmados",
  nozzle: "Bico (mm)",
  line_width: "Largura de linha (mm)",
  max_nozzle: "Limite do bico (°C)",
  max_bed: "Limite da mesa (°C)",
  material_min: "Temperatura mínima do material (°C)",
  material_max: "Temperatura máxima do material (°C)",
  max_flow: "Fluxo máximo (mm³/s)",
  resin_temperature_c: "Temperatura da resina (°C)",
  resin_min_c: "Temperatura mínima da resina (°C)",
  resin_max_c: "Temperatura máxima da resina (°C)",
  exposure_calibrated: "Exposição calibrada",
  layer_calibrated_mm: "Camada calibrada (mm)",
  exposure_min_s: "Exposição mínima (s)",
  exposure_max_s: "Exposição máxima (s)",
  max_lift_speed: "Elevação máxima (mm/min)",
  max_retract_speed: "Retorno máximo (mm/min)",
  max_lift_distance: "Distância máxima (mm)",
  current: "Parâmetros atuais",
  constraints: "Limites informados",
  fdm: "FDM",
  resin: "Resina",
  layer_height: "Altura de camada (mm)",
  nozzle_temperature: "Temperatura do bico (°C)",
  bed_temperature: "Temperatura da mesa (°C)",
  outer_speed: "Parede externa (mm/s)",
  inner_speed: "Parede interna (mm/s)",
  first_layer_speed: "Primeira camada (mm/s)",
  walls: "Paredes",
  infill: "Preenchimento (%)",
  fan: "Ventilação (%)",
  supports: "Suportes",
  brim: "Brim (mm)",
  exposure: "Exposição (s)",
  bottom_exposure: "Exposição da base (s)",
  bottom_layers: "Camadas da base",
  lift_distance: "Elevação (mm)",
  lift_speed: "Velocidade de elevação (mm/min)",
  retract_speed: "Velocidade de retorno (mm/min)",
  rest_time: "Tempo de repouso (s)",
  triangles: "Triângulos",
  size_mm: "Dimensões (mm)",
  bounds: "Limites da peça",
  volume_mm3: "Volume (mm³)",
  surface_mm2: "Área (mm²)",
  closed: "Malha fechada",
  warnings: "Avisos",
  sha256: "Identificação SHA-256",
  format: "Formato",
  min: "Mínimo",
  max: "Máximo",
  original_size_mm: "Dimensões originais (mm)",
  rotation: "Orientação",
  x: "X",
  y: "Y",
  z: "Z",
};
const values: Record<string, string> = {
  fdm: "FDM — filamento",
  resin: "Resina",
  weak_layers: "Camadas frágeis",
  poor_surface: "Superfície irregular",
  support_marks: "Marcas de suporte",
  detachment: "Descolamento",
  layer_failure: "Falha de camada",
  quality: "Qualidade",
  speed: "Velocidade",
  strength: "Resistência",
  balanced: "Equilíbrio",
  supports: "Suportes",
  none: "Nenhum",
  warping: "Empenamento",
  stringing: "Fios entre partes",
  adhesion: "Adesão",
  delamination: "Separação de camadas",
  dimensions: "Precisão dimensional",
  success: "Taxa de sucesso",
};
export function ReviewData({
  value,
  depth = 0,
  field = "",
}: {
  value: unknown;
  depth?: number;
  field?: string;
}) {
  if (value === null || value === undefined) return <span>Não informado</span>;
  if (typeof value === "boolean")
    return <span>{value ? "Confirmado" : "Não"}</span>;
  if (typeof value === "number")
    return (
      <span>{value.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</span>
    );
  if (typeof value === "string")
    return (
      <span>
        {(["technology", "goal", "problem"].includes(field) &&
        Object.hasOwn(values, value)
          ? values[value]
          : value) || "Sem observações"}
      </span>
    );
  if (Array.isArray(value))
    return (
      <span>
        {value
          .map((v) =>
            typeof v === "number"
              ? v.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
              : String(v),
          )
          .join(" · ") || "Nenhum"}
      </span>
    );
  if (typeof value !== "object" || depth > 6)
    return <span>Dados indisponíveis</span>;
  return (
    <dl className="print-review-data">
      {Object.entries(value).map(([key, v]) => (
        <div key={key}>
          <dt>
            {Object.hasOwn(labels, key)
              ? labels[key]
              : key.replaceAll("_", " ")}
          </dt>
          <dd>
            <ReviewData value={v} depth={depth + 1} field={key} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
