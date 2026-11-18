import "@gameforge/printing/style.css";
import { lazy, Suspense, useEffect, useRef } from "react";
import { gsap } from "gsap";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronDown,
  Cpu,
  Radio,
  ShieldCheck,
  Undo2,
  Zap,
  Monitor,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { type Row, money, number, navigate } from "./lib";
import { Brand, Link } from "./ui";
const HeroScene = lazy(() => import("./HeroScene"));
export function Plans({
  catalog,
  onSelect,
  busy = false,
}: {
  catalog: Row;
  onSelect: (id: string) => void;
  busy?: boolean;
}) {
  return (
    <div className="pricing-grid">
      {catalog.plans?.map((p: Row, i: number) => (
        <article className={"plan " + (i === 1 ? "featured" : "")} key={p.id}>
          <div className="plan-top">
            <h3>{p.name}</h3>
            {i === 1 && <span className="tag">Para quem cria</span>}
          </div>
          <p>
            {i === 0
              ? "Seu PC, bem preparado."
              : i === 1
                ? "Jogue, grave e transmita."
                : "Mais espaço para seus setups."}
          </p>
          <div className="price">
            {money(p.price_cents)}
            <span>/{p.interval_months === 12 ? "ano" : "mês"}</span>
          </div>
          <button
            className={"button " + (i === 1 ? "primary" : "secondary")}
            onClick={() => onSelect(p.id)}
            disabled={busy}
          >
            Escolher {p.name}
            <ArrowUpRight size={17} />
          </button>
          <ul>
            <li>
              <Check />
              {number(p.credits)} créditos de IA por ciclo
            </li>
            <li>
              <Check />
              {p.max_devices}{" "}
              {p.max_devices === 1 ? "computador" : "computadores"}
            </li>
            <li>
              <Check />
              Quick Boost com revisão e reversão
            </li>
            <li>
              <Check />
              Configuração de perfil do OBS
            </li>
            <li>
              <Check />
              Planejamento de impressão 3D
            </li>
            <li>
              <Check />
              Claude e fallback OpenAI opcional
            </li>
          </ul>
        </article>
      ))}
    </div>
  );
}
export function Packages({
  catalog,
  onSelect,
  busy = false,
}: {
  catalog: Row;
  onSelect: (id: string) => void;
  busy?: boolean;
}) {
  const first = catalog.packages?.[0];
  return (
    <div className="package-grid">
      {catalog.packages?.map((p: Row) => (
        <article className="package" key={p.id}>
          <div className="plan-top">
            <h3>{p.name}</h3>
            {first && p.id !== first.id && (
              <span className="tag">
                {Math.round(
                  (1 -
                    p.price_cents /
                      p.credits /
                      (first.price_cents / first.credits)) *
                    100,
                )}
                % por volume
              </span>
            )}
          </div>
          <strong>
            {number(p.credits)} <small>créditos</small>
          </strong>
          <p>{money(p.price_cents)} · pagamento único</p>
          <button
            className="button secondary"
            onClick={() => onSelect(p.id)}
            disabled={busy}
          >
            Adicionar saldo
            <ArrowUpRight size={16} />
          </button>
        </article>
      ))}
    </div>
  );
}
export function Landing({
  catalog,
  error,
}: {
  catalog: Row | null;
  error: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        gsap.from("[data-enter]", {
          y: 22,
          opacity: 0,
          stagger: 0.09,
          duration: 0.8,
          ease: "power3.out",
          clearProps: "all",
        });
    }, root);
    return () => ctx.revert();
  }, []);
  const choose = (id: string) =>
    navigate("/cadastro?plan=" + encodeURIComponent(id));
  return (
    <div className="landing" ref={root}>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="public-header wrap">
        <Brand />
        <nav aria-label="Principal">
          <a href="#como-funciona">Como funciona</a>
          <a href="#recursos">Seu setup</a>
          <a href="#impressao-3d">Impressão 3D</a>
          <a href="#planos">Planos</a>
        </nav>
        <div className="header-actions">
          <Link to="/login">Entrar</Link>
          <Link to="/cadastro" className="button small secondary">
            Criar conta
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <main id="conteudo">
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="release-note" data-enter>
              <span />
              GameForge AI · Windows 10 e 11
            </div>
            <h1 data-enter>
              Seu setup.
              <br />
              No ponto
              <br />
              <span>para jogar.</span>
            </h1>
            <p data-enter>
              Entenda seu PC. Prepare sua live. Uma IA que transforma o
              diagnóstico em um plano que você pode revisar, aplicar e desfazer.
            </p>
            <div className="hero-actions" data-enter>
              <Link to="/cadastro" className="button primary">
                Preparar meu setup
                <ArrowUpRight size={19} />
              </Link>
              <a href="#como-funciona" className="text-link">
                Explorar o GameForge
                <ArrowRight size={17} />
              </a>
            </div>
            <div className="hero-proof" data-enter>
              <ShieldCheck size={16} />
              <span>Você aprova cada mudança. O controle continua seu.</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="orbital-orbit" />
            <Suspense
              fallback={
                <div className="scene-fallback">
                  <Cpu size={120} strokeWidth={0.6} />
                </div>
              }
            >
              <HeroScene />
            </Suspense>
            <div className="visual-label label-a">
              <i />
              <span>Sistema em perspectiva</span>
            </div>
            <div className="visual-label label-b">
              <Zap size={13} />
              <span>Inteligência + controle</span>
            </div>
            <span className="visual-caption">
              PROJETADO PARA O SEU PRÓXIMO PLAY
            </span>
          </div>
        </section>
        <div className="capability-strip wrap">
          <span>Do PC à transmissão.</span>
          <div>
            <Cpu />
            Windows
          </div>
          <div>
            <Radio />
            OBS Studio
          </div>
          <div>
            <Sparkles />
            Claude + OpenAI
          </div>
          <div>
            <ShieldCheck />
            Mudanças reversíveis
          </div>
        </div>
        <section id="como-funciona" className="section wrap workflow">
          <div>
            <h2>
              Menos tentativa.
              <br />
              Mais intenção.
            </h2>
            <p className="lead">
              Você conta o objetivo. O GameForge lê o cenário e ajuda a preparar
              o caminho.
            </p>
            <ol className="steps">
              <li>
                <span>01</span>
                <div>
                  <h3>Conheça o que está acontecendo</h3>
                  <p>
                    CPU, memória, discos e programas em uma visão do seu
                    computador.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Revise um plano feito para você</h3>
                  <p>
                    A IA sugere ações conhecidas e mostra o efeito de cada
                    mudança antes de aplicar.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Aplique. Confira. Desfaça.</h3>
                  <p>
                    Snapshots e histórico acompanham as ações compatíveis. A
                    restauração continua disponível sem assinatura.
                  </p>
                </div>
              </li>
            </ol>
          </div>
          <div
            className="product-preview"
            aria-label="Exemplo ilustrativo de revisão do plano"
          >
            <div className="preview-top">
              <Brand compact />
              <span>Exemplo de plano</span>
            </div>
            <div className="preview-heading">
              <span className="preview-icon">
                <Zap />
              </span>
              <div>
                <h3>Preparar para jogar</h3>
                <p>Revisão antes de aplicar</p>
              </div>
            </div>
            <div className="preview-change">
              <div>
                <Check size={16} />
                <strong>Modo de Jogo</strong>
              </div>
              <span>
                Desativado <ArrowRight size={13} />
                <b>Ativado</b>
              </span>
            </div>
            <div className="preview-change">
              <div>
                <Check size={16} />
                <strong>Captura em segundo plano</strong>
              </div>
              <span>
                Ativada <ArrowRight size={13} />
                <b>Desativada</b>
              </span>
            </div>
            <div className="preview-note">
              <ShieldCheck size={18} />
              <p>Os valores anteriores são salvos antes da mudança.</p>
            </div>
            <div className="preview-footer">
              <span>2 mudanças no exemplo</span>
              <span className="button primary small">
                Revisar plano
                <ArrowRight size={15} />
              </span>
            </div>
            <div className="attached-note">
              <Undo2 size={17} />
              <div>
                <strong>Um caminho de volta.</strong>
                <span>Reverta pelo histórico do aplicativo.</span>
              </div>
            </div>
          </div>
        </section>
        <section id="recursos" className="section features-section">
          <div className="wrap">
            <div className="section-heading">
              <h2>
                Um lugar para
                <br />
                cuidar do seu setup.
              </h2>
              <p>
                Ferramentas locais para o que importa antes de abrir o jogo ou
                entrar ao vivo.
              </p>
            </div>
            <div className="feature-grid">
              <article>
                <span className="feature-symbol">
                  <Zap />
                </span>
                <h3>Ajustes com critério</h3>
                <p>
                  Game Mode, captura do Windows, resposta do mouse e energia.
                  Ações explícitas, com revisão e reversão.
                </p>
                <span className="feature-meta">QUICK BOOST</span>
              </article>
              <article>
                <span className="feature-symbol">
                  <Radio />
                </span>
                <h3>Sua live começa no OBS</h3>
                <p>
                  Conecte o OBS local e prepare um perfil de vídeo e transmissão
                  para Twitch, YouTube, Kick ou RTMP.
                </p>
                <span className="feature-meta">STREAMING</span>
              </article>
              <article>
                <span className="feature-symbol">
                  <Monitor />
                </span>
                <h3>Veja o computador real</h3>
                <p>
                  Acompanhe CPU, RAM e armazenamento. Temperaturas aparecem
                  quando o hardware disponibiliza os sensores.
                </p>
                <span className="feature-meta">DIAGNÓSTICO</span>
              </article>
            </div>
          </div>
        </section>
        <section
          id="impressao-3d"
          className="section wrap print-public-section"
        >
          <div>
            <h2>
              Do setup à peça.
              <br />
              FDM e resina, com critério.
            </h2>
            <p>
              Prepare temperatura, velocidade, camada e suportes a partir dos
              limites da sua impressora e do material. Veja a peça em 3D e
              revise cada parâmetro antes de levar a cópia ao fatiador.
            </p>
            <ul className="print-public-points">
              <li>
                <Check />
                Catálogo com mais de 160 nomes de modelos FDM, de Bambu Lab,
                Creality, Flashforge, Elegoo e outras marcas, além de
                configuração personalizada.
              </li>
              <li>
                <Check />
                STL analisado localmente: dimensões, bordas abertas, volume
                quando consistente e cópia com orientação escolhida.
              </li>
              <li>
                <Check />
                Cópias estruturais de presets JSON, Cura ZIP e Prusa INI. Resina
                e formatos proprietários têm aplicação guiada, com unidades
                explícitas.
              </li>
            </ul>
            <Link to="/impressao-3d" className="button primary">
              Explorar impressão 3D
              <ArrowUpRight size={18} />
            </Link>
            <div className="print-public-chips">
              {[
                "Bambu Lab",
                "Creality",
                "Flashforge",
                "Elegoo",
                "Anycubic",
                "Prusa",
                "FDM / FFF",
                "SLA / MSLA / DLP",
              ].map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
          <div className="print-public-art">
            <svg
              viewBox="0 0 470 370"
              aria-label="Ilustração de uma peça construída em camadas"
            >
              <defs>
                <linearGradient id="print-material" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#a986db" />
                  <stop offset="1" stopColor="#4c346b" />
                </linearGradient>
                <pattern
                  id="print-grid"
                  width="30"
                  height="18"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M0 0H30M0 0V18"
                    stroke="#77568e"
                    strokeOpacity=".15"
                    fill="none"
                  />
                </pattern>
              </defs>
              <path
                d="m40 260 195-110 195 110-195 110z"
                fill="url(#print-grid)"
                stroke="#84629f"
                strokeOpacity=".3"
              />
              {Array.from({ length: 15 }, (_, i) => (
                <g key={i} transform={"translate(0 " + -i * 9 + ")"}>
                  <path
                    d="m130 246 105-58 105 58-105 58z"
                    fill="url(#print-material)"
                    fillOpacity={0.5 + i * 0.025}
                    stroke="#c3a1e7"
                    strokeOpacity=".3"
                  />
                  <path
                    d="m130 246 105 58 105-58v7l-105 58-105-58z"
                    fill="#5d407b"
                    stroke="#a17ac6"
                    strokeOpacity=".23"
                  />
                </g>
              ))}
              <path
                d="m235 187 0-126 105 59"
                stroke="#ceb0e6"
                strokeDasharray="4 6"
                strokeOpacity=".4"
                fill="none"
              />
              <path
                d="m235 61 85-47 85 47-85 46z"
                stroke="#a989c9"
                strokeOpacity=".4"
                fill="#201b2a"
              />
              <text
                x="320"
                y="67"
                textAnchor="middle"
                fill="#b49acb"
                fontSize="11"
                fontFamily="Inter, sans-serif"
              >
                FDM · Resina
              </text>
            </svg>
            <span>
              Ilustração de camadas · sem estimativa de tempo ou ganho
            </span>
          </div>
        </section>
        <section id="planos" className="section wrap pricing-section">
          <div className="section-heading">
            <h2>
              Seu próximo nível
              <br />
              começa aqui.
            </h2>
            <p>
              Escolha seus dispositivos e seu saldo de IA. Os créditos são
              liberados após a confirmação de cada pagamento.
            </p>
          </div>
          {error ? (
            <p className="alert error" role="alert">
              Não foi possível carregar os planos. {error}
            </p>
          ) : catalog ? (
            <Plans catalog={catalog} onSelect={choose} />
          ) : (
            <p role="status">Carregando planos…</p>
          )}
          <p className="pricing-footnote">
            Assinatura recorrente via Mercado Pago. Cancele a renovação pelo
            painel. O acesso segue até o fim do período pago.
          </p>
          <div className="credit-explainer">
            <Sparkles size={23} />
            <div>
              <h3>Créditos que acompanham o uso.</h3>
              <p>
                1 crédito equivale a US$ 0,001 de consumo Standard dos modelos.
                Entrada e saída têm pesos diferentes. Aplicar um plano já gerado
                e desfazer mudanças não consome IA.
              </p>
              <p className="muted">
                Por exemplo: 1.000 tokens de entrada + 1.000 de saída usam 24
                créditos no Claude Opus 5.5, ou 12 no GPT 6.1 Sol. Reservamos o
                teto antes da análise e acertamos pelo uso informado.
              </p>
            </div>
          </div>
          <h3 className="package-title">Mais IA, quando você precisar.</h3>
          {catalog && (
            <Packages
              catalog={catalog}
              onSelect={() => navigate("/cadastro")}
            />
          )}
          <p className="muted fine">
            Créditos acumulam e não expiram nesta oferta. É necessária uma
            licença válida para usar IA no desktop. Uso externo inconclusivo
            fica reservado até conferência.
          </p>
        </section>
        <section className="section wrap faq-section">
          <h2>Antes de dar play.</h2>
          <div className="faqs">
            {[
              [
                "O GameForge promete aumentar meu FPS?",
                "Não há ganho garantido. O aplicativo identifica o cenário e aplica mudanças compatíveis. O resultado depende do hardware, do jogo e das configurações atuais.",
              ],
              [
                "O que acontece depois de assinar?",
                "Após o pagamento confirmado, gere sua chave no painel, baixe o instalador e ative o computador. Suas credenciais de IA ficam no servidor, sem configuração de API no desktop.",
              ],
              [
                "Posso usar sem internet?",
                "Diagnóstico e restauração são locais. Recursos da licença usam uma validação assinada com validade de até 24 horas; gerar planos com IA requer conexão.",
              ],
              [
                "Ele controla todos os aplicativos e cria meu servidor Discord?",
                "A versão atual executa um catálogo específico de ações no Windows e configura perfis de transmissão no OBS. Discord tem orientações. Controle livre da tela e criação automática de servidores ainda não estão disponíveis.",
              ],
              [
                "Já posso baixar e pagar?",
                "A cobrança e o download são habilitados pelo operador após configurar Mercado Pago e publicar o instalador correspondente. Quando estiverem disponíveis, você verá os botões no seu painel.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="final-cta wrap">
          <div>
            <h2>
              Pronto para
              <br />o próximo play?
            </h2>
            <p>Seu PC tem um cenário. Comece entendendo o seu.</p>
          </div>
          <Link to="/cadastro" className="button primary">
            Criar minha conta
            <ArrowUpRight size={20} />
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
export function Footer() {
  return (
    <footer className="public-footer wrap">
      <Brand />
      <span>GameForge AI © {new Date().getFullYear()}</span>
      <div>
        <Link to="/termos">Termos</Link>
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/admin/login">Administração</Link>
      </div>
    </footer>
  );
}
export function Legal({ privacy }: { privacy: boolean }) {
  return (
    <div className="landing">
      <header className="public-header wrap">
        <Brand />
        <Link to="/">
          Voltar ao site
          <ArrowUpRight size={16} />
        </Link>
      </header>
      <main className="wrap legal">
        <h1>{privacy ? "Privacidade e dados" : "Condições de uso"}</h1>
        <p className="alert">
          Informações operacionais da versão beta. O operador deve completar os
          dados da empresa e de atendimento antes de abrir vendas.
        </p>
        {privacy ? (
          <>
            <h2>O que é armazenado</h2>
            <p>
              A conta guarda nome, e-mail, hash de senha, assinaturas,
              pagamentos, licenças, dispositivos e extrato de créditos. Dados de
              cartão são tratados no checkout do Mercado Pago.
            </p>
            <h2>Diagnóstico e IA</h2>
            <p>
              O diagnóstico é local. Para gerar planos, você revisa o objetivo e
              o resumo de hardware que será enviado ao servidor e ao provedor de
              IA. Não são enviados arquivos pessoais nem listas completas de
              processos. Fallback OpenAI depende da sua autorização.
            </p>
            <h2>Segurança e controle</h2>
            <p>
              Senhas são derivadas com scrypt. Chaves de licença são guardadas
              como hash; tokens de ativação usam o cofre do sistema. O painel
              permite revogar dispositivos e chaves. A validação offline expira
              em até 24 horas. Registros de uso de IA são retidos por até 90
              dias; pagamentos e auditoria têm retenção definida pelo operador.
            </p>
            <h2>Solicitações sobre dados</h2>
            <p>
              O canal de atendimento e a identificação do controlador ainda
              devem ser publicados pelo operador. Não envie dados sensíveis no
              objetivo da IA.
            </p>
          </>
        ) : (
          <>
            <h2>Uso do aplicativo</h2>
            <p>
              O GameForge está em beta para Windows 10/11 x64. Revise as ações
              antes de aplicar. Energia em alto desempenho pode aumentar calor e
              consumo. O aplicativo não promete ganhos de FPS e não cobre todo
              programa instalado.
            </p>
            <h2>Assinaturas e créditos</h2>
            <p>
              Preço, período, dispositivos e créditos aparecem na escolha do
              plano. Pagamentos são processados no Mercado Pago. A licença só é
              concedida após confirmação de cobrança. Cancelar impede novas
              renovações e preserva o período pago. Recargas acrescentam saldo,
              sem estender a licença.
            </p>
            <p>
              Créditos usam o custo tabelado dos modelos Standard: um crédito
              corresponde a US$ 0,001 de consumo. Há reserva antecipada e acerto
              pelo uso. Falhas de rede após envio podem consumir a reserva até
              conferência. Contestações e estornos revertem os créditos
              associados e podem suspender o acesso.
            </p>
            <h2>Mudanças e reversão</h2>
            <p>
              A IA fornece um plano para aprovação. A execução fica limitada às
              ações implementadas. Restauração de alterações anteriores não
              exige assinatura ativa. Requisitos e limites de cada integração
              aparecem no desktop.
            </p>
            <h2>Atendimento</h2>
            <p>
              Dados da empresa, canal de suporte e condições comerciais
              complementares devem ser publicados antes do lançamento de vendas.
            </p>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
