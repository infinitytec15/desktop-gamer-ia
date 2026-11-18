import { describe, expect, it } from "vitest";
import { operationChanges, savedValue, states } from "./operation-view";
describe("readable snapshot values", () => {
  it("preserves absent defaults and decodes the actual registry data type", () => {
    expect(savedValue(null, "capture")).toContain("Padrão do Windows");
    expect(savedValue({ kind: 4, bytes: [0, 0, 0, 0] }, "capture")).toBe(
      "Desativado",
    );
    expect(savedValue({ kind: 1, bytes: [50, 0, 0, 0] }, "mouse_speed")).toBe(
      "2",
    );
    expect(
      savedValue({ kind: 4, bytes: [255, 255, 255, 255] }, "capture"),
    ).toBe("Personalizado (4294967295)");
    expect(savedValue({ kind: 4, bytes: [-1, 0, 0, 0] }, "capture")).toBe(
      "Valor salvo no snapshot",
    );
  });
  it("shows only catalog changes, excluding unknown or sensitive payload fields", () => {
    const changes = operationChanges({
      id: "1",
      kind: "system",
      status: "approved",
      summary: "Fixture",
      error: null,
      payload: {
        before: { capture: null },
        after: {
          capture: { kind: 4, bytes: [0, 0, 0, 0] },
          secret: "hidden",
          toString: "bad",
        },
      },
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      label: "Captura de jogos",
      after: "Desativado",
    });
  });
  it("does not present interrupted, failed or rolled-back execution as applied", () => {
    for (const key of [
      "pending",
      "failed",
      "recovery_required",
      "rolled_back",
      "approved",
    ])
      expect(states[key].tone).not.toBe("success");
    expect(states.applied.label).toBe("Aplicado e verificado");
  });
});
