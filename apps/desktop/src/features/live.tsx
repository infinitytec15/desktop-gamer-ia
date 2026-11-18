import { useState, useCallback } from "react";
import { CheckCircle2 } from "lucide-react";
import type { OptimizationPlan } from "../generated/OptimizationPlan";
import { OptimizePage } from "./boost";
import { StreamingPage } from "./automation";
import { DiscordPage } from "./modules";
export function LiveSetupPage({
  plan,
  setPlan,
  navigate,
  onBusyChange,
}: {
  plan: OptimizationPlan | null;
  setPlan: (plan: OptimizationPlan | null) => void;
  navigate: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [stage, setStage] = useState("system"),
    [busy, setBusy] = useState(false),
    [checked, setChecked] = useState<string[]>([]);
  const reportBusy = useCallback(
    (v: boolean) => {
      setBusy(v);
      onBusyChange(v);
    },
    [onBusyChange],
  );
  const stages = [
    ["system", "1. Windows"],
    ["obs", "2. OBS e destino"],
    ["voice", "3. Voz e privacidade"],
  ];
  return (
    <>
      <div className="live-intro">
        <p>
          Prepare cada parte separadamente. Confirme cenas, microfone e uma
          gravação de teste no OBS antes de entrar ao vivo.
        </p>
        <div
          className="filter-tabs"
          role="group"
          aria-label="Etapas de preparação da live"
        >
          {stages.map(([id, label]) => (
            <button
              key={id}
              disabled={busy}
              aria-pressed={stage === id}
              onClick={() => setStage(id)}
            >
              {checked.includes(id) && <CheckCircle2 size={14} />} {label}
            </button>
          ))}
        </div>
      </div>
      {stage === "system" ? (
        <OptimizePage
          plan={plan}
          setPlan={setPlan}
          navigate={navigate}
          onBusyChange={reportBusy}
        />
      ) : stage === "obs" ? (
        <StreamingPage plan={plan} />
      ) : (
        <DiscordPage />
      )}
      <label className="plan-row">
        <input
          type="checkbox"
          checked={checked.includes(stage)}
          disabled={busy}
          onChange={() =>
            setChecked((s) =>
              s.includes(stage) ? s.filter((x) => x !== stage) : [...s, stage],
            )
          }
        />
        <span>
          Conferi esta parte do meu setup
          <small>
            Confirmação manual sua; não é um teste automático de transmissão.
          </small>
        </span>
      </label>
    </>
  );
}
