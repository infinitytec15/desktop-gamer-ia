export type { Report } from "./generated/Report";
export type { Snapshot } from "./generated/Snapshot";
export const preferences = [
  {
    key: "offline_first",
    title: "Priorizar o modo offline",
    description: "Usar presets locais quando estiverem disponíveis.",
  },
  {
    key: "reduced_motion",
    title: "Reduzir movimento",
    description: "Preferência de acessibilidade do aplicativo.",
  },
  {
    key: "monitor_enabled",
    title: "Habilitar monitoramento",
    description: "Salvar a preferência para o futuro módulo de monitor.",
  },
] as const;
export function makePlan(keys: string[]) {
  if (
    !keys.length ||
    keys.some((k) => !preferences.some((p) => p.key === k)) ||
    new Set(keys).size !== keys.length
  )
    throw new Error("Seleção inválida");
  return {
    steps: keys.map((key) => ({
      action: "set_preference" as const,
      key,
      value: true,
    })),
  };
}
