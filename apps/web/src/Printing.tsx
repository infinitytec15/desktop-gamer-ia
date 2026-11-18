import { PrintWorkbench } from "@gameforge/printing/react";
import "@gameforge/printing/style.css";
import { api } from "./lib";
import { Brand, Link } from "./ui";
import { Footer } from "./Landing";
export default function Printing({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  const workbench = (
    <PrintWorkbench
      generateAi={async (input) => {
        const result = await api("/account/printing/ai", input);
        window.dispatchEvent(new Event("data-updated"));
        return result;
      }}
      aiHint="Claude Opus 5.5 com fallback OpenAI opcional. IA exige conta com assinatura paga ou licença manual válida e saldo disponível."
    />
  );
  if (!standalone) return workbench;
  return (
    <div className="landing">
      <header className="public-header wrap">
        <Brand />
        <div className="header-actions">
          <Link to="/">Voltar ao site</Link>
          <Link to="/login" className="button secondary small">
            Minha conta ↗
          </Link>
        </div>
      </header>
      <main className="wrap printing-public">
        <div className="printing-public-head">
          <div>
            <h1>
              Da peça ao perfil.
              <br />
              Com mais controle.
            </h1>
            <p>
              FDM e resina no mesmo assistente: parâmetros com unidades claras,
              prévia local do STL e uma cópia revisada do perfil. O arquivo
              original permanece intacto.
            </p>
          </div>
          <div>
            <Link to="/cadastro" className="button primary">
              Criar conta para usar IA ↗
            </Link>
          </div>
        </div>
        {workbench}
      </main>
      <Footer />
    </div>
  );
}
