import { useEffect, useState } from "react";
export type AiChoice = {
  mode: "economy" | "balanced" | "advanced";
  effort: "low" | "medium" | "high";
};
export type AiQuote = {
  quote_hash: string;
  models: string[];
  mode: string;
  effort: string;
  estimated_credits: number;
  maximum_credits: number;
  explanation: string;
};
export function useAiQuote(
  estimate: ((input: any) => Promise<unknown>) | undefined,
  input: unknown,
  enabled: boolean,
) {
  const key = JSON.stringify(input);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    quote: AiQuote | null;
    loading: boolean;
    error: string;
  }>({ quote: null, loading: false, error: "" });
  useEffect(() => {
    let active = true;
    setState({
      quote: null,
      loading: !!(enabled && input && estimate),
      error: "",
    });
    if (!enabled || !input || !estimate) return;
    const timer = setTimeout(() => {
      void estimate(input)
        .then((value) => {
          const v = value as AiQuote;
          if (
            !v ||
            !Number.isFinite(v.maximum_credits) ||
            !Number.isFinite(v.estimated_credits) ||
            !v.quote_hash ||
            !Array.isArray(v.models)
          )
            throw new Error("Estimativa indisponível");
          if (active) setState({ quote: v, loading: false, error: "" });
        })
        .catch((e) => {
          if (active)
            setState({
              quote: null,
              loading: false,
              error: e instanceof Error ? e.message : "Estimativa indisponível",
            });
        });
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, enabled, estimate, version]);
  return { ...state, refresh: () => setVersion((v) => v + 1) };
}
export function AiControls({
  value,
  onChange,
  quote,
  loading,
  error,
  refresh,
  disabled = false,
}: {
  value: AiChoice;
  onChange: (value: AiChoice) => void;
  quote: AiQuote | null;
  loading: boolean;
  error: string;
  refresh?: () => void;
  disabled?: boolean;
}) {
  const number = (n: number) =>
    n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return (
    <div className="ai-budget-controls">
      {refresh && (
        <button
          type="button"
          className="print-button secondary"
          disabled={disabled || loading}
          onClick={refresh}
        >
          Atualizar estimativa
        </button>
      )}
      <div className="ai-choice-grid">
        <label>
          Inteligência
          <select
            disabled={disabled}
            value={value.mode}
            onChange={(e) =>
              onChange({ ...value, mode: e.target.value as AiChoice["mode"] })
            }
          >
            <option value="economy">Econômico · tarefas objetivas</option>
            <option value="balanced">Equilibrado · análise técnica</option>
            <option value="advanced">Avançado · casos complexos</option>
          </select>
        </label>
        <label>
          Esforço de raciocínio
          <select
            disabled={disabled}
            value={value.effort}
            onChange={(e) =>
              onChange({
                ...value,
                effort: e.target.value as AiChoice["effort"],
              })
            }
          >
            <option value="low">Rápido · menor orçamento</option>
            <option value="medium">Normal · mais análise</option>
            <option value="high">Profundo · maior orçamento</option>
          </select>
        </label>
      </div>
      <div className="ai-quote" aria-live="polite">
        {loading ? (
          <p>Calculando estimativa, sem chamar a IA…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : quote ? (
          <>
            <strong>
              Estimativa: {number(quote.estimated_credits)} créditos
            </strong>
            <p>
              Reserva máxima: {number(quote.maximum_credits)} créditos
              {quote.models.length > 1 ? " · inclui fallback autorizado" : ""}.
            </p>
            <small>
              {quote.models.join(" → ")}. O consumo real depende dos tokens; o
              restante da reserva volta ao saldo. Mais esforço pode consumir
              mais créditos.
            </small>
          </>
        ) : (
          <p>
            Revise e confirme os dados para calcular a estimativa antes de usar
            IA.
          </p>
        )}
      </div>
    </div>
  );
}
