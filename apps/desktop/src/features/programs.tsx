import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { InstalledApp } from "../generated/InstalledApp";
import type { Inventory } from "../generated/Inventory";
import type { Operation } from "../generated/Operation";
import type { WorkItem } from "../generated/WorkItem";
import type { WorkState } from "../generated/WorkState";
import {
  enableNotifications,
  disableNotifications,
  notifyEvent,
} from "../lib/notifications";
export function WelcomePage({
  onContinue,
}: {
  onContinue: (route: string) => void;
}) {
  return (
    <section className="panel welcome-panel">
      <h2>Seu computador, com um plano claro.</h2>
      <p>
        O GameForge AI reúne diagnóstico, ajustes revisáveis do Windows e perfis
        OBS para streaming. A IA ajuda a planejar; você acompanha as etapas e
        aprova as alterações.
      </p>
      <ol className="guide">
        <li>
          <strong>Conecte as ferramentas.</strong> Ative sua licença na sua conta e
          conecte o OBS. Você também pode começar offline.
        </li>
        <li>
          <strong>Conheça o computador.</strong> Faça um diagnóstico ou escolha
          um programa detectado.
        </li>
        <li>
          <strong>Revise e aprove.</strong> Confira o plano, os efeitos e os
          valores anteriores antes de executar.
        </li>
        <li>
          <strong>Confira o resultado.</strong> Acompanhe a verificação e use o
          Histórico para recuperar alterações compatíveis.
        </li>
      </ol>
      <p className="muted">
        Esta é uma versão beta. Sensores dependem do hardware e dos drivers.
        Programas sem adaptador possuem orientação guiada; o aplicativo não
        configura automaticamente qualquer software.
      </p>
      <div className="button-row">
        <button className="primary" onClick={() => onContinue("settings")}>
          Continuar: configurar conexões
        </button>
        <button className="secondary" onClick={() => onContinue("home")}>
          Começar pelo diagnóstico
        </button>
      </div>
    </section>
  );
}
export function NotificationSettings() {
  const [message, setMessage] = useState("");
  return (
    <section className="panel report-details">
      <h2>Notificações desktop</h2>
      <p className="muted">
        Receba avisos quando um plano estiver pronto ou uma operação terminar.
        No Windows, use o aplicativo instalado; a exibição depende das
        permissões e do modo de foco do sistema.
      </p>
      <div className="button-row">
        <button
          className="secondary"
          onClick={() =>
            void enableNotifications()
              .then((ok) =>
                setMessage(
                  ok
                    ? "Notificações permitidas. O sistema controla sua exibição."
                    : "Permissão de notificações não concedida.",
                ),
              )
              .catch((e) => setMessage(String(e)))
          }
        >
          Permitir notificações
        </button>
        <button
          className="text-button"
          onClick={() => {
            disableNotifications();
            setMessage("Avisos desktop desativados.");
          }}
        >
          Desativar avisos
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function ProgramsPage({
  navigate,
}: {
  navigate: (route: string) => void;
}) {
  const [data, setData] = useState<Inventory | null>(null),
    [filter, setFilter] = useState(""),
    [app, setApp] = useState<InstalledApp | null>(null),
    [goal, setGoal] = useState("Melhorar estabilidade"),
    [experience, setExperience] = useState("Iniciante"),
    [priority, setPriority] = useState("Equilibrar desempenho e qualidade"),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [created, setCreated] = useState<Operation | null>(null);
  async function run(work: () => Promise<void>) {
    setError("");
    if (!isTauri()) {
      setError("Abra o aplicativo desktop para ler os programas instalados.");
      return;
    }
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Programas detectados</h2>
      <p className="muted">
        Escolha um programa, conte o objetivo e abra uma solicitação com
        critérios de aceite. A cobertura depende das fontes de instalação;
        softwares portáteis e da Store podem não aparecer.
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={() =>
          void run(async () =>
            setData(await invoke<Inventory>("list_programs")),
          )
        }
      >
        Ler programas instalados
      </button>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {data?.warnings.map((w) => (
        <p className="muted" key={w}>
          {w}
        </p>
      ))}
      {data && (
        <label className="field">
          Pesquisar entre {data.apps.length} programas
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
      )}
      {!app && (
        <div className="data-list">
          {data?.apps
            .filter((a) => a.name.toLowerCase().includes(filter.toLowerCase()))
            .map((a) => (
              <div className="data-row" key={a.id}>
                <div>
                  <strong>{a.name}</strong>
                  <small>
                    {a.version || "Versão indisponível"} ·{" "}
                    {a.publisher || a.source}
                  </small>
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    setApp(a);
                    setCreated(null);
                  }}
                >
                  Configurar {a.name}
                </button>
              </div>
            ))}
        </div>
      )}
      {app && (
        <div className="ai-consent">
          <button
            className="text-button"
            onClick={() => {
              setApp(null);
              setCreated(null);
            }}
          >
            Escolher outro programa
          </button>
          <h3>O que você quer fazer com {app.name}?</h3>
          <p className="muted">
            {app.adapter === "guided"
              ? "Este programa ainda não tem adaptador específico. Podemos registrar o objetivo e planejar ajustes gerais do computador; alterações internas permanecem guiadas."
              : "Adaptador disponível: " +
                (app.adapter === "obs" ? "perfil OBS" : "orientações Discord") +
                ". Confira o alcance antes de executar."}
          </p>
          <label className="field">
            Objetivo
            <select value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option>Melhorar estabilidade</option>
              <option>Preparar para streaming</option>
              <option>Reduzir uso de recursos</option>
              <option>Resolver lentidão</option>
            </select>
          </label>
          <label className="field">
            Sua experiência
            <select
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            >
              <option>Iniciante</option>
              <option>Intermediário</option>
              <option>Avançado</option>
            </select>
          </label>
          <label className="field">
            Prioridade
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option>Equilibrar desempenho e qualidade</option>
              <option>Priorizar desempenho</option>
              <option>Priorizar qualidade</option>
              <option>Reduzir consumo</option>
            </select>
          </label>
          <label className="field">
            Observações opcionais
            <textarea
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={busy || !!created}
            onClick={() =>
              void run(async () => {
                setCreated(
                  await invoke<Operation>("create_workflow", {
                    brief: {
                      app_id: app.id,
                      app_name: app.name,
                      goal,
                      experience,
                      priority,
                      notes,
                    },
                  }),
                );
                void notifyEvent(
                  "Solicitação registrada. Revise o plano antes de autorizar.",
                );
              })
            }
          >
            Registrar objetivo e critérios de aceite
          </button>
          {created && (
            <div className="message success" role="status">
              Solicitação registrada. Gere e revise o plano no módulo
              correspondente; acompanhe os aceites em Solicitações.
            </div>
          )}
          <div className="button-row">
            {created && (
              <>
                <button
                  className="secondary"
                  onClick={() =>
                    navigate(
                      app.adapter === "obs"
                        ? "obs"
                        : app.adapter === "discord"
                          ? "discord"
                          : "boost",
                    )
                  }
                >
                  Abrir módulo de configuração
                </button>
                <button
                  className="secondary"
                  onClick={() => navigate("requests")}
                >
                  Acompanhar solicitação
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
const stateLabels: Record<WorkState, string> = {
  questions: "Objetivo registrado",
  planned: "Plano vinculado",
  approved: "Execução aprovada",
  running: "Execução vinculada",
  verified: "Verificação técnica concluída",
  accepted: "Aceito pelo cliente",
  failed: "Falhou",
  cancelled: "Cancelado",
};
export function RequestsPage() {
  const [ops, setOps] = useState<Operation[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [links, setLinks] = useState<Record<string, string>>({});
  async function refresh() {
    setOps(await invoke<Operation[]>("operation_history"));
  }
  async function run(fn: () => Promise<void>) {
    if (!isTauri()) {
      setError("Abra o aplicativo desktop para consultar solicitações.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function advance(op: Operation, to: WorkState) {
    await invoke("advance_workflow", {
      id: op.id,
      to,
      operationId: links[op.id] || null,
    });
    await refresh();
    setLinks((l) => {
      const next = { ...l };
      delete next[op.id];
      return next;
    });
    void notifyEvent(
      to === "accepted"
        ? "Resultado aceito pelo cliente."
        : "Solicitação atualizada. Confira o acompanhamento.",
    );
  }
  return (
    <section className="panel">
      <h2>Solicitações e aceites</h2>
      <p className="muted">
        Objetivo → plano → autorização → execução vinculada → verificação →
        aceite do cliente. O aceite final é informado pelo usuário; não é
        inferido pela IA.
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void run(refresh)}
      >
        Atualizar solicitações
      </button>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {ops
        .filter((o) => o.kind === "workflow")
        .map((op) => {
          const item = op.payload as WorkItem;
          const options = ops.filter((o) =>
            item.state === "questions"
              ? o.kind === "plan"
              : ["system", "obs", "discord"].includes(o.kind),
          );
          return (
            <div className="history-entry" key={op.id}>
              <div className="data-row">
                <strong>{op.summary}</strong>
                <span className="tag">{stateLabels[item.state]}</span>
              </div>
              <p className="muted">
                {item.brief.experience} · {item.brief.priority}
              </p>
              <details>
                <summary>Objetivo e critérios de aceite</summary>
                <p>{item.brief.notes}</p>
                <ul>
                  {item.acceptance.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </details>
              {["questions", "approved"].includes(item.state) && (
                <label className="field">
                  {item.state === "questions"
                    ? "Vincular plano gerado no Quick Boost"
                    : "Vincular execução técnica do Histórico"}
                  <select
                    value={links[op.id] || ""}
                    onChange={(e) =>
                      setLinks((l) => ({ ...l, [op.id]: e.target.value }))
                    }
                  >
                    <option value="">Selecione um registro</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.summary} · {o.status}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="button-row">
                {item.state === "questions" && (
                  <button
                    className="secondary"
                    disabled={busy || !links[op.id]}
                    onClick={() => void run(() => advance(op, "planned"))}
                  >
                    Confirmar plano vinculado
                  </button>
                )}
                {item.state === "planned" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void run(() => advance(op, "approved"))}
                  >
                    Aprovar escopo para execução
                  </button>
                )}
                {item.state === "approved" && (
                  <button
                    className="secondary"
                    disabled={busy || !links[op.id]}
                    onClick={() => void run(() => advance(op, "running"))}
                  >
                    Vincular execução
                  </button>
                )}
                {item.state === "running" && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(() => advance(op, "verified"))}
                  >
                    Conferir resultado técnico
                  </button>
                )}
                {item.state === "verified" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void run(() => advance(op, "accepted"))}
                  >
                    Cliente: confirmo que o objetivo foi atendido
                  </button>
                )}
                {["questions", "planned", "approved"].includes(item.state) && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void run(() => advance(op, "cancelled"))}
                  >
                    Cancelar solicitação
                  </button>
                )}
              </div>
            </div>
          );
        })}
      {ops.length > 0 && !ops.some((o) => o.kind === "workflow") && (
        <p>Nenhuma solicitação de programa registrada.</p>
      )}
    </section>
  );
}
