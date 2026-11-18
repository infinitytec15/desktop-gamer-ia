import { OverviewPage } from "./features/overview";
import { SettingsPage } from "./features/settings";
import { WelcomePage, ProgramsPage, RequestsPage } from "./features/programs";
import {
  OptimizePage,
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
import React, { useState, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Printer,
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
  Search,
  Wifi,
  Zap,
} from "lucide-react";
import type { Report } from "./domain";
import "./style.css";
import "./desktop.css";
import { LiveSetupPage } from "./features/live";
const PrintingPage = lazy(() => import("./features/printing"));
const navigation = [
  { id: "home", label: "Visão geral", icon: LayoutDashboard },
  { id: "programs", label: "Programas", icon: AppWindow },
  { id: "requests", label: "Solicitações", icon: ClipboardCheck },
  { id: "printing", label: "Impressão 3D", icon: Printer },
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
const pageHelp: Record<string, string> = {
  boost:
    "Do objetivo ao resultado: revise os ajustes do Windows e acompanhe cada etapa.",
  programs:
    "Encontre um programa, conte seu objetivo e siga o fluxo de configuração.",
  requests:
    "Acompanhe planos, execuções e os critérios de aceite que você definiu.",
  printing:
    "Analise sua peça e revise parâmetros para FDM ou resina antes de exportar.",
  games: "Consulte os jogos encontrados nas bibliotecas Steam e Epic.",
  obs: "Conecte o OBS, escolha o destino e revise um perfil separado de transmissão.",
  discord: "Siga as orientações de voz e privacidade dentro do Discord.",
  live: "Prepare seu setup por etapas: Windows, OBS e voz.",
  network: "Verifique a conectividade e entenda o alcance das medições.",
  monitor: "Acompanhe CPU, RAM, GPU e sensores disponíveis em tempo real.",
  history:
    "Veja o que mudou, confira o resultado e recupere configurações anteriores.",
  settings: "Gerencie sua licença, notificações e a conexão local com o OBS.",
};
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
  const [taskBusy, setTaskBusy] = useState(false);
  const [navQuery, setNavQuery] = useState("");
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
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Ir para o conteúdo
      </a>
      <aside>
        <a
          className="brand"
          aria-disabled={taskBusy}
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            if (!taskBusy) go("home");
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
        <label className="nav-search">
          <Search size={15} />
          <input
            aria-label="Buscar tela"
            type="search"
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            placeholder="Buscar ferramenta…"
          />
        </label>
        <nav aria-label="Navegação principal">
          {[
            {
              label: "Seu computador",
              ids: ["home", "boost", "monitor", "programs", "games", "network"],
            },
            {
              label: "Criação e transmissão",
              ids: ["obs", "discord", "live", "printing"],
            },
            {
              label: "Conta e atividade",
              ids: ["requests", "history", "settings"],
            },
          ].map((group) => {
            const items = navigation.filter(
              (n) =>
                group.ids.includes(n.id) &&
                n.label
                  .toLocaleLowerCase("pt-BR")
                  .includes(navQuery.toLocaleLowerCase("pt-BR")),
            );
            return (
              items.length > 0 && (
                <div className="navigation-group" key={group.label}>
                  <span>{group.label}</span>
                  {items.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      title={label}
                      aria-label={label}
                      aria-current={route === id ? "page" : undefined}
                      className={route === id ? "active" : ""}
                      disabled={taskBusy}
                      onClick={() => {
                        go(id);
                        setNavQuery("");
                      }}
                    >
                      <Icon size={19} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )
            );
          })}
          {navQuery &&
            !navigation.some((n) =>
              n.label
                .toLocaleLowerCase("pt-BR")
                .includes(navQuery.toLocaleLowerCase("pt-BR")),
            ) && <p className="muted">Nenhuma tela encontrada.</p>}
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
          <span className="dot" /> Beta · v0.6.0
        </footer>
      </aside>
      <div className="workspace">
        <header>
          <span>
            Meu computador <ChevronRight size={14} />{" "}
            <strong>{page.label}</strong>
          </span>
          <span className="environment">
            <span className="dot" />
            {native ? "Aplicativo desktop" : "Prévia da interface"}
          </span>
        </header>
        <main id="main-content" tabIndex={-1}>
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
                  : pageHelp[route] ||
                    "Configure com clareza. Aplique com confiança."}
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
            <OverviewPage
              report={report}
              busy={busy}
              scan={scan}
              navigate={go}
            />
          ) : route === "boost" ? (
            <OptimizePage
              plan={aiPlan}
              setPlan={setAiPlan}
              navigate={go}
              onBusyChange={setTaskBusy}
            />
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
            <LiveSetupPage
              plan={aiPlan}
              setPlan={setAiPlan}
              navigate={go}
              onBusyChange={setTaskBusy}
            />
          ) : route === "printing" ? (
            <Suspense fallback={<p role="status">Preparando impressão 3D…</p>}>
              <PrintingPage />
            </Suspense>
          ) : route === "settings" ? (
            <SettingsPage />
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
