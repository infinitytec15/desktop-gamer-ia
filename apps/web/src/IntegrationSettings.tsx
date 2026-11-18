import type { FormEvent } from "react";
import { Field } from "./ui";
import { api, type Row } from "./lib";
type Props = {
  data: Row;
  mutate: (fn: () => Promise<unknown>, message?: string) => unknown;
  busy: boolean;
};
export function PaymentSettings({ data, mutate, busy }: Props) {
  const state = data.mercadopago;
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form),
      body: Row = {
        live_mode: f.get("live_mode") === "on",
        billing_enabled: f.get("billing_enabled") === "on",
      };
    for (const key of [
      "access_token",
      "webhook_secret",
      "collector_id",
      "public_key",
    ]) {
      const value = String(f.get(key) || "").trim();
      if (value) body[key] = value;
    }
    void mutate(async () => {
      await api("/admin/mercadopago", body);
      form.reset();
    }, "Configuração do Mercado Pago salva");
  }
  return (
    <section className="section-card">
      <div className="section-head">
        <h2>Configurar Mercado Pago</h2>
        <p>
          Segredos cifrados no servidor e campos somente para substituição.
          Deixe em branco para manter o valor salvo. Nenhuma chave é devolvida
          ao navegador.
        </p>
      </div>
      <form
        className="settings-form"
        key={state.updated_at || "environment"}
        onSubmit={save}
      >
        <Field label="Access token Mercado Pago">
          <input
            name="access_token"
            type="password"
            autoComplete="new-password"
            maxLength={2400}
            placeholder={
              state.token
                ? "Token configurado · cole apenas para trocar"
                : "Cole o access token"
            }
          />
        </Field>
        <Field label="Segredo de assinatura do webhook">
          <input
            name="webhook_secret"
            type="password"
            autoComplete="new-password"
            maxLength={2400}
            placeholder={
              state.webhook
                ? "Segredo configurado · cole apenas para trocar"
                : "Cole o segredo do webhook"
            }
          />
        </Field>
        <Field label="ID do vendedor (collector ID)">
          <input
            name="collector_id"
            inputMode="numeric"
            pattern="[0-9]{1,40}"
            autoComplete="off"
            placeholder={
              state.collector
                ? "ID configurado · deixe em branco para manter"
                : "ID da conta do vendedor"
            }
          />
        </Field>
        <Field label="Public key Mercado Pago (opcional)">
          <input
            name="public_key"
            type="password"
            autoComplete="new-password"
            maxLength={2400}
            placeholder={
              state.public_key
                ? "Chave configurada"
                : "Checkout Pro por redirecionamento não exige esta chave"
            }
          />
        </Field>
        <Field label="URL do webhook">
          <input
            value={
              state.webhook_url || data.app_url + "/api/webhooks/mercadopago"
            }
            readOnly
          />
        </Field>
        <button
          type="button"
          className="button secondary small"
          onClick={() =>
            void mutate(
              () =>
                navigator.clipboard.writeText(
                  state.webhook_url ||
                    data.app_url + "/api/webhooks/mercadopago",
                ),
              "URL do webhook copiada",
            )
          }
        >
          Copiar URL do webhook
        </button>
        <label className="check-row">
          <input
            name="live_mode"
            type="checkbox"
            defaultChecked={state.live_mode}
          />
          Usar credenciais e pagamentos de produção
        </label>
        <label className="check-row">
          <input
            name="billing_enabled"
            type="checkbox"
            defaultChecked={state.billing_enabled}
          />
          Habilitar novas assinaturas e recargas
        </label>
        <p className="fine muted">
          Cadastre a URL no Mercado Pago e selecione eventos de assinaturas e
          pagamentos. Teste token/vendedor e homologue o webhook antes de abrir
          vendas.
        </p>
        <div className="row-actions">
          <button className="button primary small" disabled={busy}>
            Salvar Mercado Pago
          </button>
          <button
            type="button"
            className="button secondary small"
            disabled={busy || !state.token || !state.collector}
            onClick={() =>
              void mutate(async () => {
                const result = await api("/admin/mercadopago/test", {});
                if (!result.ok) throw new Error("Verificação não confirmada");
              }, "Token e vendedor validados; nenhuma cobrança criada")
            }
          >
            Testar token e vendedor
          </button>
          {state.stored && (
            <button
              type="button"
              className="table-action"
              disabled={busy}
              onClick={() =>
                void mutate(
                  () => api("/admin/mercadopago/restore", {}),
                  "Configuração anterior restaurada",
                )
              }
            >
              Restaurar configuração anterior
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
export function RoutingSettings({ data, mutate, busy }: Props) {
  const names = {
    economy: "Econômico",
    balanced: "Equilibrado",
    advanced: "Avançado",
  };
  return (
    <section className="section-card">
      <div className="section-head">
        <h2>Roteamento e custo de IA</h2>
        <p>
          Modelos permitidos têm tabela de custo no servidor. A cobrança usa os
          tokens informados. Esforço aumenta o orçamento de raciocínio; o
          cliente revisa a estimativa e a reserva antes de enviar.
        </p>
      </div>
      <form
        className="settings-form"
        key={JSON.stringify(data.routing)}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const body = Object.fromEntries(
            Object.keys(names).map((mode) => [
              mode,
              {
                primary: f.get(mode + "_primary"),
                fallback: f.get(mode + "_fallback") || null,
              },
            ]),
          );
          void mutate(
            () => api("/admin/ai/routing", body),
            "Roteamento atualizado; novas análises usarão os modelos selecionados",
          );
        }}
      >
        {Object.entries(names).map(([mode, label]) => (
          <div className="commercial-form" key={mode}>
            <Field label={label + " · modelo principal"}>
              <select
                name={mode + "_primary"}
                defaultValue={data.routing[mode].primary}
              >
                {Object.keys(data.ai_models).map((model) => (
                  <option key={model}>{model}</option>
                ))}
              </select>
            </Field>
            <Field label={label + " · fallback autorizado"}>
              <select
                name={mode + "_fallback"}
                defaultValue={data.routing[mode].fallback || ""}
              >
                <option value="">Sem fallback</option>
                {Object.keys(data.ai_models).map((model) => (
                  <option key={model}>{model}</option>
                ))}
              </select>
            </Field>
          </div>
        ))}
        <button className="button primary small" disabled={busy}>
          Salvar roteamento
        </button>
        {data.routing_can_restore && (
          <button
            type="button"
            className="button secondary small"
            disabled={busy}
            onClick={() =>
              void mutate(
                () => api("/admin/ai/routing/restore", {}),
                "Roteamento anterior restaurado",
              )
            }
          >
            Restaurar roteamento anterior
          </button>
        )}
      </form>
    </section>
  );
}
