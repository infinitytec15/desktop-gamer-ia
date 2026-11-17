import { useEffect, useState } from "react";
export type Row = Record<string, any>;
export async function api<T = Row>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({ error: "O servidor está indisponível. Tente novamente." }));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir");
  return data;
}
export function useData<T = Row>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener("data-updated", refresh);
    return () => window.removeEventListener("data-updated", refresh);
  }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api<T>(path)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  return { data, error, loading, reload: () => setVersion((v) => v + 1) };
}
export function navigate(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}
export function money(cents: unknown) {
  return (Number(cents) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
export function number(value: unknown) {
  return Number(value || 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
}
export function date(value: unknown) {
  return value ? new Date(String(value)).toLocaleDateString("pt-BR") : "—";
}
export const labels: Record<string, string> = {
  active: "Ativa",
  authorized: "Autorizada",
  pending: "Pendente",
  creating: "Em processamento",
  approved: "Confirmado",
  cancelled: "Cancelada",
  canceled: "Cancelada",
  paused: "Pausada",
  refunded: "Estornado",
  charged_back: "Contestado",
  rejected: "Recusado",
  failed: "Falhou",
  blocked: "Bloqueado",
  done: "Processado",
  retry: "Nova tentativa",
  processing: "Processando",
  reservation: "Reserva de análise",
  settlement: "Acerto de consumo",
  payment: "Créditos de pagamento",
  reversal: "Estorno de créditos",
  admin_adjustment: "Ajuste administrativo",
};
export function Status({ value }: { value: string }) {
  return (
    <span
      className={
        "status " +
        (["active", "approved", "done"].includes(value)
          ? "positive"
          : ["failed", "blocked", "refunded", "charged_back"].includes(value)
            ? "negative"
            : "")
      }
    >
      <i />
      {labels[value] || value}
    </span>
  );
}
