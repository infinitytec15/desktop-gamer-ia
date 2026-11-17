import {LicensePage} from "./features/license";
import {
  WelcomePage,
  NotificationSettings,
  ProgramsPage,
  RequestsPage,
} from "./features/programs";
import {
  OptimizePage,
  CredentialsPage,
  StreamingPage,
  OperationsPage,
} from "./features/automation";
import type { OptimizationPlan } from "./generated/OptimizationPlan";
import {
  GamesPage,
  NetworkPage,
  MonitorPage,
  DiscordPage,
  HistoryPage,
  ReportDetails,
} from "./features/modules";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Activity,
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  Cpu,
  Gamepad2,
  History,
  LayoutDashboard,
  AppWindow,
  ClipboardCheck,
  LoaderCircle,
  Radio,
  Settings,
  ShieldCheck,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import type { Report } from "./domain";
import "./style.css";
const navigation = [
  { id: "home", label: "Visão geral", icon: LayoutDashboard },
  { id: "programs", label: "Programas", icon: AppWindow },
  { id: "requests", label: "Solicitações", icon: ClipboardCheck },
  { id: "boost", label: "Quick Boost", icon: Zap },
  { id: "games", label: "Jogos", icon: Gamepad2 },
  { id: "obs", label: "Streaming", icon: Radio },
  { id: "discord", label: "Discord", icon: AudioLines },
  { id: "live", label: "Pronto para Live", icon: Sparkles },
  { id: "network", label: "Rede", icon: Wifi },
  { id: "monitor", label: "Monitor", icon: Activity },
  { id: "history", label: "Histórico", icon: History },
  { id: "settings", label: "Configurações", icon: Settings },
];
const descriptions: Record<string, string> = {
  games:
    "Detectar jogos e ajustar configurações compatíveis com o seu hardware.",
  obs: "Preparar perfis, cenas e áudio no OBS Studio.",
  discord: "Ajustar o cliente e seguir as orientações de voz.",
  live: "Reunir sistema, jogo, áudio e transmissão em um único assistente.",
  network: "Medir latência, upload e comparar servidores DNS.",
  monitor: "Acompanhar métricas coletadas do computador.",
};
function App() {
  const [aiPlan, setAiPlan] = useState<OptimizationPlan | null>(null);
  const [route, setRoute] = useState(
    location.hash.slice(1) ||
      (isTauri() && localStorage.getItem("gameforge.onboarding.v1") !== "done"
        ? "onboarding"
        : "home"),
  );
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const sync = () => setRoute(location.hash.slice(1) || "home");
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const native = isTauri();
  const page = navigation.find((n) => n.id === route) || navigation[0];
  function continueOnboarding(id: string) {
    localStorage.setItem("gameforge.onboarding.v1", "done");
    go(id);
  }
  function go(id: string) {
    setRoute(id);
    location.hash = id;
    setError("");
    setNotice("");
  }
  async function run(work: () => Promise<void>) {
    setError("");
    setNotice("");
    if (!native) {
      setError(
        "Abra o aplicativo desktop para acessar dados e preferências reais. Esta prévia do navegador não executa ações locais.",
      );
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
  async function scan() {
    await run(async () => {
      setReport(await invoke<Report>("diagnose"));
      setNotice(
        "Diagnóstico concluído. Consulte os dados e as limitações da coleta abaixo.",
      );
    });
  }
  return (
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand-icon">
            <Zap size={24} />
          </span>
          <span>
            GameForge<span className="brand-ai"> AI</span>
            <small>Seu setup, em equilíbrio.</small>
          </span>
        </a>
        <nav aria-label="Navegação principal">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-label={label}
              aria-current={route === id ? "page" : undefined}
              className={route === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "live" && <span className="new">NOVO</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={19} />
          <div>
            <strong>Você está no controle</strong>
            <p>
              Revise cada mudança.
              <br />
              Restaure quando precisar.
            </p>
          </div>
        </div>
        <footer>
          <span className="dot" /> Desenvolvimento · v0.2.0
        </footer>
      </aside>
      <div className="workspace">
        <header>
          <span>
            Workspace <ChevronRight size={14} /> <strong>{page.label}</strong>
          </span>
          <span className="environment">
            <span className="dot" />
            {native ? "Aplicativo desktop" : "Prévia da interface"}
          </span>
        </header>
        <main>
          <div className="heading">
            <div>
              <h1>
                {route === "home"
                  ? "Um bom setup começa aqui."
                  : route === "onboarding"
                    ? "Bem-vindo ao GameForge AI"
                    : page.label}
              </h1>
              <p>
                {route === "home"
                  ? "Conheça seu computador antes de mudar qualquer coisa."
                  : "Configure com clareza. Aplique com confiança."}
              </p>
            </div>
            {route === "home" && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void scan()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Activity size={17} />
                )}{" "}
                {busy ? "Analisando…" : "Analisar computador"}
              </button>
            )}
          </div>
          {!native && (
            <div className="preview">
              Modo de prévia · nenhuma informação de hardware é simulada e
              nenhuma alteração é executada.
            </div>
          )}
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <Check size={18} />
              {notice}
            </div>
          )}
          {route === "onboarding" ? (
            <WelcomePage onContinue={continueOnboarding} />
          ) : route === "programs" ? (
            <ProgramsPage navigate={go} />
          ) : route === "requests" ? (
            <RequestsPage />
          ) : route === "home" ? (
            <>
              <section className="overview">
                <div className="scan-symbol">
                  <Cpu size={48} strokeWidth={1} />
                </div>
                <div>
                  <span className="status-label">
                    {report ? "DIAGNÓSTICO BÁSICO" : "DIAGNÓSTICO PENDENTE"}
                  </span>
                  <h2>
                    {report
                      ? "O primeiro retrato do seu PC."
                      : "Primeiro, vamos conhecer sua máquina."}
                  </h2>
                  <p>
                    {report
                      ? "Dados de CPU, memória, discos, processos e sensores disponíveis, obtidos pelo núcleo nativo. GPU e drivers ainda não são coletados."
                      : "A análise identifica o ambiente do computador. Nenhuma configuração é alterada durante a leitura."}
                  </p>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void scan()}
                  >
                    {report ? "Atualizar diagnóstico" : "Começar diagnóstico"}
                    <ArrowRight size={16} />
                  </button>
                </div>
                <div className="safe">
                  <ShieldCheck size={20} />
                  <span>
                    Somente leitura
                    <br />
                    <strong>Sem alterações</strong>
                  </span>
                </div>
              </section>
              <section className="metrics" aria-label="Informações do sistema">
                {[
                  ["Processador", report?.cpu || "Aguardando análise"],
                  [
                    "Núcleos lógicos",
                    report ? String(report.logical_cores) : "—",
                  ],
                  [
                    "Sistema",
                    report
                      ? `${report.os} · ${report.arch}`
                      : "Aguardando análise",
                  ],
                  [
                    "Memória RAM",
                    report?.memory_gb
                      ? `${report.memory_gb.toFixed(1)} GB`
                      : "Aguardando análise",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </section>
              {report && <ReportDetails report={report} />}
              <div className="section-heading">
                <h2>Prepare seu próximo passo</h2>
                <span>Do básico à primeira live</span>
              </div>
              <section className="feature-grid">
                {[
                  {
                    id: "boost",
                    icon: Zap,
                    title: "Um setup mais leve",
                    desc: "Gere um plano com IA ou preset local e revise os ajustes do Windows antes de aplicar.",
                    cta: "Abrir Quick Boost",
                    color: "purple",
                  },
                  {
                    id: "games",
                    icon: Gamepad2,
                    title: "Seu jogo, sua prioridade",
                    desc: "Configurações por jogo, baseadas em hardware e objetivo. Integração em desenvolvimento.",
                    cta: "Explorar jogos",
                    color: "green",
                  },
                  {
                    id: "obs",
                    icon: Radio,
                    title: "Tudo pronto para transmitir",
                    desc: "Conecte o OBS e crie um perfil separado para Twitch, Kick, YouTube ou outro servidor RTMP.",
                    cta: "Abrir Streaming",
                    color: "pink",
                  },
                ].map(({ id, icon: Icon, title, desc, cta, color }) => (
                  <article key={id} className={color}>
                    <Icon size={26} />
                    <h3>{title}</h3>
                    <p>{desc}</p>
                    <button className="text-button" onClick={() => go(id)}>
                      {cta}
                      <ArrowRight size={16} />
                    </button>
                  </article>
                ))}
              </section>
              <section className="principle">
                <ShieldCheck size={25} />
                <div>
                  <h3>A mudança começa com a sua aprovação.</h3>
                  <p>
                    Planos revisáveis, ações conhecidas e restauração. Sem
                    promessas de FPS sem medição.
                  </p>
                </div>
                <button className="secondary" onClick={() => go("history")}>
                  Ver histórico
                  <ArrowRight size={15} />
                </button>
              </section>
            </>
          ) : route === "boost" ? (
            <OptimizePage plan={aiPlan} setPlan={setAiPlan} />
          ) : route === "history" ? (
            <>
              <OperationsPage />
              <HistoryPage />
            </>
          ) : route === "games" ? (
            <GamesPage />
          ) : route === "network" ? (
            <NetworkPage />
          ) : route === "monitor" ? (
            <MonitorPage />
          ) : route === "obs" ? (
            <StreamingPage plan={aiPlan} />
          ) : route === "discord" ? (
            <DiscordPage />
          ) : route === "live" ? (
            <>
              {" "}
              <OptimizePage plan={aiPlan} setPlan={setAiPlan} />{" "}
              <StreamingPage plan={aiPlan} /> <DiscordPage />{" "}
            </>
          ) : route === "settings" ? (
            <>
              <LicensePage />
              <NotificationSettings />
              <CredentialsPage />
            </>
          ) : (
            <section className="panel empty">
              <page.icon size={44} />
              <h2>{page.label}</h2>
              <p>{descriptions[route]}</p>
              <span className="tag">Integração em desenvolvimento</span>
              <p className="muted">
                O módulo será liberado após validação de compatibilidade,
                aplicação e restauração. Nenhuma operação deste módulo está
                disponível nesta versão.
              </p>
              <button className="secondary" onClick={() => go("home")}>
                Voltar à visão geral
                <ArrowRight size={16} />
              </button>
            </section>
          )}
        </main>
        <div className="bottom">
          <ShieldCheck size={14} />
          Nenhuma ação de sistema é executada automaticamente.
          <span>GameForge AI · Construído com transparência</span>
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
