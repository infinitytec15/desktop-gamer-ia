import { useEffect, useRef } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { Operation } from "../generated/Operation";
import type { SystemAction } from "../generated/SystemAction";

export const actionInfo: Record<
  SystemAction,
  { title: string; effect: string; caution: string }
> = {
  enable_game_mode: {
    title: "Ativar Modo de Jogo",
    effect: "Habilita a preferência de jogo do Windows.",
    caution: "O efeito depende do jogo e do Windows.",
  },
  disable_game_capture: {
    title: "Desativar captura do Xbox Game Bar",
    effect: "Desliga a gravação de clipes pelo Game DVR.",
    caution: "Você deixa de gravar clipes com a captura do Xbox.",
  },
  disable_mouse_acceleration: {
    title: "Desativar aceleração do mouse",
    effect: "Usa uma resposta de ponteiro sem aceleração.",
    caution: "Muda a sensação do mouse. Pode exigir sair da conta.",
  },
  high_performance_power: {
    title: "Plano de energia Alto desempenho",
    effect: "Seleciona o plano Alto desempenho, quando disponível.",
    caution: "Pode aumentar consumo, calor e ruído. Seleção manual.",
  },
};
export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const registryLabels: Record<string, string> = {
  game_mode_auto: "Modo de Jogo",
  game_mode_allow: "Permissão do Modo de Jogo",
  game_dvr: "Gravação Game DVR",
  capture: "Captura de jogos",
  mouse_speed: "Aceleração do mouse",
  mouse_threshold1: "Limiar de aceleração 1",
  mouse_threshold2: "Limiar de aceleração 2",
  power_plan: "Plano de energia",
};
export function savedValue(value: unknown, key: string): string {
  if (value === null || value === undefined)
    return "Padrão do Windows (sem valor explícito)";
  const v = object(value),
    bytes = v.bytes;
  if (
    !Array.isArray(bytes) ||
    bytes.length > 4096 ||
    bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)
  )
    return "Valor salvo no snapshot";
  if (key === "power_plan") {
    const id = new TextDecoder().decode(new Uint8Array(bytes)).toLowerCase();
    return (
      {
        "381b4222-f694-41f0-9685-ff5bb260df2e": "Equilibrado",
        "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c": "Alto desempenho",
        "a1841308-3541-4fab-bc81-f71556f20b4a": "Economia de energia",
      }[id] || "Plano personalizado (preservado)"
    );
  }
  if (v.kind === 4 && bytes.length === 4) {
    const n = new DataView(new Uint8Array(bytes).buffer).getUint32(0, true);
    return n === 0
      ? "Desativado"
      : n === 1
        ? "Ativado"
        : `Personalizado (${n})`;
  }
  if (v.kind === 1 && bytes.length % 2 === 0)
    return new TextDecoder("utf-16le")
      .decode(new Uint8Array(bytes))
      .replace(/\0+$/, "");
  return "Valor personalizado preservado";
}
export function operationChanges(op: Operation) {
  const p = object(op.payload),
    before = object(p.before),
    after = object(p.after);
  return Object.keys(after)
    .filter((k) => Object.hasOwn(registryLabels, k))
    .map((key) => ({
      key,
      label: registryLabels[key],
      before: savedValue(before[key], key),
      after: savedValue(after[key], key),
    }));
}
export const states: Record<
  string,
  { label: string; description: string; tone: string }
> = {
  approved: {
    label: "Aguardando sua aprovação",
    description: "O snapshot está salvo. Nenhuma alteração foi iniciada.",
    tone: "info",
  },
  pending: {
    label: "Execução em andamento ou interrompida",
    description:
      "O resultado ainda não foi confirmado. Consulte o histórico e recupere antes de iniciar outro lote.",
    tone: "warning",
  },
  applied: {
    label: "Aplicado e verificado",
    description:
      "A leitura após a aplicação confirmou os valores do plano. Você pode desfazer abaixo.",
    tone: "success",
  },
  restored: {
    label: "Restaurado",
    description: "A leitura confirmou a recuperação dos valores anteriores.",
    tone: "success",
  },
  rolled_back: {
    label: "Alterações desfeitas após falha",
    description:
      "O lote não foi concluído. O executor confirmou o retorno ao estado anterior.",
    tone: "warning",
  },
  recovery_required: {
    label: "Recuperação necessária",
    description:
      "Não foi possível confirmar a reversão completa. Recupere esta operação antes de continuar.",
    tone: "error",
  },
  failed: {
    label: "Não concluído",
    description:
      "A operação não foi concluída. Confira o motivo e prepare uma nova revisão.",
    tone: "error",
  },
  cancelled: {
    label: "Cancelado",
    description:
      "Esta operação foi cancelada. Nenhuma nova aplicação será feita com esta revisão.",
    tone: "muted",
  },
};
export function operationStamp(id: string) {
  if (!/^\d{16,22}$/.test(id)) return "Registro local";
  const date = new Date(Number(BigInt(id) / 1000000n));
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("pt-BR")
    : "Registro local";
}
export function ChangeTable({ op }: { op: Operation }) {
  const changes = operationChanges(op),
    p = object(op.payload);
  if (op.kind === "obs")
    return (
      <dl className="readable-data">
        <div>
          <dt>Perfil anterior</dt>
          <dd>{String(p.previous || "Preservado no OBS")}</dd>
        </div>
        <div>
          <dt>Perfil GameForge</dt>
          <dd>{String(p.created || "Registrado no snapshot")}</dd>
        </div>
        <div>
          <dt>Restauração</dt>
          <dd>Reativa o perfil anterior; confira cenas e áudio no OBS.</dd>
        </div>
      </dl>
    );
  return changes.length ? (
    <div
      className="change-table"
      role="table"
      aria-label="Comparação de configurações"
    >
      <div className="change-heading" role="row">
        <span role="columnheader">Ajuste</span>
        <span role="columnheader">Antes</span>
        <span aria-hidden="true" />
        <span role="columnheader">Proposto no plano</span>
      </div>
      {changes.map((c) => (
        <div className="change-line" key={c.key} role="row">
          <strong role="cell">{c.label}</strong>
          <span role="cell">{c.before}</span>
          <ArrowRight size={15} aria-hidden="true" />
          <span role="cell" className="change-target">
            {c.after}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <p className="muted">
      Os valores deste registro antigo não têm visualização compatível. O núcleo
      valida o snapshot original antes de qualquer restauração.
    </p>
  );
}
export function OperationResult({
  op,
  children,
  focusResult = false,
}: {
  op: Operation;
  children?: React.ReactNode;
  focusResult?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusResult) heading.current?.focus({ preventScroll: true });
  }, [op.status, focusResult]);
  const state = states[op.status] || {
    label: "Estado não reconhecido",
    description: "Atualize o histórico para conferir este registro.",
    tone: "warning",
  };
  const Icon =
    state.tone === "success"
      ? CheckCircle2
      : state.tone === "error" || state.tone === "warning"
        ? CircleAlert
        : Clock3;
  return (
    <section
      className={`operation-result ${state.tone}`}
      aria-label="Resultado da operação"
    >
      <div className="result-heading">
        <Icon size={27} />
        <div>
          <h3 ref={heading} tabIndex={-1}>
            {state.label}
          </h3>
          <p>{state.description}</p>
        </div>
      </div>
      {op.error && <p className="result-error">{op.error}</p>}
      <ChangeTable op={op} />
      <div className="result-meta">
        <ShieldCheck size={15} />
        <span>Registro local · {operationStamp(op.id)}</span>
        {op.status === "applied" && (
          <span>
            <RotateCcw size={13} /> Desfazer disponível
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
export function downloadOperation(op: Operation) {
  const s = states[op.status];
  const text = [
    "GameForge AI — Relatório de operação",
    operationStamp(op.id),
    s?.label || "Estado não reconhecido",
    op.summary,
    s?.description || "",
    op.error || "",
    ...operationChanges(op).map(
      (c) => `${c.label}\n  Antes: ${c.before}\n  Proposto: ${c.after}`,
    ),
    "",
    "A verificação confirma configurações; não é medição de ganho de FPS.",
    `Referência local: ${op.id}`,
  ].join("\n\n");
  const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "GameForge-relatorio.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const contextLabels: Record<string, string> = {
  goal: "Objetivo",
  os: "Sistema operacional",
  architecture: "Arquitetura",
  cpu: "Processador",
  cores: "Núcleos lógicos",
  ram_gb: "RAM instalada (GB)",
  used_ram_gb: "RAM em uso (GB)",
  cpu_usage: "Uso de CPU na coleta (%)",
};
export function AiContextView({ context }: { context: unknown }) {
  const c = object(context);
  return (
    <dl className="readable-data">
      {Object.entries(contextLabels)
        .filter(([k]) => c[k] !== undefined)
        .map(([k, label]) => (
          <div key={k}>
            <dt>{label}</dt>
            <dd>
              {typeof c[k] === "number"
                ? Number(c[k]).toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })
                : String(c[k])}
            </dd>
          </div>
        ))}
      {Array.isArray(c.disks) &&
        c.disks.map((d, i) => (
          <div key={`disk-${i}`}>
            <dt>Volume {i + 1}</dt>
            <dd>
              {Number(object(d).free_gb).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}{" "}
              GB livres de{" "}
              {Number(object(d).total_gb).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}{" "}
              GB
            </dd>
          </div>
        ))}
    </dl>
  );
}
