import { Download, ArrowRight, Check } from "lucide-react";
import { Brand, Link } from "./ui";
import { Footer } from "./Landing";
export default function Printing({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  const content = (
    <>
      <div className="printing-public-head">
        <div>
          <h1>
            Da peça ao perfil.
            <br />
            No seu computador.
          </h1>
          <p>
            O GameForge AI reúne ferramentas para impressão FDM e resina no
            aplicativo desktop. O site é seu lugar para conhecer os recursos,
            escolher um plano, comprar créditos e baixar o app.
          </p>
        </div>
        <div>
          <Link to="/app/download" className="button primary">
            Baixar aplicativo <Download size={18} />
          </Link>
        </div>
      </div>
      <section className="section">
        <h2>Prepare a impressão no desktop</h2>
        <ul className="print-public-points">
          <li>
            <Check />
            Analise dimensões e topologia do STL localmente e visualize a
            orientação da peça.
          </li>
          <li>
            <Check />
            Revise temperatura, velocidade, camada e suportes conforme os
            limites e a calibração informados.
          </li>
          <li>
            <Check />
            Compare os parâmetros e prepare uma cópia de presets compatíveis
            para abrir no fatiador.
          </li>
        </ul>
        <p>
          STL e presets permanecem no computador. Somente o resumo revisado é
          enviado ao proxy quando você escolhe uma análise com IA. Catálogo de
          modelos não equivale a perfis homologados; formatos proprietários e
          resina podem exigir aplicação guiada.
        </p>
        <p>
          O aplicativo usa código compartilhado para Windows e macOS. As funções
          e os instaladores disponíveis dependem da plataforma; ajustes do
          registro e energia do Windows não são executados no Mac.
        </p>
        <div className="header-actions">
          <Link to="/cadastro" className="button primary">
            Criar minha conta <ArrowRight size={17} />
          </Link>
          <Link to="/#planos" className="button secondary">
            Conhecer os planos
          </Link>
        </div>
      </section>
    </>
  );
  if (!standalone) return content;
  return (
    <div className="landing">
      <header className="public-header wrap">
        <Brand />
        <div className="header-actions">
          <Link to="/">Voltar ao site</Link>
          <Link to="/login" className="button secondary small">
            Minha conta
          </Link>
        </div>
      </header>
      <main className="wrap printing-public">{content}</main>
      <Footer />
    </div>
  );
}
