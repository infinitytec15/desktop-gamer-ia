import { printerCatalog } from "./printers.js";
import {
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  useState,
  useMemo,
  useEffect,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import {
  briefSchema,
  localPlan,
  validateProposal,
  differences,
  settingLabels,
  type PrintBrief,
  type PrintPlan,
  type Geometry,
  type FdmSettings,
  type ResinSettings,
} from "./domain.js";
import { slicers, slicer } from "./catalog.js";
import { orientedStl, rotatedSize } from "./mesh.js";
import { patchProfile, type ProfileExport } from "./profiles.js";
const MeshPreview = lazy(() => import("./MeshPreview.js"));
type Draft = {
  brand: string;
  technology: "fdm" | "resin";
  slicer: string;
  printer: string;
  material: string;
  goal: string;
  problem: string;
  notes: string;
  build_volume: [number, number, number];
  limits_confirmed: boolean;
  nozzle: number;
  line_width: number;
  max_nozzle: number;
  max_bed: number;
  material_min: number;
  material_max: number;
  max_flow: number;
  resin_temperature_c: number;
  resin_min_c: number;
  resin_max_c: number;
  exposure_calibrated: boolean;
  layer_calibrated_mm: number;
  exposure_min_s: number;
  exposure_max_s: number;
  max_lift_speed: number;
  max_retract_speed: number;
  max_lift_distance: number;
  fdm: FdmSettings;
  resin: ResinSettings;
};
const initial: Draft = {
  brand: "Bambu Lab",
  technology: "fdm",
  slicer: "bambu",
  printer: "",
  material: "PLA",
  goal: "quality",
  problem: "none",
  notes: "",
  build_volume: [220, 220, 250],
  limits_confirmed: false,
  nozzle: 0.4,
  line_width: 0.45,
  max_nozzle: 260,
  max_bed: 80,
  material_min: 190,
  material_max: 230,
  max_flow: 8,
  resin_temperature_c: 25,
  resin_min_c: 20,
  resin_max_c: 30,
  exposure_calibrated: false,
  layer_calibrated_mm: 0.05,
  exposure_min_s: 2,
  exposure_max_s: 3,
  max_lift_speed: 100,
  max_retract_speed: 150,
  max_lift_distance: 10,
  fdm: {
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
  resin: {
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
function makeBrief(d: Draft) {
  if (d.printer.trim().length < 2)
    throw new Error("Informe o modelo da impressora antes de planejar.");
  const common = {
    technology: d.technology,
    slicer: d.slicer,
    printer:
      d.printer.toLowerCase().includes(d.brand.toLowerCase()) ||
      d.brand === "Outra"
        ? d.printer
        : d.brand + " " + d.printer,
    material: d.material,
    goal: d.goal,
    problem: d.problem,
    notes: d.notes,
    build_volume: d.build_volume,
    limits_confirmed: d.limits_confirmed,
  };
  if (d.technology === "fdm")
    return briefSchema.parse({
      ...common,
      nozzle: d.nozzle,
      line_width: d.line_width,
      max_nozzle: d.max_nozzle,
      max_bed: d.max_bed,
      material_min: d.material_min,
      material_max: d.material_max,
      max_flow: d.max_flow,
      current: d.fdm,
    });
  if (d.slicer === "preform") return briefSchema.parse(common);
  return briefSchema.parse({
    ...common,
    resin_temperature_c: d.resin_temperature_c,
    resin_min_c: d.resin_min_c,
    resin_max_c: d.resin_max_c,
    exposure_calibrated: d.exposure_calibrated,
    layer_calibrated_mm: d.layer_calibrated_mm,
    exposure_min_s: d.exposure_min_s,
    exposure_max_s: d.exposure_max_s,
    max_lift_speed: d.max_lift_speed,
    max_retract_speed: d.max_retract_speed,
    max_lift_distance: d.max_lift_distance,
    current: d.resin,
  });
}
const orientations: { label: string; angles: [number, number, number] }[] = [
  { label: "Orientação original", angles: [0, 0, 0] },
  { label: "Deitar no eixo X (90°)", angles: [90, 0, 0] },
  { label: "Deitar no eixo Y (90°)", angles: [0, 90, 0] },
  { label: "Inclinar X em 35° (revisar resina)", angles: [35, 0, 0] },
];
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="print-field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
            }>,
            { id, "aria-describedby": hint ? id + "-hint" : undefined },
          )
        : children}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </div>
  );
}
function message(e: unknown) {
  const issues = (e as { issues?: { message: string }[] })?.issues;
  if (issues)
    return issues
      .map((i) =>
        i.message === "Invalid input: expected true"
          ? "Confirme os limites e a calibração antes de planejar."
          : i.message,
      )
      .join(" ");
  return e instanceof Error ? e.message : String(e);
}
function numeric(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
function display(v: unknown) {
  return typeof v === "boolean"
    ? v
      ? "Ativado"
      : "Desativado"
    : typeof v === "number"
      ? numeric(v)
      : JSON.stringify(v);
}
export type PrintingAiInput = {
  request_id: string;
  allow_fallback: boolean;
  brief: PrintBrief;
  geometry: Geometry | null;
};
export type SaveArtifact = (
  name: string,
  bytes: Uint8Array,
) => Promise<string | void>;
async function browserSave(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(
    new Blob([bytes.slice().buffer as ArrayBuffer], {
      type: "application/octet-stream",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function PrintWorkbench({
  generateAi,
  saveArtifact = browserSave,
  aiHint = "O planejamento com IA usa a licença e o saldo de créditos da sua conta.",
}: {
  generateAi?: (input: PrintingAiInput) => Promise<unknown>;
  saveArtifact?: SaveArtifact;
  aiHint?: string;
}) {
  const [draft, setDraft] = useState<Draft>(initial),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [plan, setPlan] = useState<PrintPlan | null>(null),
    [brief, setBrief] = useState<PrintBrief | null>(null),
    [reviewed, setReviewed] = useState(false),
    [consent, setConsent] = useState(false),
    [fallback, setFallback] = useState(false),
    [mesh, setMesh] = useState<{
      positions: Float32Array;
      geometry: Geometry;
      warnings: string[];
    } | null>(null),
    [meshName, setMeshName] = useState(""),
    [unit, setUnit] = useState<"mm" | "inch">("mm"),
    [orientation, setOrientation] = useState(0),
    [profile, setProfile] = useState<{
      name: string;
      bytes: Uint8Array;
      hash: string;
    } | null>(null),
    [exported, setExported] = useState<ProfileExport | null>(null),
    [duplicate, setDuplicate] = useState(false),
    [plate, setPlate] = useState<
      "textured" | "smooth" | "cool" | "engineering"
    >("textured");
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => () => workerRef.current?.terminate(), []);
  const rotation = orientations[orientation].angles;
  const size = useMemo(
    () => (mesh ? rotatedSize(mesh.positions, rotation) : null),
    [mesh, orientation],
  );
  const geometry = mesh && size ? { ...mesh.geometry, size_mm: size } : null;
  const fits =
    !size || size.every((n, i) => n <= draft.build_volume[i] + 0.001);
  const selected = slicer(draft.slicer);
  function invalidate() {
    setPlan(null);
    setConsent(false);
    setBrief(null);
    setReviewed(false);
    setExported(null);
    setError("");
    setNotice("");
  }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    invalidate();
  }
  function numberField(key: keyof Draft, label: string, step = 0.1) {
    return (
      <Field key={key} label={label}>
        <input
          type="number"
          step={step}
          value={draft[key] as number}
          onChange={(e) => update(key, Number(e.target.value) as never)}
          required
        />
      </Field>
    );
  }
  function settingsFields(kind: "fdm" | "resin") {
    return Object.entries(draft[kind]).map(([key, value]) => (
      <Field
        key={key}
        label={
          settingLabels[key].label +
          (settingLabels[key].unit ? " (" + settingLabels[key].unit + ")" : "")
        }
      >
        {typeof value === "boolean" ? (
          <select
            value={String(value)}
            onChange={(e) => {
              setDraft((d) => ({
                ...d,
                [kind]: { ...d[kind], [key]: e.target.value === "true" },
              }));
              invalidate();
            }}
          >
            <option value="true">Ativados</option>
            <option value="false">Desativados</option>
          </select>
        ) : (
          <input
            type="number"
            step={["walls", "bottom_layers"].includes(key) ? 1 : 0.01}
            value={value}
            onChange={(e) => {
              setDraft((d) => ({
                ...d,
                [kind]: { ...d[kind], [key]: Number(e.target.value) },
              }));
              invalidate();
            }}
            required
          />
        )}
      </Field>
    ));
  }
  async function loadMesh(file: File) {
    invalidate();
    setBusy(true);
    setMesh(null);
    setMeshName("");
    workerRef.current?.terminate();
    try {
      if (!/\.stl$/i.test(file.name) || file.size > 20 * 1024 * 1024)
        throw new Error(
          "Escolha um STL de até 20 MiB. Para 3MF/OBJ, exporte uma cópia STL no CAD/fatiador.",
        );
      const buffer = await file.arrayBuffer();
      const worker = new Worker(new URL("./mesh.worker.js", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;
      const result = await new Promise<{ mesh?: typeof mesh; error?: string }>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            worker.terminate();
            reject(
              new Error(
                "A análise excedeu 20 segundos. Simplifique a malha no CAD.",
              ),
            );
          }, 20000);
          worker.onmessage = (e) => {
            clearTimeout(timer);
            resolve(e.data);
            worker.terminate();
          };
          worker.onerror = () => {
            clearTimeout(timer);
            reject(new Error("Não foi possível analisar o STL"));
            worker.terminate();
          };
          worker.postMessage({ buffer, unit }, [buffer]);
        },
      );
      if (result.error) throw new Error(result.error);
      if (!result.mesh) throw new Error("Malha não disponível");
      setMesh(result.mesh);
      setMeshName(file.name);
      setOrientation(0);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function generate(ai: boolean) {
    setError("");
    setNotice("");
    setExported(null);
    setReviewed(false);
    try {
      const b = makeBrief(draft);
      if (ai && !consent)
        throw new Error("Revise os dados e autorize o envio antes de usar IA.");
      setBusy(true);
      let result = localPlan(b);
      if (ai) {
        if (!generateAi)
          throw new Error(
            "Entre na sua conta com licença válida para usar IA. O planejamento local está disponível.",
          );
        const response = await generateAi({
          request_id: crypto.randomUUID(),
          allow_fallback: fallback,
          brief: b,
          geometry,
        });
        if (!response || typeof response !== "object")
          throw new Error("Resposta inválida");
        const value = response as PrintPlan;
        const parsed = validateProposal(b, {
          summary: value.summary,
          rationale: value.rationale,
          calibration: value.calibration,
          fdm: value.fdm,
          resin: value.resin,
        });
        result = {
          ...parsed,
          source: value.source,
          model: value.model,
          warnings: Array.isArray(value.warnings) ? value.warnings : [],
        };
      }
      setBrief(b);
      setPlan(result);
      setNotice(
        "Plano pronto para revisão. Nenhuma configuração de impressora foi alterada.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(name: string, bytes: Uint8Array) {
    setError("");
    try {
      const path = await saveArtifact(name, bytes);
      setNotice(
        path
          ? "Arquivo salvo em " + path
          : "Cópia preparada para download. O arquivo original permanece intacto.",
      );
    } catch (e) {
      setError(message(e));
    }
  }
  async function loadProfile(file: File) {
    setError("");
    setExported(null);
    setDuplicate(false);
    try {
      if (file.size > 1024 * 1024) throw new Error("Perfil deve ter até 1 MiB");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      setProfile({ name: file.name, bytes, hash });
    } catch (e) {
      setError(message(e));
      setProfile(null);
    }
  }
  function report() {
    return {
      format: "gameforge-print-review-v1",
      created_at: new Date().toISOString(),
      brief,
      plan,
      geometry,
      orientation_deg: rotation,
      profile: profile
        ? {
            file: profile.name,
            original_sha256: profile.hash,
            patches: exported?.patches,
            skipped: exported?.skipped,
          }
        : null,
      status: "reviewed_export_not_applied",
      native_import_verified: false,
    };
  }
  return (
    <div className="printing-workbench">
      <div className="print-intro">
        <div>
          <h2>Uma peça. Um processo bem definido.</h2>
          <p>
            Compare parâmetros, confira a geometria e prepare uma cópia do
            perfil. A impressão começa depois da sua revisão no fatiador.
          </p>
        </div>
        <span className="print-local-label">
          STL e presets ficam neste dispositivo
        </span>
      </div>
      <div className="print-stepbar" aria-label="Etapas">
        <span>
          <b>1</b> Impressora e material
        </span>
        <span>
          <b>2</b> Peça e orientação
        </span>
        <span>
          <b>3</b> Plano e exportação
        </span>
      </div>
      {error && <p className="print-message print-error">{error}</p>}
      {notice && <p className="print-message print-success">{notice}</p>}
      <section className="print-panel">
        <header>
          <h3>1. Defina o cenário de impressão</h3>
          <p>
            Valores iniciais são exemplos editáveis, não perfis homologados de
            fabricante. Confirme os dados da sua máquina e do material.
          </p>
        </header>
        <fieldset disabled={busy} className="print-form">
          <div className="print-grid">
            <Field label="Tecnologia">
              <select
                value={draft.technology}
                onChange={(e) => {
                  const technology = e.target.value as "fdm" | "resin";
                  setDraft((d) => ({
                    ...d,
                    technology,
                    brand: technology === "fdm" ? "Bambu Lab" : "Elegoo",
                    printer: "",
                    slicer: technology === "fdm" ? "bambu" : "chitubox",
                    material: technology === "fdm" ? "PLA" : "",
                    limits_confirmed: false,
                    exposure_calibrated: false,
                  }));
                  setProfile(null);
                  invalidate();
                }}
              >
                <option value="fdm">FDM / FFF · filamento</option>
                <option value="resin">SLA / MSLA / DLP · resina</option>
              </select>
            </Field>
            <Field label="Fatiador">
              <select
                value={draft.slicer}
                onChange={(e) => {
                  update("slicer", e.target.value);
                  setProfile(null);
                }}
              >
                {slicers
                  .filter((s) => s.technology === draft.technology)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Marca da impressora">
              <select
                value={draft.brand}
                onChange={(e) => {
                  setDraft((d) => ({
                    ...d,
                    brand: e.target.value,
                    printer: "",
                    limits_confirmed: false,
                  }));
                  invalidate();
                }}
              >
                {[
                  ...new Set(
                    printerCatalog
                      .filter((p) => p.technology === draft.technology)
                      .map((p) => p.brand),
                  ),
                  "Outra",
                ].map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modelo da impressora">
              <input
                value={draft.printer}
                maxLength={100}
                list="gameforge-printer-models"
                placeholder="Escolha ou informe o modelo exato"
                onChange={(e) => update("printer", e.target.value)}
              />
            </Field>
            <datalist id="gameforge-printer-models">
              {printerCatalog
                .filter(
                  (p) =>
                    p.technology === draft.technology &&
                    p.brand === draft.brand,
                )
                .flatMap((p) => p.models)
                .map((m) => (
                  <option key={m} value={m} />
                ))}
            </datalist>
            <Field label="Material e fabricante">
              <input
                value={draft.material}
                maxLength={120}
                placeholder="Marca, linha e tipo do material"
                onChange={(e) => update("material", e.target.value)}
              />
            </Field>
            <Field label="Prioridade">
              <select
                value={draft.goal}
                onChange={(e) => update("goal", e.target.value)}
              >
                <option value="quality">Qualidade de superfície</option>
                <option value="speed">Tempo de impressão</option>
                <option value="strength">Resistência / adesão</option>
                <option value="supports">Revisão de suportes</option>
              </select>
            </Field>
            <Field label="Problema observado">
              <select
                value={draft.problem}
                onChange={(e) => update("problem", e.target.value)}
              >
                <option value="none">Preparar uma nova impressão</option>
                {(draft.technology === "fdm"
                  ? [
                      ["stringing", "Fios / stringing"],
                      ["warping", "Empenamento / descolamento"],
                      ["weak_layers", "Baixa adesão entre camadas"],
                      ["poor_surface", "Superfície irregular"],
                      ["support_marks", "Marcas de suporte"],
                    ]
                  : [
                      ["detachment", "Descolamento da base"],
                      ["layer_failure", "Falha de camadas"],
                      ["poor_surface", "Perda de detalhe"],
                      ["support_marks", "Marcas de suporte"],
                    ]
                ).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="print-grid three">
            {draft.build_volume.map((value, i) => (
              <Field
                key={i}
                label={"Volume útil " + ["X", "Y", "Z"][i] + " (mm)"}
              >
                <input
                  type="number"
                  min={1}
                  max={3000}
                  value={value}
                  onChange={(e) => {
                    const dimensions = [...draft.build_volume] as [
                      number,
                      number,
                      number,
                    ];
                    dimensions[i] = Number(e.target.value);
                    update("build_volume", dimensions);
                  }}
                />
              </Field>
            ))}
          </div>
          {draft.technology === "fdm" ? (
            <>
              <details open className="print-details">
                <summary>Limites da impressora e do filamento</summary>
                <div className="print-grid">
                  {numberField("nozzle", "Diâmetro do bico (mm)", 0.05)}
                  {numberField("line_width", "Largura de linha (mm)", 0.01)}
                  {numberField(
                    "max_nozzle",
                    "Limite do bico na impressora (°C)",
                    1,
                  )}
                  {numberField("max_bed", "Limite da mesa (°C)", 1)}
                  {numberField("material_min", "Mínimo do material (°C)", 1)}
                  {numberField("material_max", "Máximo do material (°C)", 1)}
                  {numberField(
                    "max_flow",
                    "Vazão máxima calibrada (mm³/s)",
                    0.1,
                  )}
                </div>
              </details>
              <details className="print-details" open>
                <summary>Seu perfil FDM atual</summary>
                <div className="print-grid">{settingsFields("fdm")}</div>
              </details>
            </>
          ) : draft.slicer === "preform" ? (
            <p className="print-message">
              PreForm: selecione o material e as configurações oficiais no
              software. Este fluxo fornece orientação e análise da peça; não
              traduz segundos em energia nem modifica exposição, movimentos ou
              aquecimento.
            </p>
          ) : (
            <>
              <details open className="print-details">
                <summary>Condições de resina e faixa calibrada</summary>
                <div className="print-grid">
                  {numberField(
                    "resin_temperature_c",
                    "Temperatura real da resina (°C)",
                    0.5,
                  )}
                  {numberField(
                    "resin_min_c",
                    "Mínimo da ficha técnica (°C)",
                    0.5,
                  )}
                  {numberField(
                    "resin_max_c",
                    "Máximo da ficha técnica (°C)",
                    0.5,
                  )}
                  {numberField(
                    "layer_calibrated_mm",
                    "Camada usada na calibração (mm)",
                    0.01,
                  )}
                  {numberField(
                    "exposure_min_s",
                    "Exposição mínima validada (s)",
                    0.1,
                  )}
                  {numberField(
                    "exposure_max_s",
                    "Exposição máxima validada (s)",
                    0.1,
                  )}
                  {numberField(
                    "max_lift_speed",
                    "Limite de elevação (mm/min)",
                    1,
                  )}
                  {numberField(
                    "max_retract_speed",
                    "Limite de retorno (mm/min)",
                    1,
                  )}
                  {numberField(
                    "max_lift_distance",
                    "Limite de elevação total (mm)",
                    0.1,
                  )}
                </div>
              </details>
              <details open className="print-details">
                <summary>Seu perfil de resina atual</summary>
                <div className="print-grid">{settingsFields("resin")}</div>
              </details>
              <label className="print-check">
                <input
                  type="checkbox"
                  checked={draft.exposure_calibrated}
                  onChange={(e) =>
                    update("exposure_calibrated", e.target.checked)
                  }
                />
                A exposição foi calibrada nesta impressora, resina, camada e
                temperatura.
              </label>
              <p className="print-muted">
                Movimentos são informados em mm/min, não mm/s. Valores de um
                estágio não substituem automaticamente movimentos de dois
                estágios.
              </p>
            </>
          )}
          <Field label="Detalhes da peça e critérios de aceite">
            <textarea
              rows={3}
              maxLength={500}
              value={draft.notes}
              placeholder="Encaixes, face visível, esforço esperado e o que precisa melhorar. Não informe dados confidenciais."
              onChange={(e) => update("notes", e.target.value)}
            />
          </Field>
          <label className="print-check">
            <input
              type="checkbox"
              checked={draft.limits_confirmed}
              onChange={(e) => update("limits_confirmed", e.target.checked)}
            />
            Conferi os limites no manual da impressora, na ficha do material e
            no meu perfil atual.
          </label>
        </fieldset>
      </section>
      <section className="print-panel">
        <header>
          <h3>2. Confira a peça e sua orientação</h3>
          <p>
            STL opcional, até 20 MiB / 200 mil triângulos. Geometria não é
            enviada à IA; somente as métricas revisadas podem ser enviadas.
          </p>
        </header>
        <div className="print-mesh-grid">
          <div className="print-form">
            <Field label="Unidade do arquivo STL">
              <select
                disabled={busy}
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value as "mm" | "inch");
                  setMesh(null);
                  invalidate();
                }}
              >
                <option value="mm">Milímetros</option>
                <option value="inch">Polegadas (converter para mm)</option>
              </select>
            </Field>
            <Field label="Analisar arquivo STL">
              <input
                disabled={busy}
                type="file"
                accept=".stl"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void loadMesh(file);
                  e.currentTarget.value = "";
                }}
              />
            </Field>
            {mesh && (
              <>
                <p className="print-file-name">{meshName}</p>
                <Field label="Orientação da cópia STL">
                  <select
                    value={orientation}
                    disabled={busy}
                    onChange={(e) => {
                      setOrientation(Number(e.target.value));
                      invalidate();
                    }}
                  >
                    {orientations.map((o, i) => (
                      <option value={i} key={i}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <dl className="print-metrics">
                  <div>
                    <dt>Dimensões na orientação escolhida</dt>
                    <dd>{size?.map((n) => numeric(n)).join(" × ")} mm</dd>
                  </div>
                  <div>
                    <dt>Triângulos</dt>
                    <dd>{mesh.geometry.triangles.toLocaleString("pt-BR")}</dd>
                  </div>
                  <div>
                    <dt>Volume geométrico</dt>
                    <dd>
                      {mesh.geometry.volume_mm3 === null
                        ? "Indeterminado (malha inconsistente)"
                        : numeric(mesh.geometry.volume_mm3 / 1000) + " cm³"}
                    </dd>
                  </div>
                  <div>
                    <dt>Bordas abertas / não manifold</dt>
                    <dd>
                      {mesh.geometry.boundary_edges} /{" "}
                      {mesh.geometry.nonmanifold_edges}
                    </dd>
                  </div>
                </dl>
                <p
                  className={fits ? "print-muted" : "print-message print-error"}
                >
                  {fits
                    ? "Dimensões compatíveis com o volume útil informado. Ainda é necessário conferir margem, brim, suportes e posicionamento no fatiador."
                    : "A peça não cabe no volume informado nessa orientação. Redimensione no CAD/fatiador antes de imprimir."}
                </p>
              </>
            )}
          </div>
          <div className="print-model">
            {mesh ? (
              <Suspense fallback={<p>Preparando prévia 3D…</p>}>
                <MeshPreview positions={mesh.positions} rotation={rotation} />
              </Suspense>
            ) : (
              <div className="print-model-empty">
                <span>◇</span>
                <strong>Sua peça, em perspectiva.</strong>
                <p>
                  Carregue um STL para inspecionar dimensões, malha e
                  orientação. Nada será enviado para a impressora.
                </p>
              </div>
            )}
          </div>
        </div>
        {mesh && (
          <div className="print-notes">
            {mesh.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}
      </section>
      <section className="print-panel">
        <header>
          <h3>3. Prepare um plano para revisão</h3>
          <p>
            Planejamento local não usa créditos. IA usa o mesmo saldo da sua
            conta, com reserva e acerto pelo consumo de tokens.
          </p>
        </header>
        <div className="print-form">
          <details className="print-details">
            <summary>Revisar dados que serão enviados à IA</summary>
            <pre>
              {JSON.stringify(
                {
                  brief: (() => {
                    try {
                      return makeBrief(draft);
                    } catch {
                      return "Preencha e confirme os dados do cenário primeiro";
                    }
                  })(),
                  geometry,
                },
                null,
                2,
              )}
            </pre>
          </details>
          <label className="print-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Autorizo enviar somente esses dados para gerar o plano com IA.
          </label>
          <label className="print-check">
            <input
              type="checkbox"
              checked={fallback}
              onChange={(e) => setFallback(e.target.checked)}
            />
            Permitir fallback OpenAI se o Claude falhar (também pode consumir
            créditos).
          </label>
          <div className="print-actions">
            <button
              className="print-button secondary"
              disabled={busy}
              onClick={() => void generate(false)}
            >
              {busy ? "Processando…" : "Planejar localmente"}
            </button>
            <button
              className="print-button primary"
              disabled={busy || !consent}
              onClick={() => void generate(true)}
            >
              Analisar com IA
            </button>
          </div>
          <p className="print-muted">{aiHint}</p>
        </div>
      </section>
      {plan && brief && (
        <section className="print-panel print-result">
          <header>
            <div>
              <h3>{plan.summary}</h3>
              <p>
                {plan.source === "local"
                  ? "Regras locais · sem consumo de IA"
                  : plan.source + " · " + plan.model}
              </p>
            </div>
            <span className="print-review-state">Aguardando seu aceite</span>
          </header>
          {brief.slicer !== "preform" && (
            <div className="print-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Parâmetro</th>
                    <th>Informado</th>
                    <th>Proposto</th>
                  </tr>
                </thead>
                <tbody>
                  {differences(brief, plan).map((row) => (
                    <tr
                      className={row.changed ? "print-changed" : ""}
                      key={row.key}
                    >
                      <td>{row.label}</td>
                      <td>
                        {display(row.before)} {row.unit}
                      </td>
                      <td>
                        {display(row.after)} {row.unit}
                        {row.changed && <span>alterado</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="print-result-grid">
            <div>
              <h4>Por que ajustar</h4>
              <ul>
                {plan.rationale.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Como validar antes do lote</h4>
              <ol>
                {plan.calibration.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          </div>
          <div className="print-notes">
            {plan.warnings.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
          <div className="print-form">
            <label className="print-check">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              Revisei os parâmetros, limites, unidades e testes de aceite. Vou
              validar a prévia no fatiador antes de imprimir.
            </label>
            <div className="print-actions">
              <button
                className="print-button secondary"
                disabled={!reviewed || busy}
                onClick={() =>
                  void save(
                    "gameforge-impressao-revisada.json",
                    new TextEncoder().encode(JSON.stringify(report(), null, 2)),
                  )
                }
              >
                Baixar relatório JSON
              </button>
              <button
                className="print-button secondary"
                disabled={!reviewed || busy}
                onClick={() => {
                  const rows = differences(brief, plan);
                  const csv = [
                    "Parâmetro;Unidade;Informado;Proposto",
                    ...rows.map((r) =>
                      [r.label, r.unit, display(r.before), display(r.after)]
                        .map((v) => '"' + v.replaceAll('"', '""') + '"')
                        .join(";"),
                    ),
                  ].join("\r\n");
                  void save(
                    "gameforge-parametros.csv",
                    new TextEncoder().encode("\ufeff" + csv),
                  );
                }}
              >
                Baixar tabela CSV
              </button>
              {mesh && (
                <button
                  className="print-button secondary"
                  disabled={!reviewed || !fits || busy}
                  onClick={() =>
                    void save(
                      "gameforge-orientado-mm.stl",
                      orientedStl(mesh.positions, rotation),
                    )
                  }
                >
                  Exportar cópia STL orientada
                </button>
              )}
            </div>
            <p className="print-muted">
              A cópia STL altera somente rotação e posição, em mm. Não repara a
              malha, não cria suportes e não esvazia a peça.
            </p>
          </div>
          <div className="print-export">
            <h4>
              {selected.adapter === "guided"
                ? "Aplicação guiada no seu fatiador"
                : "Preparar cópia de um preset exportado"}
            </h4>
            <p>{selected.notes}</p>
            {selected.adapter === "guided" ? (
              <p className="print-muted">
                Use a tabela e o checklist acima no software. O relatório JSON é
                um relatório GameForge, não um preset nativo. Nenhum arquivo
                proprietário foi fabricado.
              </p>
            ) : (
              <>
                <div className="print-grid">
                  <Field
                    label="Preset original exportado (cópia)"
                    hint="JSON individual, INI simples ou ZIP .curaprofile. Até 1 MiB; não envie bundles de máquina com credenciais."
                  >
                    <input
                      type="file"
                      disabled={busy}
                      accept={
                        selected.adapter === "json"
                          ? ".json"
                          : selected.adapter === "ini"
                            ? ".ini"
                            : ".curaprofile"
                      }
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void loadProfile(file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </Field>
                  {selected.adapter === "json" && (
                    <Field label="Superfície da mesa (preset de filamento)">
                      <select
                        value={plate}
                        onChange={(e) => {
                          setPlate(e.target.value as typeof plate);
                          setExported(null);
                        }}
                      >
                        <option value="textured">PEI texturizado</option>
                        <option value="smooth">PEI liso / hot plate</option>
                        <option value="cool">Cool plate</option>
                        <option value="engineering">Engineering plate</option>
                      </select>
                    </Field>
                  )}
                </div>
                <label className="print-check">
                  <input
                    type="checkbox"
                    checked={duplicate}
                    onChange={(e) => setDuplicate(e.target.checked)}
                  />
                  Dupliquei o preset no próprio fatiador antes de exportar. A
                  importação pode substituir essa cópia de mesmo nome.
                </label>
                <button
                  className="print-button secondary"
                  disabled={!reviewed || !duplicate || !profile || busy}
                  onClick={() => {
                    try {
                      setExported(
                        patchProfile(profile!.bytes, brief, plan, plate),
                      );
                      setError("");
                    } catch (e) {
                      setError(message(e));
                      setExported(null);
                    }
                  }}
                >
                  Revisar alterações no arquivo
                </button>
                {exported && (
                  <>
                    <p className="print-message">{exported.warning}</p>
                    <div className="print-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Campo existente</th>
                            <th>Original no arquivo</th>
                            <th>Cópia proposta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exported.patches.map((p, i) => (
                            <tr key={i}>
                              <td>
                                <code>{p.field}</code>
                              </td>
                              <td>{display(p.before)}</td>
                              <td>{display(p.after)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!!exported.skipped.length && (
                      <details>
                        <summary>
                          Campos preservados ou ausentes (
                          {exported.skipped.length})
                        </summary>
                        <ul>
                          {exported.skipped.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <div className="print-actions">
                      <button
                        className="print-button primary"
                        disabled={!reviewed || !duplicate}
                        onClick={() =>
                          void save(
                            "gameforge-copia." + exported.extension,
                            exported.bytes,
                          )
                        }
                      >
                        Baixar cópia do preset
                      </button>
                      <button
                        className="print-button secondary"
                        onClick={() =>
                          void save(
                            "gameforge-backup-original." +
                              (profile?.name.split(".").pop() || "txt"),
                            profile!.bytes,
                          )
                        }
                      >
                        Guardar backup original
                      </button>
                      <button
                        className="print-button secondary"
                        onClick={() =>
                          void save(
                            "gameforge-diff-e-hash.json",
                            new TextEncoder().encode(
                              JSON.stringify(report(), null, 2),
                            ),
                          )
                        }
                      >
                        Guardar diff e hash
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      )}
      {(error || notice) && (
        <div
          className={
            "print-live-feedback " + (error ? "print-error" : "print-success")
          }
          role={error ? "alert" : "status"}
        >
          <span>{error || notice}</span>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      )}
      <details className="print-panel print-compatibility">
        <summary>Fatiadores e nível de compatibilidade</summary>
        <div className="print-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fatiador</th>
                <th>Fluxo disponível</th>
                <th>Limite da integração</th>
              </tr>
            </thead>
            <tbody>
              {slicers.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.name}
                    {s.source && (
                      <a href={s.source} target="_blank" rel="noreferrer">
                        Documentação ↗
                      </a>
                    )}
                  </td>
                  <td>
                    {s.adapter === "guided"
                      ? "Tabela e orientação guiada"
                      : s.adapter === "json"
                        ? "Cópia de preset JSON"
                        : s.adapter === "cura"
                          ? "Cópia de pacote Cura ZIP"
                          : "Cópia de configuração INI"}
                  </td>
                  <td>{s.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="print-notes">
          Exportadores são validados estruturalmente por testes de contrato. A
          reimportação nas versões instaladas precisa ser confirmada. Não há
          controle da tela, alteração direta do fatiador, G-code, upload para
          impressora ou impressão automática.
        </p>
      </details>
    </div>
  );
}
