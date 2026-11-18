import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Download, History, RefreshCw, Undo2 } from "lucide-react";
import type { Operation } from "../generated/Operation";
import { downloadOperation, OperationResult } from "./operation-view";
export function OperationsPage() {
  const [ops, setOps] = useState<Operation[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [confirm, setConfirm] = useState<string | null>(null);
  async function refresh() {
    setOps(
      (await invoke<Operation[]>("operation_history")).filter((op) =>
        ["system", "obs"].includes(op.kind),
      ),
    );
  }
  async function run(fn: () => Promise<void>) {
    setError("");
    if (!isTauri()) {
      setError("Abra o aplicativo desktop para consultar o histórico local.");
      return;
    }
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (isTauri()) void run(refresh);
  }, []);
  const visible = ops?.filter(
    (op) =>
      filter === "all" ||
      (filter === "attention"
        ? ["approved", "pending", "recovery_required", "failed"].includes(
            op.status,
          )
        : op.kind === filter),
  );
  return (
    <section className="panel operations-page">
      <div className="section-title">
        <div>
          <h2>Otimizações do Windows e perfis OBS</h2>
          <p className="muted">
            Valores anteriores, resultado verificado e recuperação em um só
            lugar.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void run(refresh)}
        >
          <RefreshCw size={16} className={busy ? "spin" : ""} />
          Atualizar operações
        </button>
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <div className="filter-tabs" role="group" aria-label="Filtrar operações">
        {[
          ["all", "Todas"],
          ["system", "Windows"],
          ["obs", "OBS"],
          ["attention", "Precisam de atenção"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
            {ops && value === "all" && <span>{ops.length}</span>}
          </button>
        ))}
      </div>
      {ops === null && !busy && (
        <div className="useful-empty">
          <History size={27} />
          <h3>Suas alterações ficam registradas aqui</h3>
          <p>
            Atualize o histórico no aplicativo para consultar revisões,
            configurações aplicadas e restaurações.
          </p>
        </div>
      )}
      {ops === null && busy && (
        <p className="working-line">Lendo o histórico local…</p>
      )}
      {visible?.length === 0 && (
        <div className="useful-empty">
          <History size={27} />
          <h3>Nenhuma operação neste filtro</h3>
          <p>
            Após revisar um ajuste no Quick Boost ou configurar o OBS, o
            registro aparecerá aqui.
          </p>
        </div>
      )}
      {visible?.map((op) => (
        <article className="operation-entry" key={op.id}>
          <div className="operation-caption">
            <strong>
              {op.kind === "system"
                ? "Ajustes do Windows"
                : "Perfil de streaming OBS"}
            </strong>
            <span>{op.summary}</span>
          </div>
          <OperationResult op={op}>
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => downloadOperation(op)}
              >
                <Download size={15} />
                Salvar relatório
              </button>
              {op.status === "approved" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await invoke("cancel_system", { id: op.id });
                      await refresh();
                    })
                  }
                >
                  Cancelar revisão pendente
                </button>
              )}
              {["applied", "pending", "recovery_required"].includes(
                op.status,
              ) && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirm(op.id)}
                >
                  <Undo2 size={16} />
                  Restaurar{" "}
                  {op.kind === "system" ? "Windows (UAC)" : "perfil OBS"}
                </button>
              )}
            </div>
            {confirm === op.id && (
              <div className="inline-confirm">
                <h3>Confirmar restauração?</h3>
                <p>
                  {op.kind === "system"
                    ? "O Windows solicitará permissão. Os valores originais serão restaurados se não houver conflito com alterações externas."
                    : "O perfil anterior será reativado. Pare a gravação ou transmissão antes de continuar."}
                </p>
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Voltar
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await invoke("undo_operation", { id: op.id });
                        setConfirm(null);
                        await refresh();
                      })
                    }
                  >
                    {busy ? "Restaurando…" : "Confirmar restauração"}
                  </button>
                </div>
              </div>
            )}
          </OperationResult>
        </article>
      ))}
    </section>
  );
}
