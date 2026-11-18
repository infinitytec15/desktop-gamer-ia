import { UserManagement } from "./UserManagement";
import { PaymentSettings, RoutingSettings } from "./IntegrationSettings";
import {
  lazy,
  Suspense,
  useState,
  useEffect,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Printer,
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import {
  api,
  useData,
  navigate,
  money,
  number,
  date,
  Status,
  type Row,
  labels,
} from "./lib";
import { Brand, Link, Loading, Empty, Field, Modal } from "./ui";
import { Landing, Legal, Plans, Packages } from "./Landing";
const Printing = lazy(() => import("./Printing"));
type Session = {
  userId: string | null;
  role: "user" | "admin";
  email: string;
  name: string;
};
export default function App() {
  const [path, setPath] = useState(location.pathname),
    [session, setSession] = useState<Session | null | undefined>(undefined),
    [sessionError, setSessionError] = useState("");
  const catalog = useData<Row>("/public");
  async function sync() {
    try {
      setSession((await api("/me")).user);
      setSessionError("");
    } catch (e) {
      setSessionError((e as Error).message);
    }
  }
  useEffect(() => {
    void sync();
    const onPop = () => {
      setPath(location.pathname);
      catalog.reload();
    };
    const focus = () => {
      catalog.reload();
      void sync();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("focus", focus);
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) catalog.reload();
    }, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    document.title = path.startsWith("/admin")
      ? "Administração · GameForge AI"
      : path.startsWith("/app")
        ? "Minha conta · GameForge AI"
        : "GameForge AI — Seu setup sob controle";
  }, [path]);
  if (path === "/impressao-3d")
    return (
      <Suspense fallback={<Loading />}>
        <Printing standalone />
      </Suspense>
    );
  if (path === "/")
    return <Landing catalog={catalog.data} error={catalog.error} />;
  if (path === "/termos" || path === "/privacidade")
    return <Legal privacy={path === "/privacidade"} />;
  if (["/login", "/cadastro", "/admin/login"].includes(path))
    return <Auth path={path} sync={sync} />;
  if (path.startsWith("/app") || path.startsWith("/admin")) {
    if (sessionError)
      return (
        <div className="standalone">
          <Brand />
          <p className="alert error">{sessionError}</p>
          <button className="button primary" onClick={() => void sync()}>
            Tentar novamente
          </button>
        </div>
      );
    if (session === undefined) return <Loading />;
    const admin = path.startsWith("/admin");
    if (!session || session.role !== (admin ? "admin" : "user"))
      return <Auth path={admin ? "/admin/login" : "/login"} sync={sync} />;
    return (
      <Dashboard
        path={path}
        session={session}
        catalog={catalog.data}
        refreshCatalog={catalog.reload}
        onLogout={async () => {
          await api("/auth/logout", {});
          await sync();
          navigate("/");
        }}
      />
    );
  }
  return (
    <div className="standalone">
      <Brand />
      <h1>Página não encontrada.</h1>
      <Link to="/" className="button primary">
        Voltar ao início
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}
function Auth({ path, sync }: { path: string; sync: () => Promise<void> }) {
  const register = path === "/cadastro",
    admin = path === "/admin/login";
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        "/auth/" + (admin ? "admin" : register ? "register" : "login"),
        Object.fromEntries(form),
      );
      await sync();
      navigate(admin ? "/admin" : register ? "/app/planos" : "/app");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div>
          <div className="auth-emblem">
            <Zap size={66} fill="currentColor" />
          </div>
          <h2>
            Seu setup.
            <br />
            Sua próxima
            <br />
            grande partida.
          </h2>
          <p>
            Uma visão clara do computador.
            <br />
            Um plano para o que vem a seguir.
          </p>
        </div>
        <span>Inteligência que respeita o seu controle.</span>
      </aside>
      <main className="auth-main">
        <Link to="/" className="auth-back">
          Voltar ao site
          <ArrowUpRight size={15} />
        </Link>
        <div className="auth-form">
          <div className="mobile-brand">
            <Brand />
          </div>
          <h1>
            {admin
              ? "Administração"
              : register
                ? "Entre no próximo nível."
                : "Bom ter você de volta."}
          </h1>
          <p>
            {admin
              ? "Acesse com as credenciais configuradas no servidor."
              : register
                ? "Crie sua conta para escolher um plano e ativar seu PC."
                : "Entre para gerenciar sua assinatura, créditos e dispositivos."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <Field label="Seu nome">
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </Field>
            )}
            <Field label="E-mail">
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </Field>
            <Field
              label="Senha"
              hint={register ? "Use pelo menos 12 caracteres." : undefined}
            >
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={12}
                maxLength={200}
                required
              />
            </Field>
            {error && (
              <p role="alert" className="alert error">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "Entrando…" : register ? "Criar minha conta" : "Entrar"}
              <ArrowRight size={18} />
            </button>
          </form>
          {!admin && (
            <p className="auth-switch">
              {register ? "Já tem uma conta? " : "Ainda não tem conta? "}
              <Link to={register ? "/login" : "/cadastro"}>
                {register ? "Entrar" : "Criar conta"}
              </Link>
            </p>
          )}
          {register && (
            <small className="muted">
              Ao criar sua conta, você declara ter lido os{" "}
              <Link to="/termos">termos</Link> e a{" "}
              <Link to="/privacidade">política de privacidade</Link>.
            </small>
          )}
        </div>
      </main>
    </div>
  );
}
const userNav = [
  ["", "Visão geral", LayoutDashboard],
  ["impressao-3d", "Impressão 3D", Printer],
  ["planos", "Planos", Sparkles],
  ["assinatura", "Assinatura", CreditCard],
  ["chaves", "Chaves e dispositivos", KeyRound],
  ["creditos", "Créditos de IA", Wallet],
  ["download", "Baixar aplicativo", Download],
  ["configuracoes", "Minha conta", Settings],
] as const;
const adminNav = [
  ["", "Dashboard", LayoutDashboard],
  ["usuarios", "Usuários", Users],
  ["assinaturas", "Assinaturas", CreditCard],
  ["chaves", "Licenças", KeyRound],
  ["planos", "Planos e preços", Sparkles],
  ["creditos", "Créditos e margem", Wallet],
  ["eventos", "Eventos de pagamento", Activity],
  ["configuracoes", "Integrações", Settings],
] as const;
type Dialog = { title: string; body: ReactNode };
function Dashboard({
  path,
  session,
  catalog,
  refreshCatalog,
  onLogout,
}: {
  path: string;
  session: Session;
  catalog: Row | null;
  refreshCatalog: () => void;
  onLogout: () => Promise<void>;
}) {
  const admin = session.role === "admin",
    base = admin ? "/admin" : "/app",
    page = path.replace(base, "").split("/")[1] || "";
  const [menu, setMenu] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dialog, setDialog] = useState<Dialog | null>(null);
  const user = useData<Row>(admin ? "/me" : "/account");
  const nav = admin ? adminNav : userNav;
  const title = nav.find((n) => n[0] === page)?.[1] || "Visão geral";
  useEffect(() => {
    setMenu(false);
    setError("");
    setNotice("");
    if (!admin) user.reload();
  }, [path]);
  async function act(
    work: () => Promise<unknown>,
    message = "Alteração salva",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      window.dispatchEvent(new Event("data-updated"));
      if (message) setNotice(message);
      refreshCatalog();
      if (!admin) user.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function confirm(
    title: string,
    description: string,
    work: () => Promise<unknown>,
    button = "Confirmar",
  ) {
    setDialog({
      title,
      body: (
        <>
          <p>{description}</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDialog(null)}
            >
              Voltar
            </button>
            <button
              className="button danger"
              onClick={() => {
                setDialog(null);
                void act(work);
              }}
            >
              {button}
            </button>
          </div>
        </>
      ),
    });
  }
  async function reveal(work: () => Promise<Row>) {
    const result = await work();
    setDialog({
      title: "Guarde sua chave agora",
      body: (
        <>
          <p>
            Ela será exibida uma única vez. Cole no GameForge instalado no
            computador e guarde em um local seguro.
          </p>
          <Secret value={result.key} />
          <p className="fine muted">ID da licença: {result.id}</p>
          <button
            className="button primary full"
            onClick={() => setDialog(null)}
          >
            Já guardei minha chave
            <Check size={17} />
          </button>
        </>
      ),
    });
  }
  const ctx = {
    admin,
    page,
    catalog,
    busy,
    act,
    confirm,
    setDialog,
    reveal,
    refreshCatalog,
  };
  return (
    <div className="dashboard">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Brand />
        <span className="workspace-label">
          {admin ? "ADMINISTRAÇÃO" : "MINHA CONTA"}
        </span>
        <nav aria-label={admin ? "Administração" : "Minha conta"}>
          {nav.map(([id, label, Icon]) => (
            <Link
              to={base + (id ? "/" + id : "")}
              className={page === id ? "selected" : ""}
              key={id}
            >
              <Icon size={18} />
              {label}
              {page === id && <ChevronRight size={14} />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="account-avatar">
            {session.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{session.name}</strong>
            <span>{session.email}</span>
          </div>
          <button
            aria-label="Sair"
            className="icon-button"
            onClick={() => void act(onLogout, "")}
            disabled={busy}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <button
              className="icon-button menu-toggle"
              aria-label="Abrir menu"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span>{admin ? "Administração" : "Minha conta"}</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <Link to="/" className="text-link">
            Ver site
            <ArrowUpRight size={16} />
          </Link>
        </header>
        <main className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>
                {page === "" && !admin
                  ? `Seu próximo play, ${session.name.split(" ")[0]}.`
                  : title}
              </h1>
              <p>
                {admin
                  ? "Acompanhe a operação e gerencie o acesso ao GameForge."
                  : "Seu plano, seu saldo e seus computadores em um só lugar."}
              </p>
            </div>
            <span className="connection-dot">
              <i />
              GameForge Cloud
            </span>
          </div>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="alert success" role="status">
              <CheckCheck size={17} />
              {notice}
            </p>
          )}
          {admin ? (
            <AdminSurface key={page} {...ctx} />
          ) : user.loading && !user.data ? (
            <Loading />
          ) : user.error ? (
            <div className="alert error">
              {user.error}
              <button onClick={user.reload} className="button secondary small">
                Tentar novamente
              </button>
            </div>
          ) : user.data ? (
            <UserContent {...ctx} data={user.data} />
          ) : null}
        </main>
        <footer className="dashboard-footer">
          GameForge AI <span>Seu setup sob controle.</span>
        </footer>
      </div>
      {dialog && (
        <Modal title={dialog.title} onClose={() => setDialog(null)}>
          {dialog.body}
        </Modal>
      )}
      <div className="busy-indicator" role="status" hidden={!busy}>
        Processando solicitação…
      </div>
    </div>
  );
}
type Context = {
  admin: boolean;
  page: string;
  catalog: Row | null;
  busy: boolean;
  act: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
  confirm: (
    title: string,
    description: string,
    fn: () => Promise<unknown>,
    button?: string,
  ) => void;
  setDialog: (v: Dialog | null) => void;
  reveal: (fn: () => Promise<Row>) => Promise<void>;
  refreshCatalog: () => void;
};
function Secret({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="secret">
      <code>{value}</code>
      <button
        className="icon-button"
        aria-label="Copiar chave"
        onClick={() =>
          void navigator.clipboard
            .writeText(value)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        {copied ? <Check size={18} /> : <Copy size={18} />}
      </button>
    </div>
  );
}
function Stat({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className="stat">
      <div>
        <span>{title}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Table({
  columns,
  rows,
  empty = "Nenhum registro por aqui ainda.",
}: {
  columns: { label: string; render: (r: Row) => ReactNode }[];
  rows: Row[];
  empty?: string;
}) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || r.provider_id || i}>
              {columns.map((c) => (
                <td key={c.label}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function UserContent(c: Context & { data: Row }) {
  const { data, page, catalog, act, busy, confirm, reveal } = c;
  const checkout = (planId: string) =>
    void act(async () => {
      const result = await api("/account/checkout", { planId });
      location.assign(result.url);
    }, "");
  const topup = (packageId: string) =>
    void act(async () => {
      const result = await api("/account/topups", { packageId });
      location.assign(result.url);
    }, "");
  const activeKeys = data.licenses.filter((r: Row) => !r.revoked_at);
  const balance = data.credits.balance;
  if (page === "impressao-3d")
    return (
      <Suspense fallback={<Loading />}>
        <Printing />
      </Suspense>
    );
  if (page === "planos")
    return (
      <>
        <div className="info-banner">
          <ShieldCheck />
          <p>
            Escolha pelo número de computadores e pelo saldo incluído. Cada
            análise consome créditos conforme os tokens utilizados.
          </p>
        </div>
        {catalog ? (
          <Plans
            catalog={catalog}
            onSelect={checkout}
            busy={busy || !catalog.billing_enabled}
          />
        ) : (
          <Loading />
        )}
        {!catalog?.billing_enabled && (
          <p className="alert">
            As vendas serão liberadas após a configuração do Mercado Pago pelo
            operador.
          </p>
        )}
        <p className="muted fine">
          O catálogo é atualizado pelo administrador. Assinaturas existentes
          preservam o preço e os créditos contratados; mudanças de plano exigem
          cancelar a renovação atual e contratar outro após o encerramento. Você
          não é cobrado ao apenas visualizar esta página.
        </p>
      </>
    );
  if (page === "download")
    return (
      <Section
        title="Instale. Ative. Prepare seu setup."
        description="Aplicativo nativo para Windows 10/11 x64."
      >
        <div className="download-content">
          <div className="download-visual">
            <Monitor size={70} strokeWidth={1} />
            <span className="brand-mark">
              <Zap size={28} fill="currentColor" />
            </span>
          </div>
          <div>
            <h3>GameForge AI para Windows</h3>
            <p>
              O instalador inclui o aplicativo, ícone e assistente inicial.
              Depois de instalar, abra Configurações → Licença e cole sua chave.
            </p>
            <p className="fine muted">
              A instalação solicita permissão de administrador. Esta beta ainda
              não tem assinatura Authenticode comercial; o Windows pode exibir
              alerta de editor desconhecido. UAC e SmartScreen são proteções
              diferentes.
            </p>
            <ol className="download-steps">
              <li>
                Confirme seu plano ou receba uma licença do administrador.
              </li>
              <li>Gere e guarde a chave na página Chaves e dispositivos.</li>
              <li>Instale e ative o computador com conexão à internet.</li>
            </ol>
            {catalog?.download_available ? (
              <a
                className="button primary"
                href={catalog.download_url}
                download
              >
                Baixar instalador
                <Download size={18} />
              </a>
            ) : (
              <p className="alert">
                O instalador desta versão ainda não foi publicado pelo operador.
              </p>
            )}
            <p className="fine muted">
              Diagnóstico e restauração são locais. A IA exige conexão.
              Temperaturas dependem dos sensores disponíveis.
            </p>
          </div>
        </div>
      </Section>
    );
  if (page === "chaves")
    return (
      <>
        <Section
          title="Suas chaves"
          description="A chave completa aparece apenas quando você a cria. O painel guarda somente o identificador."
          action={
            <button
              className="button primary small"
              disabled={
                busy ||
                !data.plan ||
                activeKeys.some((r: Row) => r.source === "subscription")
              }
              onClick={() =>
                void act(
                  () => reveal(() => api("/account/licenses", {})),
                  "Chave criada",
                )
              }
            >
              <Plus size={16} />
              Gerar minha chave
            </button>
          }
        >
          {!data.plan && (
            <p className="inline-notice">
              Confirme uma assinatura para gerar sua chave. Licenças manuais do
              administrador também aparecem aqui.
            </p>
          )}
          <Table
            rows={data.licenses}
            columns={[
              {
                label: "Identificador",
                render: (r) => <code>{r.key_prefix}••••</code>,
              },
              { label: "Plano", render: (r) => r.plan_name },
              {
                label: "Origem",
                render: (r) =>
                  r.source === "manual" ? "Administração" : "Assinatura",
              },
              {
                label: "Status",
                render: (r) =>
                  r.revoked_at ? (
                    <Status value="blocked" />
                  ) : r.expires_at && new Date(r.expires_at) < new Date() ? (
                    <span>Vencida</span>
                  ) : (
                    <span>Emitida</span>
                  ),
              },
              {
                label: "Ações",
                render: (r) =>
                  !r.revoked_at && (
                    <button
                      className="table-action danger-text"
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "Revogar esta chave?",
                          "Os dispositivos vinculados perderão acesso na próxima validação, em até 24 horas offline. Você poderá gerar outra chave da assinatura.",
                          () =>
                            api("/account/licenses/" + r.id + "/revoke", {}),
                          "Revogar chave",
                        )
                      }
                    >
                      Revogar
                    </button>
                  ),
              },
            ]}
          />
        </Section>
        <Section
          title="Computadores vinculados"
          description="Revogar um dispositivo libera a vaga. A revogação online é imediata; o cache offline dura até 24 horas."
        >
          <Table
            rows={data.devices}
            columns={[
              {
                label: "Computador",
                render: (r) => (
                  <div className="cell-title">
                    <Monitor size={17} />
                    {r.name}
                  </div>
                ),
              },
              { label: "Sistema", render: (r) => r.platform },
              { label: "Última validação", render: (r) => date(r.last_seen) },
              {
                label: "Status",
                render: (r) => (
                  <Status value={r.revoked_at ? "blocked" : "active"} />
                ),
              },
              {
                label: "Ações",
                render: (r) =>
                  !r.revoked_at && (
                    <button
                      className="table-action"
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "Revogar computador?",
                          "Para reativar este mesmo computador, será necessário gerar outra chave. Outros computadores podem ocupar a vaga liberada.",
                          () => api("/account/devices/" + r.id + "/revoke", {}),
                          "Revogar dispositivo",
                        )
                      }
                    >
                      Revogar
                    </button>
                  ),
              },
            ]}
          />
        </Section>
      </>
    );
  if (page === "creditos")
    return (
      <>
        <div className="stats-grid two">
          <Stat
            title="Seu saldo de IA"
            value={number(balance)}
            detail="Créditos disponíveis, incluindo reservas em andamento"
            icon={<Wallet size={18} />}
          />
          <Stat
            title="Como o consumo é calculado"
            value="Uso real"
            detail="1 crédito = US$ 0,001 de tokens Standard"
            icon={<Sparkles size={18} />}
          />
        </div>
        <Section
          title="Recarregue no seu ritmo"
          description="Pagamento único. Descontos progressivos por volume. A recarga não estende a validade da licença."
        >
          {catalog ? (
            <Packages
              catalog={catalog}
              onSelect={topup}
              busy={busy || !catalog.billing_enabled}
            />
          ) : (
            <Loading />
          )}
        </Section>
        <Section
          title="Extrato de créditos"
          description="Reservas retiram temporariamente o teto da análise. O acerto devolve o que não foi consumido."
        >
          <Table
            rows={data.credits.ledger}
            columns={[
              { label: "Data", render: (r) => date(r.created_at) },
              {
                label: "Movimento",
                render: (r) => labels[r.reason] || r.reason,
              },
              {
                label: "Créditos",
                render: (r) => (
                  <span className={r.delta > 0 ? "positive-text" : ""}>
                    {r.delta > 0 ? "+" : ""}
                    {number(r.delta)}
                  </span>
                ),
              },
              {
                label: "Referência",
                render: (r) => (
                  <span className="truncate" title={r.reference}>
                    {r.reference}
                  </span>
                ),
              },
            ]}
          />
        </Section>
        <Section title="Suas recargas">
          <Table
            rows={data.orders}
            columns={[
              { label: "Data", render: (r) => date(r.created_at) },
              { label: "Créditos", render: (r) => number(r.credits) },
              { label: "Valor", render: (r) => money(r.amount_cents) },
              { label: "Status", render: (r) => <Status value={r.status} /> },
              {
                label: "Ações",
                render: (r) =>
                  r.status === "pending" &&
                  r.checkout_url && (
                    <a className="table-action" href={r.checkout_url}>
                      Abrir pagamento
                      <ExternalLink size={13} />
                    </a>
                  ),
              },
            ]}
          />
        </Section>
      </>
    );
  if (page === "configuracoes")
    return (
      <Section
        title="Sua senha"
        description="Ao alterar a senha, as outras sessões do site serão encerradas."
      >
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const form = e.currentTarget;
            void act(async () => {
              await api("/account/password", Object.fromEntries(f));
              form.reset();
            }, "Senha atualizada");
          }}
        >
          <Field label="Senha atual">
            <input
              type="password"
              name="current"
              autoComplete="current-password"
              required
              maxLength={200}
            />
          </Field>
          <Field label="Nova senha" hint="Pelo menos 12 caracteres.">
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={200}
            />
          </Field>
          <button className="button primary" disabled={busy}>
            Atualizar senha
            <Check size={16} />
          </button>
        </form>
      </Section>
    );
  if (page === "assinatura")
    return (
      <>
        <Section
          title="Suas assinaturas"
          description="O retorno do checkout não libera o acesso. Aguarde o pagamento confirmado pelo Mercado Pago."
        >
          <Table
            rows={data.subscriptions}
            columns={[
              { label: "Plano", render: (r) => <strong>{r.plan_name}</strong> },
              {
                label: "Contrato",
                render: (r) => (
                  <>
                    {money(r.amount_cents)}/
                    {r.interval_months === 12 ? "ano" : "mês"}
                    <small>{number(r.credits)} créditos/ciclo</small>
                  </>
                ),
              },
              { label: "Status", render: (r) => <Status value={r.status} /> },
              { label: "Pago até", render: (r) => date(r.paid_until) },
              {
                label: "Ações",
                render: (r) => (
                  <div className="row-actions">
                    {r.status === "pending" && r.checkout_url && (
                      <a href={r.checkout_url} className="table-action">
                        Pagar
                        <ExternalLink size={12} />
                      </a>
                    )}
                    {r.provider_id && (
                      <button
                        className="table-action"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () =>
                              api(
                                "/account/subscriptions/" + r.id + "/sync",
                                {},
                              ),
                            "Status consultado no gateway",
                          )
                        }
                      >
                        Atualizar
                      </button>
                    )}
                    {r.provider_id &&
                      !["cancelled", "canceled"].includes(r.status) && (
                        <button
                          className="table-action danger-text"
                          disabled={busy}
                          onClick={() =>
                            confirm(
                              "Cancelar a renovação?",
                              "O Mercado Pago encerrará as próximas cobranças. Seu acesso permanece até o fim do período pago.",
                              () =>
                                api(
                                  "/account/subscriptions/" + r.id + "/cancel",
                                  {},
                                ),
                              "Cancelar renovação",
                            )
                          }
                        >
                          Cancelar
                        </button>
                      )}
                  </div>
                ),
              },
            ]}
          />
        </Section>
        <Section title="Pagamentos">
          <Table
            rows={data.payments}
            columns={[
              {
                label: "ID Mercado Pago",
                render: (r) => <code>{r.provider_id}</code>,
              },
              { label: "Pagamento", render: (r) => date(r.paid_at) },
              { label: "Valor", render: (r) => money(r.amount_cents) },
              { label: "Status", render: (r) => <Status value={r.status} /> },
              { label: "Período até", render: (r) => date(r.period_end) },
            ]}
          />
        </Section>
      </>
    );
  return (
    <>
      <div className="stats-grid">
        <Stat
          title="Seu plano"
          value={data.plan?.plan_name || "Comece aqui"}
          detail={
            data.plan
              ? "Pagamento confirmado"
              : "Escolha um plano para ativar seu PC"
          }
          icon={<Sparkles size={18} />}
        />
        <Stat
          title="Créditos de IA"
          value={number(balance)}
          detail="Saldo após reservas de análises"
          icon={<Wallet size={18} />}
        />
        <Stat
          title="Computadores"
          value={data.devices.filter((r: Row) => !r.revoked_at).length}
          detail="Dispositivos com vínculo ativo"
          icon={<Monitor size={18} />}
        />
      </div>
      <div className="onboarding-panel">
        <div className="onboarding-art">
          <Zap size={56} fill="currentColor" />
        </div>
        <div>
          <h2>Seu setup começa com três passos.</h2>
          <p>
            Escolha um plano, gere sua chave e ative o aplicativo no computador.
          </p>
          <div className="getting-started">
            <Link to="/app/planos">
              <span className={data.plan ? "complete" : ""}>
                {data.plan ? <Check size={14} /> : 1}
              </span>
              Escolher plano
              <ChevronRight size={15} />
            </Link>
            <Link to="/app/chaves">
              <span className={activeKeys.length ? "complete" : ""}>
                {activeKeys.length ? <Check size={14} /> : 2}
              </span>
              Gerar chave
              <ChevronRight size={15} />
            </Link>
            <Link to="/app/download">
              <span>3</span>Baixar aplicativo
              <ChevronRight size={15} />
            </Link>
          </div>
        </div>
      </div>
      <div className="dashboard-pair">
        <Section title="Você decide o que muda">
          <div className="feature-note">
            <ShieldCheck />
            <p>
              A IA propõe um plano de ações conhecidas. Você revisa cada mudança
              antes de aplicar. O histórico mantém a opção de desfazer.
            </p>
          </div>
        </Section>
        <Section title="Tudo no lugar">
          <div className="quick-links">
            <Link to="/app/assinatura">
              Assinatura e pagamentos
              <ArrowUpRight size={17} />
            </Link>
            <Link to="/app/creditos">
              Saldo e recargas de IA
              <ArrowUpRight size={17} />
            </Link>
            <Link to="/app/chaves">
              Chaves e computadores
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </Section>
      </div>
    </>
  );
}
function AdminSurface(c: Context) {
  const [query, setQuery] = useState(""),
    [term, setTerm] = useState(""),
    [offset, setOffset] = useState(0),
    [count, setCount] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(query);
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);
  const paginated = ["usuarios", "assinaturas", "chaves", "eventos"].includes(
    c.page,
  );
  return (
    <>
      {paginated && (
        <div className="list-controls">
          <div className="search">
            <Search size={16} />
            <input
              aria-label="Buscar registros"
              placeholder="Buscar por conta, ID ou estado"
              value={query}
              maxLength={120}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="row-actions">
            <button
              className="button secondary small"
              disabled={!offset}
              onClick={() => setOffset((v) => Math.max(0, v - 50))}
            >
              Anterior
            </button>
            <span className="fine muted">
              Página {Math.floor(offset / 50) + 1}
            </span>
            <button
              className="button secondary small"
              disabled={count < 50}
              onClick={() => setOffset((v) => v + 50)}
            >
              Próxima
            </button>
          </div>
        </div>
      )}
      <AdminContent
        {...c}
        listQuery={
          paginated
            ? "?q=" + encodeURIComponent(term) + "&offset=" + offset
            : ""
        }
        onCount={setCount}
      />
    </>
  );
}
function AdminContent(
  c: Context & { listQuery?: string; onCount?: (n: number) => void },
) {
  const { page } = c;
  const paths: Record<string, string> = {
    "": "/admin/dashboard",
    usuarios: "/admin/users",
    assinaturas: "/admin/subscriptions",
    chaves: "/admin/licenses",
    planos: "/admin/plans",
    creditos: "/admin/commercial",
    eventos: "/admin/events",
    configuracoes: "/admin/config",
  };
  const r = useData<any>((paths[page] || paths[""]) + (c.listQuery || ""));
  useEffect(() => {
    if (Array.isArray(r.data)) c.onCount?.(r.data.length);
  }, [r.data, c.onCount]);
  const { act, busy, confirm, setDialog, reveal } = c;
  const mutate = (fn: () => Promise<unknown>, message?: string) =>
    act(async () => {
      await fn();
      r.reload();
    }, message);
  if (r.loading && !r.data) return <Loading />;
  if (r.error)
    return (
      <p className="alert error">
        {r.error}
        <button className="button secondary small" onClick={r.reload}>
          Tentar novamente
        </button>
      </p>
    );
  const data = r.data;
  if (!data) return null;
  function editPlan(row: Row, pack = false) {
    setDialog({
      title: pack ? "Editar pacote" : "Editar plano",
      body: (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const values = {
              name: String(f.get("name")),
              price_cents: Math.round(Number(f.get("price")) * 100),
              credits: Number(f.get("credits")),
              active: f.get("active") === "on",
              ...(!pack ? { max_devices: Number(f.get("devices")) } : {}),
            };
            setDialog(null);
            void mutate(() =>
              api("/admin/" + (pack ? "packages/" : "plans/") + row.id, values),
            );
          }}
        >
          <Field label="Nome">
            <input
              name="name"
              defaultValue={row.name}
              required
              maxLength={40}
            />
          </Field>
          <div className="form-grid">
            <Field label="Preço em reais">
              <input
                name="price"
                type="number"
                min={1}
                step="0.01"
                defaultValue={row.price_cents / 100}
                required
              />
            </Field>
            <Field label="Créditos incluídos">
              <input
                name="credits"
                type="number"
                min={1}
                max={1000000}
                step={1}
                defaultValue={row.credits}
                required
              />
            </Field>
          </div>
          {!pack && (
            <Field label="Computadores">
              <input
                name="devices"
                type="number"
                min={1}
                max={20}
                defaultValue={row.max_devices}
                required
              />
            </Field>
          )}
          <label className="check-field">
            <input name="active" type="checkbox" defaultChecked={row.active} />
            Disponível para novas compras
          </label>
          <p className="fine muted">
            A mudança aparece no site e na página de planos dos usuários.
            Contratos em andamento preservam preço e créditos. O servidor
            bloqueia preços abaixo da margem mínima.
          </p>
          <button className="button primary full">
            Salvar alterações
            <Check size={16} />
          </button>
        </form>
      ),
    });
  }
  if (page === "usuarios") {
    const rows = data;
    return (
      <Section
        title="Contas cadastradas"
        description="Busca em todas as contas, com 50 resultados por página. Bloquear suspende as licenças online."
      >
        <Table
          rows={rows}
          columns={[
            {
              label: "Usuário",
              render: (r) => (
                <>
                  <strong>{r.name}</strong>
                  <small>{r.email}</small>
                </>
              ),
            },
            { label: "Cadastro", render: (r) => date(r.created_at) },
            { label: "Chaves", render: (r) => r.licenses },
            { label: "Status", render: (r) => <Status value={r.status} /> },
            {
              label: "Ações",
              render: (r) => (
                <div className="row-actions">
                  <UserManagement
                    row={r}
                    onChanged={() => void mutate(async () => {})}
                  />
                  <button
                    className="table-action"
                    disabled={busy || r.status === "deleted"}
                    onClick={() =>
                      confirm(
                        r.status === "active"
                          ? "Bloquear usuário?"
                          : "Reativar usuário?",
                        r.email,
                        () =>
                          api("/admin/users/" + r.id + "/status", {
                            status:
                              r.status === "active" ? "blocked" : "active",
                          })
                            .then(() => r.reload?.())
                            .then(() => {
                              c.refreshCatalog();
                              navigate("/admin/usuarios");
                            }),
                        r.status === "active" ? "Bloquear" : "Reativar",
                      )
                    }
                  >
                    {r.status === "active" ? "Bloquear" : "Reativar"}
                  </button>
                </div>
              ),
            },
          ]}
        />
      </Section>
    );
  }
  if (page === "planos")
    return (
      <>
        <Section
          title="Catálogo de assinaturas"
          description="Os três planos são servidos diretamente pelo banco para o site e o painel do usuário."
        >
          <Table
            rows={data}
            columns={[
              { label: "Plano", render: (r) => <strong>{r.name}</strong> },
              {
                label: "Preço",
                render: (r) => (
                  <>
                    {money(r.price_cents)}/
                    {r.interval_months === 12 ? "ano" : "mês"}
                  </>
                ),
              },
              { label: "Créditos/ciclo", render: (r) => number(r.credits) },
              { label: "Computadores", render: (r) => r.max_devices },
              {
                label: "Catálogo",
                render: (r) => (
                  <Status value={r.active ? "active" : "paused"} />
                ),
              },
              {
                label: "Ações",
                render: (r) => (
                  <button className="table-action" onClick={() => editPlan(r)}>
                    Editar plano
                  </button>
                ),
              },
            ]}
          />
        </Section>
        <div className="info-banner">
          <CreditCard />
          <p>
            A edição vale para novas contratações. Preço e saldo contratados são
            registrados na assinatura, evitando alterações silenciosas em
            cobranças existentes.
          </p>
        </div>
      </>
    );
  if (page === "chaves")
    return (
      <Section
        title="Gestão de licenças"
        description="Licenças manuais independem de assinatura e exigem validade definida."
        action={
          <button
            className="button primary small"
            onClick={() =>
              setDialog({
                title: "Criar licença manual",
                body: (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      setDialog(null);
                      void mutate(
                        () =>
                          reveal(() =>
                            api("/admin/licenses", {
                              ...(f.get("email")
                                ? { email: f.get("email") }
                                : {}),
                              planId: f.get("planId"),
                              days: Number(f.get("days")),
                            }),
                          ),
                        "Licença criada",
                      );
                    }}
                  >
                    <Field
                      label="E-mail da conta (opcional)"
                      hint="Sem e-mail, a licença terá carteira própria. Use o ID para conceder créditos."
                    >
                      <input type="email" name="email" />
                    </Field>
                    <Field label="Plano">
                      <select name="planId">
                        {c.catalog?.plans.map((p: Row) => (
                          <option value={p.id} key={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Validade em dias">
                      <input
                        type="number"
                        name="days"
                        min={1}
                        max={366}
                        defaultValue={30}
                        required
                      />
                    </Field>
                    <p className="fine muted">
                      Criar a licença não concede créditos automaticamente.
                      Ajuste o saldo em Créditos e margem quando necessário.
                    </p>
                    <button className="button primary full">
                      Criar e revelar chave
                      <KeyRound size={16} />
                    </button>
                  </form>
                ),
              })
            }
          >
            <Plus size={16} />
            Criar licença
          </button>
        }
      >
        <Table
          rows={data}
          columns={[
            {
              label: "Chave",
              render: (r) => (
                <>
                  <code>{r.key_prefix}••••</code>
                  <small className="truncate" title={r.id}>
                    {r.id}
                  </small>
                </>
              ),
            },
            { label: "Conta", render: (r) => r.email || "Licença avulsa" },
            { label: "Plano", render: (r) => r.plan_name },
            {
              label: "Origem / validade",
              render: (r) => (
                <>
                  {r.source === "manual" ? "Manual" : "Assinatura"}
                  <small>{date(r.expires_at)}</small>
                </>
              ),
            },
            { label: "Dispositivos", render: (r) => r.devices },
            {
              label: "Estado",
              render: (r) => (r.revoked_at ? "Revogada" : "Emitida"),
            },
            {
              label: "Ações",
              render: (r) =>
                !r.revoked_at && (
                  <button
                    className="table-action danger-text"
                    disabled={busy}
                    onClick={() =>
                      confirm(
                        "Revogar licença?",
                        "O acesso online será encerrado. O cache offline pode durar até 24 horas.",
                        () =>
                          api("/admin/licenses/" + r.id + "/revoke", {}).then(
                            () => navigate("/admin/chaves"),
                          ),
                        "Revogar",
                      )
                    }
                  >
                    Revogar
                  </button>
                ),
            },
          ]}
        />
      </Section>
    );
  if (page === "assinaturas")
    return (
      <Section
        title="Assinaturas do Mercado Pago"
        description="Estado do contrato e período pago são independentes. Autorização do contrato não comprova pagamento."
      >
        <Table
          rows={data}
          columns={[
            { label: "Conta", render: (r) => r.email },
            {
              label: "Plano",
              render: (r) => (
                <>
                  {r.plan_name}
                  <small>
                    {money(r.amount_cents)} · {number(r.credits)} créditos
                  </small>
                </>
              ),
            },
            {
              label: "Gateway",
              render: (r) => (
                <code>{r.provider_id || "Criação inconclusiva"}</code>
              ),
            },
            { label: "Status", render: (r) => <Status value={r.status} /> },
            { label: "Pago até", render: (r) => date(r.paid_until) },
            {
              label: "Ações",
              render: (row) =>
                row.provider_id ? (
                  <div className="row-actions">
                    <button
                      className="table-action"
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          () =>
                            api("/admin/subscriptions/" + row.id + "/sync", {}),
                          "Assinatura consultada no gateway",
                        )
                      }
                    >
                      Sincronizar
                      <RefreshCw size={12} />
                    </button>
                    {!["cancelled", "canceled"].includes(row.status) && (
                      <button
                        className="table-action danger-text"
                        disabled={busy}
                        onClick={() =>
                          confirm(
                            "Cancelar renovações?",
                            "O contrato será cancelado no Mercado Pago. O período pago é preservado; não há reembolso automático.",
                            () =>
                              api(
                                "/admin/subscriptions/" + row.id + "/cancel",
                                {},
                              ).then(() => r.reload()),
                            "Cancelar renovações",
                          )
                        }
                      >
                        Cancelar renovações
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    className="table-action"
                    onClick={() =>
                      setDialog({
                        title: "Vincular criação inconclusiva",
                        body: (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const providerId = new FormData(
                                e.currentTarget,
                              ).get("providerId");
                              setDialog(null);
                              void mutate(() =>
                                api(
                                  "/admin/subscriptions/" + row.id + "/link",
                                  { providerId },
                                ),
                              );
                            }}
                          >
                            <p>
                              Localize o contrato no Mercado Pago e confira a
                              referência externa: <code>{row.id}</code>. O
                              servidor consultará o contrato antes de vincular.
                            </p>
                            <Field label="ID do contrato no Mercado Pago">
                              <input
                                name="providerId"
                                required
                                maxLength={80}
                              />
                            </Field>
                            <button className="button primary">
                              Verificar e vincular
                            </button>
                          </form>
                        ),
                      })
                    }
                  >
                    Reconciliar
                  </button>
                ),
            },
          ]}
        />
      </Section>
    );
  if (page === "eventos")
    return (
      <Section
        title="Fila de notificações"
        description="Eventos são persistidos antes da confirmação e processados por workers com bloqueio transacional."
      >
        <Table
          rows={data}
          columns={[
            {
              label: "Evento",
              render: (r) => (
                <>
                  {r.topic}
                  <small>Recurso {r.resource_id}</small>
                </>
              ),
            },
            { label: "Recebido", render: (r) => date(r.created_at) },
            { label: "Estado", render: (r) => <Status value={r.status} /> },
            { label: "Tentativas", render: (r) => r.attempts },
            { label: "Detalhes", render: (r) => r.last_error || "—" },
            {
              label: "Ações",
              render: (r) =>
                ["failed", "retry"].includes(r.status) && (
                  <button
                    className="table-action"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        () => api("/admin/events/" + r.id + "/retry", {}),
                        "Evento colocado na fila",
                      )
                    }
                  >
                    Reprocessar
                  </button>
                ),
            },
          ]}
        />
      </Section>
    );
  if (page === "creditos")
    return (
      <Commercial
        {...c}
        data={data}
        reload={r.reload}
        editPackage={(row) => editPlan(row, true)}
      />
    );
  if (page === "configuracoes")
    return (
      <>
        <Section
          title="Estado das integrações"
          description="Credenciais de pagamento e IA ficam no cofre do servidor. A assinatura Ed25519 permanece nas variáveis do Railway."
        >
          <div className="integration-grid">
            <div>
              <CreditCard />
              <strong>Mercado Pago</strong>
              <Status value={data.billing_enabled ? "active" : "paused"} />
              <p>
                Token: {data.mercadopago.token ? "definido" : "pendente"} ·
                Webhook: {data.mercadopago.webhook ? "definido" : "pendente"} ·
                Vendedor: {data.mercadopago.collector ? "definido" : "pendente"}
              </p>
              <small>
                Modo: {data.mercadopago.live_mode ? "produção" : "teste"}
              </small>
            </div>
            <div>
              <Download />
              <strong>Instalador desktop</strong>
              <Status value={data.download_url ? "active" : "paused"} />
              <p>
                {data.download_url ||
                  "Configure DESKTOP_DOWNLOAD_URL após publicar o instalador."}
              </p>
            </div>
          </div>
        </Section>
        <PaymentSettings data={data} mutate={mutate} busy={busy} />
        <RoutingSettings data={data} mutate={mutate} busy={busy} />
        <Section
          title="Chaves dos provedores de IA"
          description="Gravadas com AES-256-GCM no banco. Depois de salvar, teste o provedor: faz uma chamada real e usa saldo da API da plataforma, sem descontar uma carteira de cliente. Repita o teste ao trocar a chave ou o modelo."
        >
          <div className="provider-grid">
            {data.providers.map((p: Row) => (
              <form
                key={p.provider}
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    key = String(new FormData(form).get("key"));
                  void mutate(async () => {
                    await api("/admin/providers/" + p.provider, { key });
                    form.reset();
                  });
                }}
              >
                <h3>
                  {p.provider === "anthropic" ? "Anthropic Claude" : "OpenAI"}
                </h3>
                <p className="fine muted">
                  {data.models[p.provider]} ·{" "}
                  {p.stored
                    ? "Configurada no cofre"
                    : p.environment
                      ? "Configurada no ambiente"
                      : "Ainda não configurada"}
                </p>
                <Field label="Nova chave de API">
                  <input
                    type="password"
                    name="key"
                    autoComplete="off"
                    minLength={20}
                    maxLength={2400}
                    required
                    placeholder="Cole a chave do provedor"
                  />
                </Field>
                <div className="row-actions">
                  <button className="button secondary small" disabled={busy}>
                    Salvar chave
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={busy || !(p.stored || p.environment)}
                    onClick={() =>
                      void mutate(() =>
                        api("/admin/providers/" + p.provider + "/test", {}),
                      )
                    }
                  >
                    {busy ? "Aguarde…" : "Testar provedor (usa API)"}
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={busy || !p.configured}
                    onClick={() =>
                      void mutate(
                        () =>
                          api("/admin/providers/" + p.provider + "/models", {}),
                        "Modelos consultados no provedor",
                      )
                    }
                  >
                    Conferir modelos (sem IA)
                  </button>
                  {p.stored && (
                    <button
                      type="button"
                      className="table-action danger-text"
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "Remover chave do cofre?",
                          "A credencial de ambiente, se existir, voltará a ser usada.",
                          () =>
                            api(
                              "/admin/providers/" + p.provider,
                              undefined,
                              "DELETE",
                            ).then(() => navigate("/admin/configuracoes")),
                          "Remover",
                        )
                      }
                    >
                      Remover
                    </button>
                  )}
                </div>
                {p.model_check && (
                  <p className="fine muted">
                    Modelos do catálogo disponíveis:{" "}
                    {p.model_check.models.length
                      ? p.model_check.models.join(", ")
                      : "nenhum dos modelos do catálogo foi encontrado para esta conta"}
                    .
                  </p>
                )}
                {p.last_test && (
                  <div
                    role="status"
                    className={
                      "alert " + (p.last_test.success ? "success" : "error")
                    }
                  >
                    <strong>
                      {p.last_test.success
                        ? "Plano estruturado validado"
                        : "Falha na validação"}
                    </strong>
                    <p>
                      {p.last_test.model} ·{" "}
                      {new Date(p.last_test.tested_at).toLocaleString("pt-BR")}
                    </p>
                    {p.last_test.error && <p>{p.last_test.error}</p>}
                    <small>
                      {p.last_test.inconclusive
                        ? "Uso inconclusivo; teto conservador"
                        : "Consumo informado"}
                      : US$ {Number(p.last_test.estimated_usd).toFixed(5)} ·{" "}
                      {Number(p.last_test.billable_credits).toFixed(3)} créditos
                      equivalentes. Nenhum ajuste foi aplicado.{" "}
                      {p.last_test.duration_ms} ms.
                    </small>
                  </div>
                )}
              </form>
            ))}
          </div>
        </Section>
        <Section
          title="Confiança do desktop"
          description="Esses dados públicos precisam ser incorporados ao build do instalador."
        >
          <div className="settings-form">
            <Field label="GAMEFORGE_API_URL">
              <input readOnly value={data.app_url} />
            </Field>
            <Field label="GAMEFORGE_LICENSE_PUBLIC_KEY_B64">
              <input readOnly value={data.public_key} />
            </Field>
            <p className="fine muted">
              A chave privada nunca vai para o aplicativo. Rotacioná-la exige
              planejar a migração dos instaladores.
            </p>
          </div>
        </Section>
      </>
    );
  return (
    <>
      <div className="stats-grid four">
        <Stat
          title="Contas"
          value={number(data.stats.users)}
          detail="Usuários cadastrados"
          icon={<Users size={18} />}
        />
        <Stat
          title="Assinaturas pagas"
          value={number(data.stats.paid_subscriptions)}
          detail="Período de acesso vigente"
          icon={<CreditCard size={18} />}
        />
        <Stat
          title="Recebido em 30 dias"
          value={money(data.stats.revenue_30d)}
          detail="Bruto de assinaturas confirmadas"
          icon={<Wallet size={18} />}
        />
        <Stat
          title="Licenças emitidas"
          value={number(data.stats.licenses)}
          detail="Chaves ainda não revogadas"
          icon={<KeyRound size={18} />}
        />
      </div>
      <Section
        title="Receita de assinaturas"
        description="Pagamentos confirmados nos últimos 14 dias · valores brutos em reais"
      >
        <RevenueChart rows={data.chart} />
      </Section>
      {data.stats.failed_events > 0 && (
        <p className="alert error">
          {data.stats.failed_events} eventos precisam de atenção.{" "}
          <Link to="/admin/eventos">Abrir fila de pagamentos</Link>
        </p>
      )}
      <Section
        title="Atividade recente"
        description="Registros administrativos e de conta. Segredos não entram na auditoria."
      >
        <Table
          rows={data.activity}
          columns={[
            { label: "Evento", render: (r) => <code>{r.event}</code> },
            {
              label: "Autor",
              render: (r) => <span className="truncate">{r.actor}</span>,
            },
            { label: "Data", render: (r) => date(r.created_at) },
            {
              label: "Referência",
              render: (r) => (
                <span className="truncate" title={JSON.stringify(r.metadata)}>
                  {Object.keys(r.metadata).length
                    ? JSON.stringify(r.metadata)
                    : "—"}
                </span>
              ),
            },
          ]}
        />
      </Section>
    </>
  );
}
function RevenueChart({ rows }: { rows: Row[] }) {
  const max = Math.max(...rows.map((r) => r.amount), 100);
  return (
    <div className="revenue-chart">
      <div
        className="chart-bars"
        role="img"
        aria-label={
          "Receita diária: " +
          rows.map((r) => r.day + " " + money(r.amount)).join(", ")
        }
      >
        {rows.map((r) => (
          <div className="chart-column" key={r.day}>
            <div className="chart-track">
              <span
                style={{ height: (r.amount / max) * 100 + "%" }}
                title={r.day + ": " + money(r.amount)}
              />
            </div>
            <small>{r.day}</small>
          </div>
        ))}
      </div>
      {rows.every((r) => !r.amount) && (
        <span className="chart-empty">Os recebimentos aparecerão aqui.</span>
      )}
    </div>
  );
}
function Commercial(
  c: Context & { data: Row; reload: () => void; editPackage: (r: Row) => void },
) {
  const s = c.data.settings;
  const recargas = useData<Row[]>("/admin/topups");
  const mutate = (fn: () => Promise<unknown>, message?: string) =>
    c.act(async () => {
      await fn();
      c.reload();
      recargas.reload();
    }, message);
  function adjustment() {
    c.setDialog({
      title: "Ajustar saldo de IA",
      body: (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            c.setDialog(null);
            void mutate(() =>
              api("/admin/credits", {
                ...(f.get("email")
                  ? { email: f.get("email") }
                  : { licenseId: f.get("licenseId") }),
                credits: Number(f.get("credits")),
                reason: f.get("reason"),
              }),
            );
          }}
        >
          <Field label="E-mail da conta">
            <input type="email" name="email" />
          </Field>
          <Field
            label="Ou ID da licença sem conta"
            hint="Preencha apenas um destinatário."
          >
            <input name="licenseId" />
          </Field>
          <Field label="Créditos (negativo para retirar)">
            <input
              type="number"
              name="credits"
              min={-100000}
              max={100000}
              step={1}
              required
            />
          </Field>
          <Field label="Motivo do ajuste">
            <input name="reason" minLength={5} maxLength={200} required />
          </Field>
          <button className="button primary full">Registrar ajuste</button>
        </form>
      ),
    });
  }
  return (
    <>
      <div className="info-banner">
        <Sparkles />
        <p>
          {c.data.unit}. Claude: US$ 4 entrada / US$ 20 saída por milhão de
          tokens. Sol: US$ 2 / US$ 10. Tabela Standard pesquisada em 17/11/2026.
        </p>
      </div>
      <Section
        title="Política de margem"
        description="Premissas para proteger preços novos. A margem exibida é de contribuição estimada, antes de custos fixos, suporte e aquisição."
      >
        <form
          className="commercial-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void mutate(() =>
              api("/admin/commercial", {
                fx: Number(f.get("fx")),
                fee_pct: Number(f.get("fee_pct")),
                reserve_pct: Number(f.get("reserve_pct")),
                min_margin_pct: Number(f.get("min_margin_pct")),
              }),
            );
          }}
        >
          {[
            ["fx", "Câmbio operacional R$/US$"],
            ["fee_pct", "Reserva de processamento %"],
            ["reserve_pct", "Tributos e imprevistos %"],
            ["min_margin_pct", "Margem mínima %"],
          ].map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                type="number"
                name={k}
                defaultValue={s[k]}
                min={k === "fx" ? 1 : 0}
                max={100}
                step="0.01"
                required
              />
            </Field>
          ))}
          <button className="button secondary" disabled={c.busy}>
            Salvar política
          </button>
        </form>
        <p className="fine muted padded">
          O câmbio é uma premissa comercial, não uma cotação automática. Não há
          garantia de lucro. Atualizar essas reservas não altera o saldo dos
          clientes.
        </p>
      </Section>
      <Section
        title="Pacotes de créditos"
        description="Preço por crédito e margem considerando 100% de consumo."
        action={
          <button className="button secondary small" onClick={adjustment}>
            <Plus size={15} />
            Ajustar saldo
          </button>
        }
      >
        <Table
          rows={c.data.packages}
          columns={[
            {
              label: "Pacote",
              render: (r) => (
                <>
                  {r.name}
                  <small>{number(r.credits)} créditos</small>
                </>
              ),
            },
            { label: "Preço", render: (r) => money(r.price_cents) },
            {
              label: "Por crédito",
              render: (r) =>
                (r.price_cents / r.credits / 100).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  minimumFractionDigits: 4,
                }),
            },
            {
              label: "Margem estimada",
              render: (r) =>
                (
                  100 -
                  s.fee_pct -
                  s.reserve_pct -
                  ((r.credits * 0.001 * s.fx) / (r.price_cents / 100)) * 100
                ).toFixed(1) + "%",
            },
            {
              label: "Catálogo",
              render: (r) => <Status value={r.active ? "active" : "paused"} />,
            },
            {
              label: "Ações",
              render: (r) => (
                <button
                  className="table-action"
                  onClick={() => c.editPackage(r)}
                >
                  Editar
                </button>
              ),
            },
          ]}
        />
      </Section>
      <Section
        title="Recargas dos clientes"
        description="Compras avulsas só concedem saldo depois da confirmação do gateway."
      >
        {recargas.loading ? (
          <Loading />
        ) : recargas.error ? (
          <p className="alert error">{recargas.error}</p>
        ) : (
          <Table
            rows={recargas.data || []}
            columns={[
              { label: "Conta", render: (r) => r.email },
              {
                label: "Créditos / valor",
                render: (r) => (
                  <>
                    {number(r.credits)}
                    <small>{money(r.amount_cents)}</small>
                  </>
                ),
              },
              { label: "Status", render: (r) => <Status value={r.status} /> },
              {
                label: "Compra",
                render: (r) => <code className="truncate">{r.id}</code>,
              },
              {
                label: "Ações",
                render: (r) => (
                  <button
                    className="table-action"
                    onClick={() =>
                      c.setDialog({
                        title: "Conferir pagamento da recarga",
                        body: (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const paymentId = new FormData(
                                e.currentTarget,
                              ).get("paymentId");
                              c.setDialog(null);
                              void mutate(() =>
                                api("/admin/topups/" + r.id + "/sync", {
                                  paymentId,
                                }),
                              );
                            }}
                          >
                            <Field label="ID de pagamento no Mercado Pago">
                              <input
                                name="paymentId"
                                inputMode="numeric"
                                required
                                pattern="[0-9]{1,40}"
                              />
                            </Field>
                            <button className="button primary">
                              Consultar pagamento
                            </button>
                          </form>
                        ),
                      })
                    }
                  >
                    Sincronizar
                  </button>
                ),
              },
            ]}
          />
        )}
      </Section>
      <Section title="Referências de custo">
        <div className="source-links">
          <a
            href="https://platform.claude.com/docs/en/about-claude/pricing"
            target="_blank"
            rel="noreferrer"
          >
            Preços Anthropic
            <ArrowUpRight size={15} />
          </a>
          <a
            href="https://developers.openai.com/api/docs/pricing"
            target="_blank"
            rel="noreferrer"
          >
            Preços OpenAI
            <ArrowUpRight size={15} />
          </a>
          <a
            href="https://ptax.bcb.gov.br/ptax_internet/consultarUltimaCotacaoDolar.do"
            target="_blank"
            rel="noreferrer"
          >
            PTAX Banco Central
            <ArrowUpRight size={15} />
          </a>
        </div>
      </Section>
    </>
  );
}
