import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Activity,
  AppWindow,
  ArrowRight,
  Clock3,
  Cpu,
  HardDrive,
  KeyRound,
  MemoryStick,
  Monitor,
  Printer,
  Radio,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { Report } from "../domain";
import type { LicenseStatus } from "../generated/LicenseStatus";
import type { Operation } from "../generated/Operation";
import { operationStamp, states } from "./operation-view";
import { ReportDetails } from "./modules";

export function OverviewPage({
  report,
  busy,
  scan,
  navigate,
}: {
  report: Report | null;
  busy: boolean;
  scan: () => Promise<void>;
  navigate: (id: string) => void;
}) {
  const [license, setLicense] = useState<LicenseStatus | null>(null),
    [ops, setOps] = useState<Operation[] | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void invoke<LicenseStatus>("license_status")
      .then((v) => {
        if (active) setLicense(v);
      })
      .catch(() => {});
    void invoke<Operation[]>("operation_history")
      .then((v) => {
        if (active)
          setOps(
            v
              .filter((o) => ["system", "obs", "plan"].includes(o.kind))
              .slice(0, 4),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const ramPercent = report?.memory_gb
    ? (report.memory_used_gb / report.memory_gb) * 100
    : null;
  const lowStorage =
    report?.disks.filter(
      (d) => d.total_gb > 0 && d.available_gb / d.total_gb < 0.1,
    ) || [];
  const mac = /mac|darwin/i.test(report?.os || navigator.userAgent);
  const attention = ops?.find((o) =>
    ["pending", "recovery_required", "approved"].includes(o.status),
  );
  return (
    <div className="desktop-overview">
      <section className="overview-command">
        <div className="overview-command-copy">
          <h2>O próximo passo do seu setup está aqui.</h2>
          <p>
            {report
              ? `${report.cpu} · ${report.logical_cores} núcleos lógicos. Seu diagnóstico está disponível para orientar as próximas escolhas.`
              : "Conheça sua máquina, prepare seus programas e acompanhe cada mudança. Tudo acontece neste aplicativo."}
          </p>
          <div className="button-row">
            <button className="primary" onClick={() => navigate("boost")}>
              <Zap size={17} />
              Abrir Quick Boost <ArrowRight size={16} />
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void scan()}
            >
              <Activity size={16} />
              {busy
                ? "Analisando…"
                : report
                  ? "Atualizar diagnóstico"
                  : "Começar diagnóstico"}
            </button>
          </div>
          <span className="help-line">
            <ShieldCheck size={15} />O diagnóstico é somente leitura. Você
            revisa os ajustes antes de aplicar.
          </span>
        </div>
        <div className="overview-machine">
          <Monitor size={46} strokeWidth={1.3} />
          <strong>{report ? report.os : "Seu computador"}</strong>
          <span>{report ? report.arch : "Aguardando diagnóstico"}</span>
          <button className="text-button" onClick={() => navigate("monitor")}>
            <Activity size={14} />
            Abrir monitor em tempo real
          </button>
        </div>
      </section>
      {attention && (
        <div className="message warning">
          <Clock3 size={19} />
          <div>
            <strong>Você tem uma operação para revisar</strong>
            <p>{states[attention.status]?.description}</p>
            <button
              className="text-button"
              onClick={() =>
                navigate(attention.status === "approved" ? "boost" : "history")
              }
            >
              Continuar com segurança <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
      <section
        className="overview-readings"
        aria-label="Informações do sistema"
      >
        <div>
          <Cpu size={19} />
          <span>Processador</span>
          <strong>{report?.cpu || "Aguardando análise"}</strong>
          <small>
            {report
              ? `${report.cpu_usage.toFixed(1)}% de uso na coleta`
              : "Faça o diagnóstico para conhecer o hardware"}
          </small>
        </div>
        <div>
          <MemoryStick size={19} />
          <span>Memória RAM</span>
          <strong>
            {report?.memory_gb
              ? `${report.memory_used_gb.toFixed(1)} / ${report.memory_gb.toFixed(1)} GB`
              : "Aguardando análise"}
          </strong>
          {ramPercent !== null ? (
            <>
              <meter
                min={0}
                max={100}
                value={ramPercent}
                aria-label="Memória RAM em uso"
              />
              <small>{ramPercent.toFixed(0)}% em uso nesta leitura</small>
            </>
          ) : (
            <small>Sem medição disponível</small>
          )}
        </div>
        <div>
          <HardDrive size={19} />
          <span>Armazenamento</span>
          <strong>
            {report
              ? `${report.disks.length} ${report.disks.length === 1 ? "volume encontrado" : "volumes encontrados"}`
              : "Aguardando análise"}
          </strong>
          <small>
            {report
              ? lowStorage.length > 0
                ? `${lowStorage.length} com menos de 10% de espaço livre`
                : "Confira o espaço por volume no diagnóstico"
              : "Os arquivos permanecem no seu computador"}
          </small>
        </div>
        <div>
          <ShieldCheck size={19} />
          <span>Ambiente</span>
          <strong>
            {report ? `${report.os} · ${report.arch}` : "Aguardando análise"}
          </strong>
          <small>
            {mac
              ? "macOS: ajustes Windows indisponíveis; demais ferramentas conforme suporte"
              : "Os ajustes disponíveis são conferidos antes de aplicar"}
          </small>
        </div>
      </section>
      <div className="overview-workspace">
        <section className="overview-tools">
          <div className="section-title">
            <div>
              <h2>O que você quer preparar?</h2>
              <p className="muted">
                Escolha a tarefa. O assistente mostra o que fazer em seguida.
              </p>
            </div>
          </div>
          {[
            {
              id: "programs",
              icon: AppWindow,
              title: "Configurar meus programas",
              text: "Encontre um aplicativo e defina seu objetivo antes de planejar.",
              label: "Explorar programas",
            },
            {
              id: "obs",
              icon: Radio,
              title: "Preparar uma transmissão",
              text: "Conecte o OBS e revise um perfil para Twitch, Kick, YouTube ou RTMP.",
              label: "Abrir Streaming",
            },
            {
              id: "printing",
              icon: Printer,
              title: "Melhorar uma impressão 3D",
              text: "Analise o STL e prepare parâmetros e cópias de perfis FDM ou resina.",
              label: "Abrir Impressão 3D",
            },
            {
              id: "monitor",
              icon: Activity,
              title: "Entender uma lentidão",
              text: "Acompanhe CPU, RAM, GPU e sensores disponíveis em tempo real.",
              label: "Abrir Monitor",
            },
          ].map(({ id, icon: Icon, title, text, label }) => (
            <button
              className="overview-tool"
              key={id}
              aria-label={label}
              onClick={() => navigate(id)}
            >
              <Icon size={22} />
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
        </section>
        <div className="overview-support">
          <section className="overview-account">
            <div className="section-title">
              <h2>Seu acesso</h2>
              <KeyRound size={20} />
            </div>
            <strong className="account-plan">
              {license?.active
                ? license.plan || "Licença ativa"
                : "Ative este computador"}
            </strong>
            <p>
              {license?.active
                ? "Licença validada localmente. Você pode revisar os recursos disponíveis no seu plano."
                : "Gere sua chave no site e ative em Configurações. Diagnóstico e restauração continuam locais."}
            </p>
            <button className="secondary" onClick={() => navigate("settings")}>
              {license?.active ? "Gerenciar licença" : "Configurar licença"}
              <ArrowRight size={15} />
            </button>
            <p className="account-note">
              No site: planos, créditos, chaves e downloads.
              <br />
              No desktop: suas ferramentas e configurações.
            </p>
          </section>
          <section className="overview-activity">
            <h2>Atividade recente</h2>
            {ops?.length ? (
              <ul>
                {ops.map((op) => (
                  <li key={op.id}>
                    <span
                      className={`activity-mark ${op.status === "applied" || op.status === "restored" ? "done" : ""}`}
                    />
                    <div>
                      <strong>
                        {op.kind === "plan"
                          ? "Plano preparado"
                          : op.kind === "obs"
                            ? "Perfil OBS"
                            : "Ajustes do sistema"}
                      </strong>
                      <span>
                        {states[op.status]?.label || "Plano salvo para revisão"}
                      </span>
                      <small>{operationStamp(op.id)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {ops === null
                  ? "Abra o histórico para conferir as operações locais deste computador."
                  : "Seus planos, aplicações e restaurações aparecerão aqui."}
              </p>
            )}
            <button className="text-button" onClick={() => navigate("history")}>
              Ver histórico completo <ArrowRight size={15} />
            </button>
          </section>
        </div>
      </div>
      {report && (
        <details className="overview-diagnostic">
          <summary>Consultar diagnóstico completo e processos</summary>
          <ReportDetails report={report} />
        </details>
      )}
    </div>
  );
}
