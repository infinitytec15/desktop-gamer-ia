import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Activity,
  ArrowRight,
  Check,
  CircleAlert,
  Download,
  Gamepad2,
  Leaf,
  LoaderCircle,
  Radio,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Zap,
} from "lucide-react";
import { AiControls, useAiQuote, type AiChoice } from "@gameforge/printing/ai";
import "@gameforge/printing/style.css";
import type { OptimizationPlan } from "../generated/OptimizationPlan";
import type { SystemAction } from "../generated/SystemAction";
import type { SystemCheck } from "../generated/SystemCheck";
import type { Operation } from "../generated/Operation";
import type { Report } from "../domain";
import { notifyEvent } from "../lib/notifications";
import {
  actionInfo,
  AiContextView,
  ChangeTable,
  downloadOperation,
  object,
  OperationResult,
} from "./operation-view";
const estimateAi = (input: unknown) => invoke("estimate_ai", { input });
const allActions = Object.keys(actionInfo) as SystemAction[];
const recommended = (p: OptimizationPlan | null) =>
  p?.system_actions.filter(
    (a) => a !== "high_performance_power" && a !== "disable_mouse_acceleration",
  ) || [];
const profiles = [
  {
    goal: "Jogar e transmitir com estabilidade",
    title: "Jogar e transmitir",
    description: "Prepare o Windows e leve o perfil sugerido para o OBS.",
    icon: Radio,
  },
  {
    goal: "Priorizar jogo competitivo",
    title: "Jogo competitivo",
    description: "Revise captura e resposta do mouse para sua sessão.",
    icon: Gamepad2,
  },
  {
    goal: "Equilibrar desempenho e consumo",
    title: "Uso equilibrado",
    description:
      "Mantenha o plano de energia e personalize apenas o necessário.",
    icon: Leaf,
  },
];

export function OptimizePage({
  plan,
  setPlan,
  navigate = (id) => {
    location.hash = id;
  },
  onBusyChange,
}: {
  plan: OptimizationPlan | null;
  setPlan: (p: OptimizationPlan | null) => void;
  navigate?: (id: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [goal, setGoal] = useState(profiles[0].goal),
    [context, setContext] = useState<unknown>(null);
  const [choice, setChoice] = useState<AiChoice>({
      mode: "economy",
      effort: "low",
    }),
    [fallback, setFallback] = useState(true);
  const [selected, setSelected] = useState<SystemAction[]>(recommended(plan));
  const [checks, setChecks] = useState<SystemCheck[] | null>(null),
    [report, setReport] = useState<Report | null>(null);
  const [prepared, setPrepared] = useState<Operation | null>(null),
    [result, setResult] = useState<Operation | null>(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [scanError, setScanError] = useState("");
  const [historyReady, setHistoryReady] = useState(!isTauri()),
    [historyError, setHistoryError] = useState("");
  const [progress, setProgress] = useState<Operation | null>(null),
    [confirmUndo, setConfirmUndo] = useState(false);
  const running = useRef(false);
  const budget = useAiQuote(
    estimateAi,
    context
      ? { task: "system", context, ...choice, allow_fallback: fallback }
      : null,
    !!context,
  );
  const locked =
    !!busy ||
    !!prepared ||
    !historyReady ||
    !!historyError ||
    result?.status === "pending" ||
    result?.status === "recovery_required";
  const review = !!plan || !!prepared;
  async function recover() {
    const ops = await invoke<Operation[]>("operation_history");
    setHistoryError("");
    const unfinished = ops.find(
      (o) =>
        o.kind === "system" &&
        ["approved", "pending", "recovery_required"].includes(o.status),
    );
    if (unfinished?.status === "approved") {
      setPrepared(unfinished);
      const actions = object(unfinished.payload).actions;
      if (Array.isArray(actions))
        setSelected(
          actions.filter((a): a is SystemAction => allActions.includes(a)),
        );
    } else if (unfinished) setResult(unfinished);
    setHistoryReady(true);
  }
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    invoke<Operation[]>("operation_history")
      .then((ops) => {
        if (!active) return;
        const op = ops.find(
          (o) =>
            o.kind === "system" &&
            ["approved", "pending", "recovery_required"].includes(o.status),
        );
        if (op?.status === "approved") {
          setPrepared(op);
          const actions = object(op.payload).actions;
          if (Array.isArray(actions))
            setSelected(
              actions.filter((a): a is SystemAction => allActions.includes(a)),
            );
        } else if (op) setResult(op);
        setHistoryReady(true);
      })
      .catch(() => {
        if (active) {
          setHistoryError(
            "Não foi possível conferir as operações anteriores. Atualize a recuperação antes de começar.",
          );
          setHistoryReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    onBusyChange?.(!!busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (busy !== "apply" || !prepared) return;
    let stopped = false;
    const id = setInterval(() => {
      void invoke<Operation[]>("operation_history")
        .then((ops) => {
          if (!stopped)
            setProgress(ops.find((o) => o.id === prepared.id) || null);
        })
        .catch(() => {});
    }, 1200);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [busy, prepared]);
  async function run(label: string, fn: () => Promise<void>) {
    if (running.current) return;
    setError("");
    if (!isTauri()) {
      setError("Abra o aplicativo desktop para usar esta função.");
      return;
    }
    running.current = true;
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
      void notifyEvent(
        "A operação precisa de atenção. Confira os detalhes no GameForge.",
      );
    } finally {
      setBusy("");
      running.current = false;
    }
  }
  async function scanChecks() {
    setScanError("");
    try {
      const next = await invoke<SystemCheck[]>("system_checks");
      setChecks(next);
      setSelected((s) =>
        s.filter((a) => next.find((c) => c.action === a)?.state === "ready"),
      );
      return next;
    } catch (e) {
      setScanError(
        `Não foi possível ler os ajustes: ${String(e)}. A aplicação permanece protegida pela revisão e pelo snapshot nativo.`,
      );
      return null;
    }
  }
  async function accept(p: OptimizationPlan) {
    const next = await scanChecks();
    setPlan(p);
    setSelected(
      recommended(p).filter(
        (a) => !next || next.find((c) => c.action === a)?.state === "ready",
      ),
    );
    setPrepared(null);
    setResult(null);
    setConfirmUndo(false);
    setContext(null);
    void notifyEvent(
      "Plano pronto para revisão. Nenhuma alteração foi aplicada.",
    );
  }
  async function apply() {
    if (!prepared) return;
    const id = prepared.id;
    setProgress(prepared);
    try {
      const op = await invoke<Operation>("apply_system", { id });
      setResult(op);
      setPrepared(null);
      if (op.status === "applied")
        void notifyEvent(
          "Quick Boost aplicado e verificado. Você pode desfazer no histórico.",
        );
    } catch (e) {
      // The helper can have rolled back, failed or remained pending. Recover the durable truth.
      try {
        const op = (await invoke<Operation[]>("operation_history")).find(
          (o) => o.id === id,
        );
        if (op) {
          if (op.status === "approved") setPrepared(op);
          else {
            setResult(op);
            setPrepared(null);
          }
        }
      } catch {
        /* Preserve the prepared review so a new batch cannot start. */
      }
      throw e;
    }
  }
  const stage = result ? 3 : prepared || review ? 2 : checks ? 1 : 0;
  const steps = [
    "Seu objetivo",
    "Análise local",
    "Revisar ajustes",
    "Resultado",
  ];
  const recommendedAlreadySet =
    !!plan &&
    recommended(plan).length > 0 &&
    recommended(plan).every(
      (a) => checks?.find((c) => c.action === a)?.state === "already_set",
    );
  if (/Macintosh|Mac OS X/.test(navigator.userAgent))
    return (
      <section className="panel">
        <h2>Ferramentas para seu Mac</h2>
        <p>
          Os ajustes de Modo de Jogo, captura, mouse e plano de energia deste
          Quick Boost são específicos do Windows. Nenhuma dessas alterações nem
          análise paga de sistema será iniciada no Mac.
        </p>
        <p className="muted">
          Use o diagnóstico, o Monitor, a impressão 3D, os programas detectados
          e o OBS conforme a compatibilidade do seu macOS. A disponibilidade dos
          sensores depende do hardware.
        </p>
        <div className="button-row">
          <button className="primary" onClick={() => navigate("monitor")}>
            Abrir Monitor
          </button>
          <button className="secondary" onClick={() => navigate("printing")}>
            Abrir Impressão 3D
          </button>
          <button className="secondary" onClick={() => navigate("obs")}>
            Configurar OBS
          </button>
        </div>
      </section>
    );
  return (
    <div className="boost-page">
      <ol className="boost-steps" aria-label="Etapas do Quick Boost">
        {steps.map((s, i) => (
          <li
            key={s}
            className={i === stage ? "current" : i < stage ? "complete" : ""}
            aria-current={i === stage ? "step" : undefined}
          >
            <span>{i < stage ? <Check size={14} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      {historyError && (
        <div className="message error" role="alert">
          <CircleAlert size={18} />
          <div>
            {historyError}
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => void run("recovery", recover)}
            >
              Conferir recuperação
            </button>
          </div>
        </div>
      )}
      {!historyReady && (
        <p className="working-line">
          <LoaderCircle size={17} className="spin" /> Conferindo revisões
          anteriores…
        </p>
      )}
      {error && (
        <div className="message error" role="alert">
          <CircleAlert size={19} />
          <div>
            <strong>Não foi possível concluir esta etapa</strong>
            <p>{error}</p>
            <button className="text-button" onClick={() => navigate("history")}>
              Abrir histórico e recuperação <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
      {result ? (
        <>
          <OperationResult op={result} focusResult>
            <div className="button-row">
              {["applied", "pending", "recovery_required"].includes(
                result.status,
              ) && (
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => setConfirmUndo(true)}
                >
                  <Undo2 size={16} />
                  Desfazer ajustes
                </button>
              )}
              <button
                className="secondary"
                onClick={() => downloadOperation(result)}
              >
                <Download size={16} />
                Salvar relatório
              </button>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => navigate("monitor")}
              >
                Ver monitor em tempo real <ArrowRight size={15} />
              </button>
            </div>
            {confirmUndo && (
              <div className="inline-confirm">
                <h3>Restaurar os valores anteriores?</h3>
                <p>
                  O Windows pedirá permissão. Se alguma configuração mudou fora
                  do GameForge, a restauração será bloqueada para preservar essa
                  mudança.
                </p>
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => setConfirmUndo(false)}
                  >
                    Manter os ajustes
                  </button>
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() =>
                      void run("undo", async () => {
                        setResult(
                          await invoke<Operation>("undo_operation", {
                            id: result.id,
                          }),
                        );
                        setConfirmUndo(false);
                        await scanChecks();
                      })
                    }
                  >
                    {busy === "undo"
                      ? "Restaurando…"
                      : "Confirmar restauração (UAC)"}
                  </button>
                </div>
              </div>
            )}
          </OperationResult>
          {!["pending", "recovery_required"].includes(result.status) && (
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => {
                setResult(null);
                setContext(null);
                setConfirmUndo(false);
                void run("scan", async () => {
                  await scanChecks();
                });
              }}
            >
              <RefreshCw size={16} />
              Preparar nova revisão
            </button>
          )}
        </>
      ) : (
        <div className="boost-layout">
          <div className="boost-main">
            {!prepared && (
              <section className="panel boost-setup">
                <div className="section-title">
                  <div>
                    <h2>Planejar a otimização</h2>
                    <p className="muted">
                      Escolha o objetivo. O plano local não usa créditos; a IA é
                      opcional.
                    </p>
                  </div>
                  <Zap size={25} />
                </div>
                <fieldset className="profile-options" disabled={locked}>
                  <legend>Como você vai usar o computador?</legend>
                  {profiles.map(
                    ({ goal: value, title, description, icon: Icon }) => (
                      <label
                        className={goal === value ? "selected" : ""}
                        key={value}
                      >
                        <input
                          type="radio"
                          name="boost-goal"
                          value={value}
                          checked={goal === value}
                          onChange={() => {
                            setGoal(value);
                            setContext(null);
                            setPlan(null);
                            setSelected([]);
                          }}
                        />
                        <Icon size={20} />
                        <span>
                          <strong>{title}</strong>
                          <small>{description}</small>
                        </span>
                      </label>
                    ),
                  )}
                </fieldset>
                <div className="button-row">
                  <button
                    className="primary"
                    disabled={locked}
                    onClick={() =>
                      void run("local", async () => {
                        await accept(
                          await invoke<OptimizationPlan>("offline_plan", {
                            goal,
                          }),
                        );
                      })
                    }
                  >
                    <Zap size={16} />
                    {busy === "local"
                      ? "Preparando revisão…"
                      : "Usar preset offline"}
                  </button>
                  <button
                    className="secondary"
                    disabled={locked}
                    onClick={() =>
                      void run("scan", async () => {
                        const tasks = await Promise.allSettled([
                          scanChecks(),
                          invoke<Report>("diagnose"),
                        ]);
                        if (tasks[1].status === "fulfilled")
                          setReport(tasks[1].value);
                        else
                          setScanError(
                            "O diagnóstico de hardware não foi concluído. Você ainda pode revisar os ajustes disponíveis.",
                          );
                      })
                    }
                  >
                    <Activity size={16} />
                    Analisar ajustes e hardware
                  </button>
                </div>
                <p className="help-line">
                  <ShieldCheck size={15} />
                  Ler e planejar não altera o Windows. Aplicar exige licença
                  ativa.
                </p>
                <details
                  className="ai-option"
                  open={context !== null || undefined}
                >
                  <summary>
                    <Sparkles size={16} />
                    Personalizar com IA
                  </summary>
                  <p className="muted">
                    A IA considera o objetivo e um diagnóstico reduzido. Você vê
                    a estimativa antes de enviar.
                  </p>
                  <button
                    className="secondary"
                    disabled={locked}
                    onClick={() =>
                      void run("context", async () =>
                        setContext(await invoke("preview_ai", { goal })),
                      )
                    }
                  >
                    {busy === "context"
                      ? "Lendo diagnóstico…"
                      : "Preparar análise com IA"}
                  </button>
                  {context !== null && (
                    <div className="ai-consent">
                      <h3>Confira os dados da análise</h3>
                      <p className="muted">
                        Somente os dados abaixo serão enviados para planejar:
                        sem nomes de processos, caminhos, chaves de API ou
                        transmissão.
                      </p>
                      <AiContextView context={context} />
                      <label className="plan-row">
                        <input
                          type="checkbox"
                          disabled={locked}
                          checked={fallback}
                          onChange={(e) => setFallback(e.target.checked)}
                        />
                        <span>
                          Permitir o segundo modelo se o primeiro falhar
                          <small>
                            O orçamento máximo considera as duas tentativas
                            autorizadas.
                          </small>
                        </span>
                      </label>
                      <AiControls
                        value={choice}
                        onChange={setChoice}
                        {...budget}
                        disabled={locked}
                      />
                      <button
                        className="primary"
                        disabled={locked || !budget.quote || budget.loading}
                        onClick={() =>
                          void run("ai", async () =>
                            accept(
                              await invoke<OptimizationPlan>("generate_plan", {
                                allowFallback: fallback,
                                options: {
                                  ...choice,
                                  quote_hash: budget.quote?.quote_hash,
                                },
                              }),
                            ),
                          )
                        }
                      >
                        <Sparkles size={16} />
                        {busy === "ai"
                          ? "Gerando seu plano…"
                          : "Enviar dados e gerar plano"}
                      </button>
                    </div>
                  )}
                </details>
              </section>
            )}
            {scanError && <p className="message warning">{scanError}</p>}
            {review && (
              <section className="panel boost-review">
                <div className="section-title">
                  <div>
                    <h2>
                      {prepared
                        ? "Confirme antes de aplicar"
                        : "Escolha os ajustes"}
                    </h2>
                    <p className="muted">
                      {prepared
                        ? "Snapshot salvo. Compare o estado anterior com o plano antes de autorizar."
                        : plan?.provider === "offline"
                          ? "Plano local · sem consumo de créditos de IA"
                          : `Plano por IA · ${plan?.model}`}
                    </p>
                  </div>
                  <SlidersHorizontal size={23} />
                </div>
                {!prepared && plan && (
                  <>
                    <p>{plan.summary}</p>
                    {recommendedAlreadySet && (
                      <p className="message success">
                        Os ajustes sugeridos já estão configurados. Não é
                        necessário reaplicá-los. Você pode revisar os opcionais
                        abaixo.
                      </p>
                    )}
                    <p className="muted">
                      {profiles.find((p) => p.goal === goal)?.title}. Ações de
                      mouse e energia ficam desmarcadas e dependem da sua
                      escolha.
                    </p>
                    {allActions.map((a) => {
                      const check = checks?.find((c) => c.action === a),
                        info = actionInfo[a];
                      const disabled =
                        !!busy ||
                        check?.state === "already_set" ||
                        check?.state === "unavailable";
                      return (
                        <label
                          className={`boost-action ${selected.includes(a) ? "chosen" : ""}`}
                          key={a}
                        >
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={selected.includes(a)}
                            onChange={() =>
                              setSelected((s) =>
                                s.includes(a)
                                  ? s.filter((x) => x !== a)
                                  : [...s, a],
                              )
                            }
                          />
                          <span className="action-content">
                            <strong>{info.title}</strong>
                            <span>{info.effect}</span>
                            <small>{info.caution}</small>
                            {check && (
                              <span className="action-current">
                                Atual: {check.current}
                              </span>
                            )}
                            {check?.state === "unavailable" && (
                              <small>{check.detail}</small>
                            )}
                          </span>
                          <span
                            className={`state-tag ${check?.state === "already_set" ? "success" : ""}`}
                          >
                            {check?.state === "already_set"
                              ? "Já está ajustado"
                              : check?.state === "unavailable"
                                ? "Indisponível"
                                : plan.system_actions.includes(a)
                                  ? "Sugerido"
                                  : "Opcional"}
                          </span>
                        </label>
                      );
                    })}
                    {plan.warnings.length > 0 && (
                      <details className="plan-notes">
                        <summary>
                          Observações do plano ({plan.warnings.length})
                        </summary>
                        <ul>
                          {plan.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
                {prepared ? (
                  <>
                    <ChangeTable op={prepared} />
                    <p className="help-line">
                      <ShieldCheck size={15} />
                      Snapshot salvo. O lote só começa se o Ponto de Restauração
                      for criado.
                    </p>
                    {busy === "apply" && (
                      <div className="apply-progress" role="status">
                        <LoaderCircle className="spin" size={20} />
                        <div>
                          <strong>
                            {progress?.status === "pending"
                              ? "Proteção criada; aplicando e verificando ajustes…"
                              : "Aguardando o Windows e a autorização de administrador…"}
                          </strong>
                          <p>
                            Você pode acompanhar esta etapa aqui. Não encerre o
                            aplicativo durante a execução.
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="button-row">
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={() =>
                          void run("cancel", async () => {
                            await invoke("cancel_system", { id: prepared.id });
                            setPrepared(null);
                            await scanChecks();
                          })
                        }
                      >
                        Cancelar revisão
                      </button>
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() => void run("apply", apply)}
                      >
                        <ShieldCheck size={16} />
                        {busy === "apply"
                          ? "Aguardando o Windows…"
                          : "Aprovar e aplicar no Windows (UAC)"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="review-footer">
                    <div>
                      <strong>
                        {selected.length}{" "}
                        {selected.length === 1
                          ? "ajuste selecionado"
                          : "ajustes selecionados"}
                      </strong>
                      <p>Confira os valores reais na próxima etapa.</p>
                    </div>
                    <button
                      className="primary"
                      disabled={locked || !selected.length}
                      onClick={() =>
                        void run("prepare", async () =>
                          setPrepared(
                            await invoke<Operation>("prepare_system", {
                              actions: selected,
                            }),
                          ),
                        )
                      }
                    >
                      Revisar valores antes de aplicar <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </section>
            )}
            {!review && checks && (
              <section className="panel">
                <h2>Estado dos ajustes do Windows</h2>
                {checks.map((c) => (
                  <div className="data-row" key={c.action}>
                    <div>
                      <strong>{actionInfo[c.action].title}</strong>
                      <small>{c.current}</small>
                    </div>
                    <span className="state-tag">
                      {c.state === "already_set"
                        ? "Já está ajustado"
                        : c.state === "ready"
                          ? "Pode ser revisado"
                          : "Indisponível"}
                    </span>
                  </div>
                ))}
              </section>
            )}
          </div>
          <div className="boost-side">
            <section className="boost-guide">
              <ShieldCheck size={23} />
              <h3>Você aprova cada mudança</h3>
              <ol>
                <li>Escolha os ajustes e veja os valores atuais.</li>
                <li>Revise o snapshot antes de aplicar.</li>
                <li>Autorize a solicitação do Windows.</li>
                <li>Confira a verificação e desfaça se precisar.</li>
              </ol>
              <p>
                O app não fecha seus programas nem apaga arquivos neste fluxo.
                Não há promessa de ganho de FPS.
              </p>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => navigate("history")}
              >
                Abrir histórico <ArrowRight size={15} />
              </button>
            </section>
            {report && (
              <section className="boost-health">
                <h3>Retrato do computador</h3>
                <dl className="readable-data">
                  <div>
                    <dt>CPU</dt>
                    <dd>{report.cpu}</dd>
                  </div>
                  <div>
                    <dt>RAM em uso</dt>
                    <dd>
                      {report.memory_used_gb.toFixed(1)} /{" "}
                      {report.memory_gb?.toFixed(1) || "—"} GB
                    </dd>
                  </div>
                  {report.disks.map((d, i) => (
                    <div key={i}>
                      <dt>Volume {i + 1}</dt>
                      <dd>{d.available_gb.toFixed(1)} GB livres</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  {report.memory_gb !== null &&
                  report.memory_gb > 0 &&
                  report.memory_used_gb / report.memory_gb >= 0.85
                    ? "Memória com uso elevado nesta coleta. Revise os programas que você pode fechar; o app não os encerra."
                    : "Leitura pontual. Para acompanhar variações, abra o Monitor."}
                </p>
                <button
                  className="text-button"
                  onClick={() => navigate("monitor")}
                >
                  Acompanhar em tempo real <ArrowRight size={15} />
                </button>
              </section>
            )}
            {plan && (
              <section className="boost-guide">
                <Radio size={23} />
                <h3>Próximo passo: streaming</h3>
                <p>
                  Perfil sugerido: {plan.video.width} × {plan.video.height},{" "}
                  {plan.video.fps} FPS e {plan.video.bitrate} kbps. Ele será
                  revisado e aplicado separadamente no OBS.
                </p>
                <button
                  className="text-button"
                  disabled={!!busy || !!prepared}
                  onClick={() => navigate("obs")}
                >
                  Configurar OBS <ArrowRight size={15} />
                </button>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
