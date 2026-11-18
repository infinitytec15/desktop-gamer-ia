import { useEffect, useState, useCallback } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { RefreshCw, ShieldCheck, Undo2 } from "lucide-react";
import type { Game } from "../generated/Game";
import type { Probe } from "../generated/Probe";
import type { Report, Snapshot } from "../domain";
import { ArrowRight, Gamepad2, Wifi } from "lucide-react";
function useRequest<T>(command: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!isTauri()) {
      setError(
        "Disponível no aplicativo desktop. Nenhuma leitura local é feita na prévia.",
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData(await invoke<T>(command));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [command]);
  return { data, error, loading, load };
}
function formatStamp(stamp: string) {
  if (!/^\d+$/.test(stamp)) return "Registro migrado";
  const date = new Date(Number(BigInt(stamp) / 1000000n));
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("pt-BR")
    : "Data indisponível";
}
function ErrorMessage({ text }: { text: string }) {
  return text ? (
    <p className="message error" role="alert">
      {text}
    </p>
  ) : null;
}
function Refresh({
  loading,
  onClick,
  label = "Atualizar",
}: {
  loading: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button className="secondary" disabled={loading} onClick={onClick}>
      <RefreshCw size={16} className={loading ? "spin" : ""} />
      {loading ? "Consultando…" : label}
    </button>
  );
}
export function GamesPage() {
  const q = useRequest<Game[]>("detect_games");
  const [query, setQuery] = useState("");
  return (
    <section className="panel">
      <h2>Biblioteca de jogos</h2>
      <p className="muted">
        Leitura de manifestos Steam e Epic. Nenhum arquivo do jogo é alterado.
      </p>
      <Refresh
        loading={q.loading}
        onClick={() => void q.load()}
        label="Detectar jogos"
      />
      <ErrorMessage text={q.error} />
      {!q.data && !q.loading && (
        <div className="useful-empty">
          <Gamepad2 size={28} />
          <h3>Encontre sua biblioteca</h3>
          <p>
            Clique em Detectar jogos para ler as instalações Steam e Epic deste
            computador. Seus arquivos permanecem intactos.
          </p>
        </div>
      )}
      {q.data && q.data.length > 0 && (
        <label className="field">
          Pesquisar em {q.data.length} jogos
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome do jogo…"
          />
        </label>
      )}
      {q.data?.length === 0 && (
        <p>
          Nenhum jogo foi localizado nas bibliotecas padrão. Instalações
          personalizadas sem registro na biblioteca podem não aparecer.
        </p>
      )}
      <div className="data-list">
        {q.data
          ?.filter((g) =>
            g.name
              .toLocaleLowerCase("pt-BR")
              .includes(query.toLocaleLowerCase("pt-BR")),
          )
          .map((g) => (
            <div className="data-row" key={g.id}>
              <div>
                <strong>{g.name}</strong>
                <small>
                  {g.store} ·{" "}
                  {g.installed
                    ? "Pasta instalada encontrada"
                    : "Instalação não confirmada"}
                </small>
              </div>
              <span className="tag">Somente leitura</span>
            </div>
          ))}
      </div>
      <p className="muted">
        Otimização depende de skills verificadas por versão do jogo. Detectar um
        título não significa que sua configuração esteja validada.
      </p>
    </section>
  );
}
export function NetworkPage() {
  const q = useRequest<Probe[]>("measure_network");
  return (
    <section className="panel">
      <h2>Conectividade com a internet</h2>
      <p className="muted">
        Três conexões TCP à porta 443. Estes tempos não medem ping de jogo ou
        velocidade do DNS.
      </p>
      <Refresh
        loading={q.loading}
        onClick={() => void q.load()}
        label="Testar conectividade"
      />
      <ErrorMessage text={q.error} />
      {!q.data && !q.loading && (
        <div className="useful-empty">
          <Wifi size={28} />
          <h3>Confira sua conexão</h3>
          <p>
            O teste consulta três destinos pela porta HTTPS e mostra o tempo
            para estabelecer cada conexão. Nenhuma configuração será alterada.
          </p>
        </div>
      )}
      <div className="network-results">
        {q.data?.map((p) => (
          <div key={p.name}>
            <h3>{p.name}</h3>
            <strong>
              {p.connected
                ? `${p.connect_ms?.toFixed(1)} ms`
                : "Conexão não estabelecida"}
            </strong>
            <small>
              {p.connected
                ? "Conexão HTTPS estabelecida"
                : "Destino não respondeu ao teste"}
            </small>
          </div>
        ))}
      </div>
      <p className="muted">
        Firewall, provedor ou o servidor podem bloquear a porta. Falhar aqui não
        confirma ausência de internet. DNS e configuração de rede permanecem
        intactos.
      </p>
    </section>
  );
}
export { MonitorPage } from "./monitor";
export function ObsPage() {
  const q = useRequest<Probe>("obs_status");
  return (
    <section className="panel">
      <h2>Conectar ao OBS Studio</h2>
      <p className="muted">
        Verifique o serviço local antes de configurar a transmissão.
      </p>
      <Refresh
        loading={q.loading}
        onClick={() => void q.load()}
        label="Verificar porta 4455"
      />
      <ErrorMessage text={q.error} />
      {q.data && (
        <p role="status">
          {q.data.connected
            ? "A porta local aceitou uma conexão."
            : "Não foi possível conectar à porta local."}{" "}
          {q.data.description}
        </p>
      )}
      <ol className="guide">
        <li>
          Abra o OBS e acesse Ferramentas → Configurações do servidor WebSocket.
        </li>
        <li>
          Ative o servidor na porta 4455 e mantenha a autenticação habilitada.
        </li>
        <li>
          Crie um perfil separado antes de testar configurações de vídeo, saída
          e áudio.
        </li>
        <li>
          Faça uma gravação de teste e confira as estatísticas antes de
          transmitir.
        </li>
      </ol>
      <p className="muted">
        Autenticação, configuração automática e teste de transmissão ainda não
        estão implementados. Esta verificação não inicia uma live.
      </p>
    </section>
  );
}
const discordSteps = [
  "Escolha o microfone e a saída corretos em Voz e vídeo.",
  "Faça o teste de microfone e ajuste a sensibilidade.",
  "Compare supressão de ruído e cancelamento de eco usando uma gravação.",
  "Revise o overlay para o jogo desejado.",
  "Ative o Modo Streamer se houver transmissão.",
];
export function DiscordPage() {
  const [done, setDone] = useState<number[]>([]);
  return (
    <section className="panel">
      <h2>Checklist de voz e privacidade</h2>
      <p className="muted">
        Etapas manuais. As marcações confirmam apenas o que você informou nesta
        sessão.
      </p>
      {discordSteps.map((s, i) => (
        <label key={s} className="plan-row">
          <input
            type="checkbox"
            checked={done.includes(i)}
            onChange={() =>
              setDone((d) =>
                d.includes(i) ? d.filter((n) => n !== i) : [...d, i],
              )
            }
          />
          <span>{s}</span>
        </label>
      ))}
      <p role="status">
        {done.length} de {discordSteps.length} etapas confirmadas por você.
      </p>
      <div className="guide-check">
        <progress
          value={done.length}
          max={discordSteps.length}
          aria-label="Etapas de voz confirmadas"
        />
        <span>Conferência manual no Discord</span>
      </div>
      <p className="muted">
        O GameForge não lê suas mensagens ou opera sua conta. O cliente e os
        servidores não são modificados por este checklist.
      </p>
    </section>
  );
}
export function HistoryPage() {
  const q = useRequest<Snapshot[]>("list_snapshots");
  const [error, setError] = useState(""),
    [restoring, setRestoring] = useState(false);
  async function restore(id: string) {
    setRestoring(true);
    setError("");
    try {
      await invoke("restore_snapshot", { id });
      await q.load();
    } catch (e) {
      setError(String(e));
    } finally {
      setRestoring(false);
    }
  }
  return (
    <section className="panel">
      <h2>Histórico de preferências</h2>
      <p className="muted">
        Últimos 100 registros persistidos em SQLite. A restauração é bloqueada
        se houver conflito com o estado atual.
      </p>
      <Refresh loading={q.loading || restoring} onClick={() => void q.load()} />
      <ErrorMessage text={q.error || error} />
      {q.data?.length === 0 && <p>Nenhum snapshot salvo.</p>}
      <div className="data-list">
        {q.data?.map((s) => (
          <div key={s.id} className="history-entry">
            <div className="data-row">
              <strong>{formatStamp(s.created_at)}</strong>
              <span className="tag">
                {s.status === "restored"
                  ? "Restaurado"
                  : s.status === "pending"
                    ? "Recuperação pendente"
                    : "Aplicado"}
              </span>
            </div>
            <details>
              <summary>Ver alterações</summary>
              <dl className="readable-data">
                {Object.keys(s.after).map((key) => (
                  <div key={key}>
                    <dt>
                      {{
                        offline_first: "Priorizar uso offline",
                        reduced_motion: "Reduzir movimento",
                        notifications: "Notificações",
                      }[key] || "Preferência do aplicativo"}
                    </dt>
                    <dd>
                      {s.before[key] ? "Ativada" : "Desativada"}{" "}
                      <ArrowRight size={13} />{" "}
                      {s.after[key] ? "Ativada" : "Desativada"}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
            <button
              className="secondary"
              disabled={restoring || s.status === "restored"}
              onClick={() => void restore(s.id)}
            >
              <Undo2 size={15} />
              Restaurar este snapshot
            </button>
          </div>
        ))}
      </div>
      <div className="muted">
        <ShieldCheck size={15} /> Somente preferências do aplicativo. Este
        histórico ainda não contém ações de sistema.
      </div>
    </section>
  );
}
export function ReportDetails({ report }: { report: Report }) {
  return (
    <section className="panel report-details">
      <h2>Dados coletados</h2>
      <div className="monitor-metrics">
        <div>
          <span>Memória utilizada</span>
          <strong>{report.memory_used_gb.toFixed(1)} GB</strong>
        </div>
        <div>
          <span>CPU na coleta</span>
          <strong>{report.cpu_usage.toFixed(1)}%</strong>
        </div>
      </div>
      <h3>Discos</h3>
      {report.disks.map((d, i) => (
        <div className="data-row" key={i}>
          <strong>
            {d.name || "Disco"} · {d.kind}
          </strong>
          <span>
            {d.available_gb.toFixed(1)} GB livres de {d.total_gb.toFixed(1)} GB
          </span>
        </div>
      ))}
      <h3>Processos com maior uso de memória</h3>
      {report.processes.map((p, i) => (
        <div className="data-row" key={i}>
          <strong>{p.name}</strong>
          <span>{p.memory_mb.toFixed(0)} MB</span>
        </div>
      ))}
      <h3>Sensores</h3>
      {report.sensors.length ? (
        report.sensors.map((s, i) => (
          <div className="data-row" key={i}>
            <span>{s.name}</span>
            <strong>
              {s.temperature === null
                ? "Indisponível"
                : `${s.temperature.toFixed(1)} °C`}
            </strong>
          </div>
        ))
      ) : (
        <p className="muted">Nenhum sensor disponível por esta API.</p>
      )}
      {report.warnings.map((w) => (
        <p className="muted" key={w}>
          {w}
        </p>
      ))}
    </section>
  );
}
