import { useEffect, useState, type FormEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import type { LicenseStatus } from "../generated/LicenseStatus";
export function LicensePage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setStatus(await invoke<LicenseStatus>("license_status"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (isTauri()) void refresh();
  }, []);
  async function activate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      setStatus(
        await invoke<LicenseStatus>("license_activate", { key: key.trim() }),
      );
      setKey("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>
        <KeyRound size={20} /> Licença GameForge
      </h2>
      <p className="muted">
        Assine no site, gere sua chave e ative este computador. As chaves dos
        provedores de IA ficam no servidor. Aplicar um plano já gerado não
        consome créditos de IA.
      </p>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {!isTauri() ? (
        <p className="message">
          A ativação está disponível no aplicativo instalado.
        </p>
      ) : (
        <>
          <div
            className={"message " + (status?.active ? "success" : "")}
            role="status"
          >
            <ShieldCheck size={17} />
            {busy
              ? "Consultando licença…"
              : status?.message || "Aguardando validação."}
          </div>
          {status?.active && (
            <p>
              Plano: <strong>{status.plan}</strong> · Validação local até{" "}
              {status.expires_at
                ? new Date(status.expires_at * 1000).toLocaleString("pt-BR")
                : "—"}
            </p>
          )}
          {!status?.active && (
            <form onSubmit={activate}>
              <label className="field">
                Chave de ativação
                <input
                  type="password"
                  value={key}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="GF_…"
                  onChange={(e) => setKey(e.target.value)}
                  minLength={46}
                  maxLength={46}
                  required
                  disabled={busy || !status?.configured}
                />
              </label>
              <button
                className="primary"
                disabled={
                  busy || !status?.configured || key.trim().length !== 46
                }
              >
                Ativar este computador
                <KeyRound size={16} />
              </button>
            </form>
          )}
          <div className="button-row">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Validar novamente
              <RefreshCw size={16} />
            </button>
            {status?.active && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                Desativar computador
              </button>
            )}
          </div>
          {confirm && (
            <div className="message">
              <p>
                A desativação revoga este vínculo e remove o token local. Para
                reativar o mesmo computador, gere outra chave no painel.
                Confirme somente se deseja encerrar o vínculo atual.
              </p>
              <div className="button-row">
                <button className="secondary" onClick={() => setConfirm(false)}>
                  Voltar
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void invoke("license_deactivate")
                      .then(() => {
                        setStatus(null);
                        setConfirm(false);
                        return refresh();
                      })
                      .catch((e) => {
                        setError(String(e));
                        setBusy(false);
                      });
                  }}
                >
                  Confirmar desativação
                </button>
              </div>
            </div>
          )}
          {status?.website && (
            <p className="muted">
              Sua conta e seu saldo: <code>{status.website}/app</code>
            </p>
          )}
          <p className="muted">
            A licença é conferida antes dos ajustes. Offline, uma validação
            assinada pode durar até 24 horas. Diagnóstico e restauração
            continuam locais.
          </p>
        </>
      )}
    </section>
  );
}
