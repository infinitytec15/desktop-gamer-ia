import { notifyEvent } from "../lib/notifications";
import { useState, useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ShieldCheck, Sparkles, Undo2, Radio } from "lucide-react";
import type { OptimizationPlan } from "../generated/OptimizationPlan";
import type { SystemAction } from "../generated/SystemAction";
import type { Operation } from "../generated/Operation";
import type { ObsState } from "../generated/ObsState";
const labels: Record<SystemAction, { title: string; effect: string }> = {
  enable_game_mode: {
    title: "Ativar Modo de Jogo",
    effect: "Prioriza o cenário de jogo nas preferências do Windows Game Bar.",
  },
  disable_game_capture: {
    title: "Desativar captura do Xbox Game Bar",
    effect:
      "Desabilita gravação de clipes e captura pelo Game DVR do Windows. Revise esta troca antes de aplicar.",
  },
  disable_mouse_acceleration: {
    title: "Desativar aceleração do mouse",
    effect:
      "Muda a resposta do ponteiro. Pode exigir sair da conta para entrar em vigor.",
  },
  high_performance_power: {
    title: "Plano de energia Alto desempenho",
    effect:
      "Pode aumentar consumo, calor e ruído. Pode não existir em notebooks com Modern Standby.",
  },
};
function useWork() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn: () => Promise<void>) {
    setError("");
    if (!isTauri()) {
      setError("Abra o aplicativo desktop para usar esta função.");
      return;
    }
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
      void notifyEvent(
        "Uma etapa falhou. Abra o GameForge para consultar os detalhes.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
function ErrorText({ error }: { error: string }) {
  return error ? (
    <p className="message error" role="alert">
      {error}
    </p>
  ) : null;
}
export function OptimizePage({
  plan,
  setPlan,
}: {
  plan: OptimizationPlan | null;
  setPlan: (p: OptimizationPlan) => void;
}) {
  const w = useWork();
  const [goal, setGoal] = useState("Jogar e transmitir com estabilidade");
  const [context, setContext] = useState<unknown>(null);
  const [fallback, setFallback] = useState(true);
  const [selected, setSelected] = useState<SystemAction[]>([]);
  const [prepared, setPrepared] = useState<Operation | null>(null);
  const [result, setResult] = useState<Operation | null>(null);
  function storeResult(op:Operation|null){setResult(op);if(op?.status==="applied")void notifyEvent("Operação concluída e verificada. Consulte o Histórico.");}

  function accept(p: OptimizationPlan) {
    setPlan(p);
    void notifyEvent("Plano pronto para sua revisão.");
    setSelected(
      p.system_actions.filter(
        (a) =>
          a !== "high_performance_power" && a !== "disable_mouse_acceleration",
      ),
    );
    setPrepared(null);
    storeResult(null);
  }
  return (
    <>
      <section className="panel">
        <h2>Planejar a otimização</h2>
        <p className="muted">
          Claude Opus 5.5 é o planejador principal. GPT-6.1 Sol pode assumir em
          caso de falha. Os modelos propõem; você revisa e aprova.
        </p>
        <label className="field">
          Seu objetivo
          <select
            disabled={w.busy || !!prepared}
            value={goal}
            onChange={(e) => {
              setGoal(e.target.value);
              setContext(null);
            }}
          >
            <option>Jogar e transmitir com estabilidade</option>
            <option>Priorizar jogo competitivo</option>
            <option>Equilibrar desempenho e consumo</option>
          </select>
        </label>
        <div className="button-row">
          <button
            className="secondary"
            disabled={w.busy || !!prepared}
            onClick={() =>
              void w.run(async () => {
                accept(await invoke<OptimizationPlan>("offline_plan"));
              })
            }
          >
            Usar preset offline
          </button>
          <button
            className="primary"
            disabled={w.busy || !!prepared}
            onClick={() =>
              void w.run(async () =>
                setContext(await invoke("preview_ai", { goal })),
              )
            }
          >
            <Sparkles size={16} />
            Preparar análise com IA
          </button>
        </div>
        {context !== null && (
          <div className="ai-consent">
            <h3>Dados que serão enviados</h3>
            <p className="muted">
              CPU, memória, uso e espaço em disco. Chaves de API, chaves de
              transmissão, nomes de processos e caminhos pessoais são excluídos.
              A consulta pode gerar cobrança nas suas APIs.
            </p>
            <details open>
              <summary>Revisar JSON exato</summary>
              <pre>{JSON.stringify(context, null, 2)}</pre>
            </details>
            <label className="plan-row">
              <input
                type="checkbox"
                checked={fallback}
                onChange={(e) => setFallback(e.target.checked)}
              />
              Permitir envio à OpenAI se o Claude falhar
            </label>
            <button
              className="primary"
              disabled={w.busy || !!prepared}
              onClick={() =>
                void w.run(async () =>
                  accept(
                    await invoke<OptimizationPlan>("generate_plan", {
                      allowFallback: fallback,
                    }),
                  ),
                )
              }
            >
              {w.busy ? "Consultando…" : "Enviar dados e gerar plano"}
            </button>
          </div>
        )}
        <ErrorText error={w.error} />
      </section>
      {plan && (
        <section className="panel report-details">
          <h2>Revisar o plano</h2>
          <span className="tag">
            {plan.provider} · {plan.model}
          </span>
          <p>{plan.summary}</p>
          {plan.warnings.map((x) => (
            <p className="muted" key={x}>
              {x}
            </p>
          ))}
          <h3>Ajustes do Windows</h3>
          {plan.system_actions.map((a) => (
            <label className="plan-row" key={a}>
              <input
                disabled={!!prepared || w.busy}
                type="checkbox"
                checked={selected.includes(a)}
                onChange={() =>
                  setSelected((s) =>
                    s.includes(a) ? s.filter((x) => x !== a) : [...s, a],
                  )
                }
              />
              <span>
                <strong>{labels[a].title}</strong>
                <small>{labels[a].effect}</small>
              </span>
            </label>
          ))}
          <p className="muted">
            O Windows solicitará UAC. A aplicação exige Ponto de Restauração e
            snapshot. Se a Proteção do Sistema estiver indisponível, o lote será
            bloqueado.
          </p>
          {prepared ? (
            <>
              <h3>Estado anterior e mudanças propostas</h3>
              <details>
                <summary>Ver snapshot técnico</summary>
                <pre>{JSON.stringify(prepared.payload, null, 2)}</pre>
              </details>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={w.busy}
                  onClick={() =>
                    void w.run(async () => {
                      await invoke("cancel_system", { id: prepared.id });
                      setPrepared(null);
                    })
                  }
                >
                  Cancelar revisão
                </button>
                <button
                  className="primary"
                  disabled={w.busy}
                  onClick={() =>
                    void w.run(async () => {
                      try {
                        storeResult(
                          await invoke<Operation>("apply_system", {
                            id: prepared.id,
                          }),
                        );
                      } finally {
                        setPrepared(null);
                      }
                    })
                  }
                >
                  {w.busy
                    ? "Aguardando o Windows…"
                    : "Aprovar e aplicar no Windows (UAC)"}
                </button>
              </div>
            </>
          ) : (
            <button
              className="primary"
              disabled={w.busy || !selected.length}
              onClick={() =>
                void w.run(async () =>
                  setPrepared(
                    await invoke<Operation>("prepare_system", {
                      actions: selected,
                    }),
                  ),
                )
              }
            >
              Revisar valores antes de aplicar
            </button>
          )}
          {result && (
            <div className="message success" role="status">
              <ShieldCheck size={18} />
              Ajustes aplicados e verificados. Você pode desfazer no Histórico.
            </div>
          )}
          <h3>Perfil OBS sugerido</h3>
          <p>
            {plan.video.width} × {plan.video.height} · {plan.video.fps} FPS ·{" "}
            {plan.video.bitrate} kbps · x264 (CPU), preset veryfast
          </p>
          <p className="muted">
            Abra Streaming para conectar o OBS e configurar uma plataforma com
            este plano.
          </p>
        </section>
      )}
    </>
  );
}
export function CredentialsPage() {
  const w = useWork();
  const [status, setStatus] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (isTauri())
      invoke<string[]>("secret_status")
        .then(setStatus)
        .catch(() => {});
  }, []);
  const fields = [
    ["obs_password", "Senha do WebSocket OBS"],
  ];
  return (
    <section className="panel">
      <h2>Conexões e credenciais</h2>
      <p className="muted">
        A IA é disponibilizada pelo GameForge Cloud, com sua licença e saldo de
        créditos. Você não precisa configurar chaves de API. A senha do OBS fica
        no cofre de credenciais deste computador.
      </p>
      <ErrorText error={w.error} />
      {fields.map(([name, label]) => (
        <div className="credential" key={name}>
          <label className="field">
            {label}
            <input
              type="password"
              autoComplete="new-password"
              value={values[name] || ""}
              placeholder={
                status.includes(name)
                  ? "Credencial salva no cofre"
                  : "Cole a credencial"
              }
              onChange={(e) =>
                setValues((v) => ({ ...v, [name]: e.target.value }))
              }
            />
          </label>
          <div className="button-row">
            <button
              className="secondary"
              disabled={w.busy || !values[name]}
              onClick={() =>
                void w.run(async () => {
                  await invoke("save_secret", { name, value: values[name] });
                  setValues((v) => ({ ...v, [name]: "" }));
                  setStatus(await invoke<string[]>("secret_status"));
                })
              }
            >
              Salvar no cofre
            </button>
            <button
              className="text-button"
              disabled={w.busy || !status.includes(name)}
              onClick={() =>
                void w.run(async () => {
                  await invoke("remove_secret", { name });
                  setStatus(await invoke<string[]>("secret_status"));
                })
              }
            >
              Remover credencial
            </button>
            <span className="muted">
              {status.includes(name) ? "Salva" : "Não configurada"}
            </span>
          </div>
        </div>
      ))}
      <p className="muted">
        No OBS, habilite Ferramentas → Servidor WebSocket, porta 4455. A conexão
        é restrita a este computador.
      </p>
    </section>
  );
}
export function StreamingPage({ plan }: { plan: OptimizationPlan | null }) {
  const w = useWork();
  const [state, setState] = useState<ObsState | null>(null);
  const [platform, setPlatform] = useState("twitch");
  const [server, setServer] = useState("");
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<Operation | null>(null);
  function storeResult(op:Operation|null){setResult(op);if(op?.status==="applied")void notifyEvent("Operação concluída e verificada. Consulte o Histórico.");}

  useEffect(() => {
    if (isTauri())
      invoke<string[]>("secret_status")
        .then(setSaved)
        .catch(() => {});
  }, []);
  const video = plan?.video || {
    width: 1280,
    height: 720,
    fps: 30,
    bitrate: 3500,
  };
  return (
    <section className="panel">
      <h2>OBS e plataformas de streaming</h2>
      <button
        className="primary"
        disabled={w.busy}
        onClick={() =>
          void w.run(async () =>
            setState(await invoke<ObsState>("obs_auto_connect")),
          )
        }
      >
        Conectar automaticamente usando a configuração local
      </button>
      <p className="muted">
        Conexão por servidor RTMP/RTMPS e chave de transmissão. Configure um
        destino por perfil. O perfil anterior será preservado.
      </p>
      <div className="button-row">
        <button
          className="secondary"
          disabled={w.busy}
          onClick={() =>
            void w.run(async () => {
              await invoke("open_obs");
            })
          }
        >
          Abrir OBS instalado
        </button>
        <button
          className="secondary"
          disabled={w.busy}
          onClick={() =>
            void w.run(async () =>
              setState(await invoke<ObsState>("obs_connect")),
            )
          }
        >
          <Radio size={16} />
          Conectar e autenticar no OBS
        </button>
      </div>
      {state && (
        <p role="status">
          OBS {state.version} · Perfil {state.profile} ·{" "}
          {state.streaming
            ? "Transmitindo"
            : state.recording
              ? "Gravando"
              : "Saídas paradas"}
        </p>
      )}
      <ErrorText error={w.error} />
      <label className="field">
        Plataforma
        <select
          aria-label="Plataforma"
          value={platform}
          disabled={w.busy}
          onChange={(e) => {
            setPlatform(e.target.value);
            setKey("");
            setServer("");
            setConfirmed(false);
            storeResult(null);
          }}
        >
          <option value="twitch">Twitch</option>
          <option value="kick">Kick</option>
          <option value="youtube">YouTube</option>
          <option value="custom">Outra plataforma RTMP/RTMPS</option>
        </select>
      </label>
      <p className="muted">
        Copie a URL do servidor e a chave do painel de transmissão da
        plataforma. No YouTube, prepare também a transmissão no YouTube Studio;
        configurar o OBS não cria o evento.
      </p>
      <label className="field">
        URL do servidor (sem a chave)
        <input
          type="text"
          placeholder="rtmps://servidor-da-plataforma/app"
          value={server}
          disabled={w.busy}
          onChange={(e) => {
            setServer(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <label className="field">
        Chave de transmissão de {platform}
        <input
          type="password"
          autoComplete="new-password"
          placeholder={
            saved.includes(`stream_key_${platform}`)
              ? "Chave desta plataforma salva no cofre"
              : "Cole a chave da plataforma"
          }
          value={key}
          disabled={w.busy}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <button
        className="secondary"
        disabled={w.busy || !key}
        onClick={() =>
          void w.run(async () => {
            await invoke("save_secret", {
              name: `stream_key_${platform}`,
              value: key,
            });
            setKey("");
            setSaved(await invoke<string[]>("secret_status"));
          })
        }
      >
        Salvar chave desta plataforma no cofre
      </button>
      <h3>Configuração que será aplicada</h3>
      <p>
        {video.width} × {video.height} · {video.fps} FPS · {video.bitrate} kbps
        · x264 (CPU), veryfast
      </p>
      <p className="muted">
        A chave vai diretamente ao OBS local. A IA não recebe a chave ou a URL
        do servidor. Verifique a capacidade de upload e o consumo de CPU antes
        de transmitir.
      </p>
      <label className="plan-row">
        <input
          type="checkbox"
          disabled={w.busy}
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Revisei o destino e a configuração. Autorizo criar um perfil separado no
        OBS.
      </label>
      <button
        className="primary"
        disabled={
          w.busy ||
          !state ||
          !server ||
          !saved.includes(`stream_key_${platform}`) ||
          !confirmed ||
          state.streaming ||
          state.recording
        }
        onClick={() =>
          void w.run(async () =>
            storeResult(
              await invoke<Operation>("obs_configure", {
                video,
                target: { platform, server },
              }),
            ),
          )
        }
      >
        {w.busy ? "Configurando…" : "Criar e configurar perfil no OBS"}
      </button>
      {result && (
        <div role="status" className="message success">
          Perfil criado e vídeo verificado. Confira as cenas e o áudio no OBS
          antes de iniciar a transmissão. O desfazer está disponível no
          Histórico.
        </div>
      )}
    </section>
  );
}
export function OperationsPage() {
  const w = useWork();
  const [ops, setOps] = useState<Operation[] | null>(null);
  async function refresh() {
    setOps(await invoke<Operation[]>("operation_history"));
  }
  return (
    <section className="panel report-details">
      <h2>Otimizações do Windows e perfis OBS</h2>
      <button
        className="secondary"
        disabled={w.busy}
        onClick={() => void w.run(refresh)}
      >
        Atualizar operações
      </button>
      <ErrorText error={w.error} />
      {ops?.length === 0 && <p>Nenhuma operação registrada.</p>}
      {ops
        ?.filter((op) => ["system", "obs"].includes(op.kind))
        .map((op) => (
          <div className="history-entry" key={op.id}>
            <div className="data-row">
              <strong>{op.summary}</strong>
              <span className="tag">{op.status}</span>
            </div>
            {op.error && <p className="message error">{op.error}</p>}
            <details>
              <summary>Ver snapshot</summary>
              <pre>{JSON.stringify(op.payload, null, 2)}</pre>
            </details>
            {op.status === "approved" ? (
              <button
                className="secondary"
                disabled={w.busy}
                onClick={() =>
                  void w.run(async () => {
                    await invoke("cancel_system", { id: op.id });
                    await refresh();
                  })
                }
              >
                Cancelar revisão pendente
              </button>
            ) : (
              ["applied", "pending", "recovery_required"].includes(
                op.status,
              ) && (
                <button
                  className="secondary"
                  disabled={w.busy}
                  onClick={() =>
                    void w.run(async () => {
                      await invoke("undo_operation", { id: op.id });
                      await refresh();
                    })
                  }
                >
                  <Undo2 size={16} />
                  Restaurar{" "}
                  {op.kind === "system" ? "Windows (UAC)" : "perfil OBS"}
                </button>
              )
            )}
          </div>
        ))}
    </section>
  );
}
