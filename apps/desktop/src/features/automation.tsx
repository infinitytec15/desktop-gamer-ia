import "@gameforge/printing/style.css";
import { notifyEvent } from "../lib/notifications";
import { useState, useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { CircleCheck, KeyRound, Radio } from "lucide-react";
import type { OptimizationPlan } from "../generated/OptimizationPlan";
import type { Operation } from "../generated/Operation";
import type { ObsState } from "../generated/ObsState";
import { OperationResult } from "./operation-view";
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
export { OptimizePage } from "./boost";
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
  const fields = [["obs_password", "Senha do WebSocket OBS"]];
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
  function storeResult(op: Operation | null) {
    setResult(op);
    if (op?.status === "applied")
      void notifyEvent(
        "Operação concluída e verificada. Consulte o Histórico.",
      );
  }

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
    <section className="panel streaming-page">
      <h2>OBS e plataformas de streaming</h2>
      <p className="muted">
        Siga as três etapas para criar um perfil separado. Este fluxo não inicia
        uma transmissão.
      </p>
      <div className="stream-section">
        <h3>1. Conecte o OBS</h3>
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
          <p role="status" className="connection-status">
            <CircleCheck size={17} /> OBS {state.version} · Perfil{" "}
            {state.profile} ·{" "}
            {state.streaming
              ? "Transmitindo"
              : state.recording
                ? "Gravando"
                : "Saídas paradas"}
          </p>
        )}
        <ErrorText error={w.error} />
      </div>
      <div className="stream-section">
        <h3>2. Escolha o destino</h3>
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
          plataforma. No YouTube, prepare também a transmissão no YouTube
          Studio; configurar o OBS não cria o evento.
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
        <p className="help-line">
          <KeyRound size={15} />
          {saved.includes(`stream_key_${platform}`)
            ? "Chave desta plataforma salva no cofre do computador."
            : "Salve a chave desta plataforma para habilitar a configuração."}
        </p>
      </div>
      <div className="stream-section">
        <h3>3. Revise a configuração</h3>
        <dl className="stream-spec">
          <div>
            <dt>Resolução</dt>
            <dd>
              {video.width} × {video.height}
            </dd>
          </div>
          <div>
            <dt>Quadros</dt>
            <dd>{video.fps} FPS</dd>
          </div>
          <div>
            <dt>Bitrate</dt>
            <dd>{video.bitrate} kbps</dd>
          </div>
          <div>
            <dt>Encoder</dt>
            <dd>x264 · veryfast</dd>
          </div>
        </dl>
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
          Revisei o destino e a configuração. Autorizo criar um perfil separado
          no OBS.
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
        {!state && (
          <p className="muted">
            Conecte e autentique o OBS na primeira etapa para continuar.
          </p>
        )}
        {state && (state.streaming || state.recording) && (
          <p className="message warning">
            Pare a transmissão e a gravação no OBS antes de configurar o perfil.
          </p>
        )}
        {result && (
          <OperationResult op={result} focusResult>
            <p className="muted">
              Confira as cenas e o áudio no OBS e faça uma gravação de teste. A
              restauração do perfil está no Histórico.
            </p>
          </OperationResult>
        )}
      </div>
    </section>
  );
}
export { OperationsPage } from "./operations";
