import { useState } from "react";
import { Modal, Field } from "./ui";
import { api, type Row } from "./lib";
export function UserManagement({
  row,
  onChanged,
}: {
  row: Row;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = async () =>
    setData(await api("/admin/users/" + row.id + "/details"));
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await load();
      onChanged();
      setMessage("Alteração salva");
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível concluir");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="table-action"
        disabled={row.status === "deleted"}
        onClick={() => {
          setOpen(true);
          void load().catch((e) => setMessage(e.message));
        }}
      >
        Gerenciar
      </button>
      {open && (
        <Modal title="Gerenciar usuário" onClose={() => setOpen(false)}>
          {message && (
            <p className="alert" role="status">
              {message}
            </p>
          )}
          {!data ? (
            <p>Carregando…</p>
          ) : (
            <div className="user-management">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(() =>
                    api("/admin/users/" + row.id + "/edit", {
                      name: f.get("name"),
                      email: f.get("email"),
                    }),
                  );
                }}
              >
                <h3>Cadastro</h3>
                <Field label="Nome do usuário">
                  <input
                    name="name"
                    defaultValue={data.user.name}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </Field>
                <Field label="E-mail do usuário">
                  <input
                    name="email"
                    type="email"
                    defaultValue={data.user.email}
                    required
                  />
                </Field>
                <button className="button secondary small" disabled={busy}>
                  Salvar cadastro
                </button>
              </form>
              <form
                key={data.manual?.updated_at || "new"}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(() =>
                    data.manual
                      ? api(
                          "/admin/manual-subscriptions/" +
                            data.manual.id +
                            "/edit",
                          {
                            planId: f.get("planId"),
                            days: Number(f.get("days")),
                          },
                        )
                      : api("/admin/users/" + row.id + "/manual-subscription", {
                          request_id: crypto.randomUUID(),
                          planId: f.get("planId"),
                          days: Number(f.get("days")),
                          credits: Number(f.get("credits")),
                        }),
                  );
                }}
              >
                <h3>
                  {data.manual
                    ? "Editar assinatura manual"
                    : "Atribuir assinatura manual"}
                </h3>
                <p className="fine muted">
                  Concessão administrativa sem cobrança Mercado Pago. A validade
                  é contada a partir de agora. Créditos adicionais usam o ajuste
                  de saldo abaixo.
                </p>
                {data.manual && (
                  <p className="fine">
                    Válida até{" "}
                    {new Date(data.manual.ends_at).toLocaleDateString("pt-BR")}
                  </p>
                )}
                <Field label="Plano da concessão">
                  <select
                    name="planId"
                    defaultValue={data.manual?.plan_id || data.plans[0]?.id}
                  >
                    {data.plans.map((p: Row) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Validade a partir de hoje (dias)">
                  <input
                    type="number"
                    name="days"
                    min={1}
                    max={366}
                    defaultValue={30}
                    required
                  />
                </Field>
                {!data.manual && (
                  <Field label="Créditos a conceder uma vez">
                    <input
                      name="credits"
                      type="number"
                      min={0}
                      max={100000}
                      defaultValue={0}
                      required
                    />
                  </Field>
                )}
                <div className="row-actions">
                  <button className="button secondary small" disabled={busy}>
                    {data.manual
                      ? "Atualizar concessão"
                      : "Conceder assinatura"}
                  </button>
                  {data.manual && (
                    <button
                      type="button"
                      className="table-action danger-text"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remover a concessão e revogar as chaves ligadas a ela?",
                          )
                        )
                          void run(() =>
                            api(
                              "/admin/manual-subscriptions/" +
                                data.manual.id +
                                "/revoke",
                              {},
                            ),
                          );
                      }}
                    >
                      Remover concessão
                    </button>
                  )}
                </div>
              </form>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    f = new FormData(form);
                  void run(async () => {
                    await api("/admin/credits", {
                      email: data.user.email,
                      credits: Number(f.get("credits")),
                      reason: String(f.get("reason")),
                    });
                    form.reset();
                  });
                }}
              >
                <h3>
                  Créditos · saldo{" "}
                  {Number(data.credits.balance).toLocaleString("pt-BR")}
                </h3>
                <Field label="Ajuste de créditos (negativo para remover)">
                  <input
                    name="credits"
                    type="number"
                    min={-100000}
                    max={100000}
                    step={1}
                    required
                  />
                </Field>
                <Field label="Motivo do ajuste">
                  <input name="reason" minLength={5} maxLength={200} required />
                </Field>
                <button className="button secondary small" disabled={busy}>
                  Aplicar ajuste de saldo
                </button>
              </form>
              <div>
                <h3>Remover acesso</h3>
                <p className="fine muted">
                  Revoga chaves e sessões, remove dados do cadastro e preserva o
                  histórico financeiro. Contratos Mercado Pago precisam ser
                  cancelados e conferidos antes.
                </p>
                <button
                  className="button danger small"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remover acesso, revogar chaves e anonimizar este cadastro?",
                      )
                    )
                      void run(() =>
                        api("/admin/users/" + row.id + "/remove", {}),
                      ).then((ok) => {
                        if (ok) setOpen(false);
                      });
                  }}
                >
                  Remover acesso do usuário
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
