import { test, expect, type Page } from "@playwright/test";

// IPC fixtures validate UI behavior; no commands are sent to Windows or paid providers.
async function nativeFixture(page: Page, scenario = "success") {
  await page.addInitScript(
    ({ scenario }) => {
      localStorage.setItem("gameforge.onboarding.v1", "done");
      Object.defineProperty(window, "isTauri", { value: true });
      const calls: string[] = [];
      Object.assign(window, { fixtureCalls: calls });
      const actions = [
        "enable_game_mode",
        "disable_game_capture",
        "disable_mouse_acceleration",
        "high_performance_power",
      ];
      const value = (n: number) => ({ kind: 4, bytes: [n, 0, 0, 0] });
      const payload = {
        actions: ["enable_game_mode", "disable_game_capture"],
        before: { game_mode_auto: null, game_dvr: value(1), capture: value(1) },
        after: {
          game_mode_auto: value(1),
          game_dvr: value(0),
          capture: value(0),
        },
        restore_point: null,
      };
      let op: any =
        scenario === "resume"
          ? {
              id: "1795000000000000000",
              kind: "system",
              status: "approved",
              summary: "Fixture: revisão recuperável",
              payload,
              error: null,
            }
          : scenario === "interrupted"
            ? {
                id: "1795000000000000000",
                kind: "system",
                status: "recovery_required",
                summary: "Fixture: execução interrompida",
                payload,
                error: "Fixture: recuperação necessária",
              }
            : null;
      Object.defineProperty(window, "__TAURI_INTERNALS__", {
        value: {
          invoke: async (cmd: string, args: any = {}) => {
            calls.push(cmd);
            if (cmd === "operation_history") return op ? [op] : [];
            if (cmd === "system_checks")
              return actions.map((action) => ({
                action,
                state:
                  scenario === "already" && action === "enable_game_mode"
                    ? "already_set"
                    : action === "high_performance_power"
                      ? "unavailable"
                      : "ready",
                current:
                  action === "high_performance_power"
                    ? "Não disponível"
                    : "Padrão do Windows",
                target: "Fixture",
                detail:
                  action === "high_performance_power"
                    ? "Plano não disponível neste hardware de teste"
                    : "Leitura de teste",
              }));
            if (cmd === "offline_plan")
              return {
                summary: "Plano local de teste, sem alteração no PC",
                system_actions:
                  args.goal === "Equilibrar desempenho e consumo"
                    ? ["enable_game_mode"]
                    : ["enable_game_mode", "disable_game_capture"],
                video: { width: 1280, height: 720, fps: 30, bitrate: 3500 },
                provider: "offline",
                model: "fixture",
                warnings: ["Fixture: não é medição de FPS"],
              };
            if (cmd === "prepare_system") {
              op = {
                id: "1795000000000000000",
                kind: "system",
                status: "approved",
                summary: "Fixture",
                payload: { ...payload, actions: args.actions },
                error: null,
              };
              return op;
            }
            if (cmd === "apply_system") {
              if (scenario === "rollback") {
                op = {
                  ...op,
                  status: "rolled_back",
                  error:
                    "Fixture: falha após escrita, estado anterior restaurado",
                };
                throw "Fixture: falha controlada";
              }
              op = {
                ...op,
                status: "applied",
                payload: { ...payload, restore_point: "fixture" },
              };
              return op;
            }
            if (cmd === "cancel_system") {
              op = { ...op, status: "cancelled" };
              return;
            }
            if (cmd === "undo_operation") {
              if (scenario === "conflict")
                throw "Fixture: configuração mudou externamente; restauração bloqueada";
              op = { ...op, status: "restored", error: null };
              return op;
            }
            if (cmd === "preview_ai")
              return {
                goal: args.goal,
                os: "Windows de teste",
                architecture: "x86_64",
                cpu: "CPU de teste",
                cores: 8,
                ram_gb: 16,
                used_ram_gb: 8,
                cpu_usage: 25,
                disks: [{ total_gb: 100, free_gb: 50 }],
              };
            if (cmd === "estimate_ai")
              return {
                quote_hash: args.input.effort,
                models: ["fixture-model"],
                mode: args.input.mode,
                effort: args.input.effort,
                estimated_credits: 1,
                maximum_credits: args.input.effort === "high" ? 10 : 4,
                explanation: "Fixture",
              };
            throw "Unexpected fixture command " + cmd;
          },
        },
      });
    },
    { scenario },
  );
}

async function prepare(page: Page) {
  await page.goto("/#boost");
  await page.getByRole("button", { name: "Usar preset offline" }).click();
  await page
    .getByRole("button", { name: "Revisar valores antes de aplicar" })
    .click();
}

test("shows current values, optional adjustments and a separate approval", async ({
  page,
}) => {
  await nativeFixture(page, "already");
  await page.goto("/#boost");
  await page.getByRole("button", { name: "Usar preset offline" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".impeccable/review/boost-plan-desktop.png",
    fullPage: true,
  });
  await expect(
    page.getByLabel("Ativar Modo de Jogo", { exact: false }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Plano de energia Alto desempenho", { exact: false }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Desativar aceleração do mouse", { exact: false }),
  ).not.toBeChecked();
  await expect(
    page.getByText("1 ajuste selecionado", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).fixtureCalls.includes("apply_system"),
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Revisar valores antes de aplicar" })
    .click();
  await expect(
    page.getByRole("table", { name: "Comparação de configurações" }),
  ).toContainText("Padrão do Windows");
  expect(await page.locator("pre").count()).toBe(0);
  await page
    .getByRole("button", { name: "Aprovar e aplicar no Windows (UAC)" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aplicado e verificado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Desfazer ajustes" }).click();
  expect(
    await page.evaluate(() =>
      (window as any).fixtureCalls.includes("undo_operation"),
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Confirmar restauração (UAC)" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Restaurado", exact: true }),
  ).toBeVisible();
});

test("history cannot be bypassed by a failed recovery retry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gameforge.onboarding.v1", "done");
    Object.defineProperty(window, "isTauri", { value: true });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async () => {
          throw "Fixture: database unavailable";
        },
      },
    });
  });
  await page.goto("/#boost");
  await expect(
    page.getByRole("button", { name: "Usar preset offline" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Conferir recuperação" }).click();
  await expect(
    page.getByRole("button", { name: "Conferir recuperação" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Usar preset offline" }),
  ).toBeDisabled();
});

test("history loads automatically and restoration requires explicit confirmation", async ({
  page,
}) => {
  await nativeFixture(page, "interrupted");
  await page.goto("/#history");
  await expect(
    page.getByRole("heading", { name: "Recuperação necessária" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restaurar Windows (UAC)" }).click();
  expect(
    await page.evaluate(() =>
      (window as any).fixtureCalls.includes("undo_operation"),
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Confirmar restauração", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Restaurado", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Precisam de atenção", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nenhuma operação neste filtro" }),
  ).toBeVisible();
});

test("live setup and settings reveal one task at a time", async ({ page }) => {
  await nativeFixture(page);
  await page.goto("/#live");
  await expect(
    page.getByRole("heading", { name: "Planejar a otimização" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "2. OBS e destino" }).click();
  await expect(
    page.getByRole("heading", { name: "OBS e plataformas de streaming" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Planejar a otimização" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "3. Voz e privacidade" }).click();
  await expect(
    page.getByRole("heading", { name: "Checklist de voz e privacidade" }),
  ).toBeVisible();
  await page.goto("/#settings");
  await page
    .getByRole("button", { name: "Conexão com o OBS", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Conexões e credenciais" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Licença GameForge" }),
  ).not.toBeVisible();
});

test("recovers a saved review across navigation and can cancel it", async ({
  page,
}) => {
  await nativeFixture(page, "resume");
  await page.goto("/#boost");
  await expect(
    page.getByRole("heading", { name: "Confirme antes de aplicar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Monitor", exact: true }).click();
  await page.getByRole("button", { name: "Quick Boost", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Aprovar e aplicar no Windows (UAC)" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancelar revisão", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Usar preset offline" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as any).fixtureCalls.includes("apply_system"),
    ),
  ).toBe(false);
});

test("failed apply recovers the durable rollback state and never says applied", async ({
  page,
}) => {
  await nativeFixture(page, "rollback");
  await prepare(page);
  await page
    .getByRole("button", { name: "Aprovar e aplicar no Windows (UAC)" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alterações desfeitas após falha" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Aplicado e verificado" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preparar nova revisão" }),
  ).toBeEnabled();
});

test("interrupted execution blocks another batch and offers recovery", async ({
  page,
}) => {
  await nativeFixture(page, "interrupted");
  await page.goto("/#boost");
  await expect(
    page.getByRole("heading", { name: "Recuperação necessária" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Usar preset offline" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preparar nova revisão" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Desfazer ajustes" }).click();
  await page
    .getByRole("button", { name: "Confirmar restauração (UAC)" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Restaurado", exact: true }),
  ).toBeVisible();
});

test("restoration conflicts keep the verified operation and surface recovery error", async ({
  page,
}) => {
  await nativeFixture(page, "conflict");
  await prepare(page);
  await page
    .getByRole("button", { name: "Aprovar e aplicar no Windows (UAC)" })
    .click();
  await page.getByRole("button", { name: "Desfazer ajustes" }).click();
  await page
    .getByRole("button", { name: "Confirmar restauração (UAC)" })
    .click();
  await expect(page.getByRole("alert")).toContainText("restauração bloqueada");
  await expect(
    page.getByRole("heading", { name: "Restaurado", exact: true }),
  ).toHaveCount(0);
});

test("AI context and estimates are readable and effort refreshes the quote without generation", async ({
  page,
}) => {
  await nativeFixture(page);
  await page.goto("/#boost");
  await page.getByText("Personalizar com IA", { exact: true }).click();
  await page.getByRole("button", { name: "Preparar análise com IA" }).click();
  await expect(page.locator(".readable-data")).toContainText("CPU de teste");
  await expect(
    page.getByText("Reserva máxima: 4 créditos", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Esforço de raciocínio").selectOption("high");
  await expect(
    page.getByText("Reserva máxima: 10 créditos", { exact: false }),
  ).toBeVisible();
  expect(await page.locator("pre").count()).toBe(0);
  expect(
    await page.evaluate(() =>
      (window as any).fixtureCalls.includes("generate_plan"),
    ),
  ).toBe(false);
});

test("goal changes invalidate the prior local review; balanced preserves capture", async ({
  page,
}) => {
  await nativeFixture(page);
  await page.goto("/#boost");
  await page.getByRole("button", { name: "Usar preset offline" }).click();
  await page.getByRole("radio", { name: /Uso equilibrado/ }).check();
  await expect(
    page.getByRole("heading", { name: "Escolha os ajustes" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Usar preset offline" }).click();
  await expect(
    page.getByLabel("Desativar captura do Xbox Game Bar", { exact: false }),
  ).not.toBeChecked();
  await expect(
    page.getByText("1 ajuste selecionado", { exact: true }),
  ).toBeVisible();
});

test("review and results fit narrow windows and export a readable report", async ({
  page,
}) => {
  await nativeFixture(page);
  await prepare(page);
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.impeccable/review/boost-review-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Aprovar e aplicar no Windows (UAC)" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aplicado e verificado" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar relatório" }).click();
  expect((await download).suggestedFilename()).toBe("GameForge-relatorio.txt");
  await page.screenshot({
    path: ".impeccable/review/boost-result-mobile.png",
    fullPage: true,
  });
});

test("all desktop screens have guidance and stay within the viewport", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "home",
      "programs",
      "requests",
      "printing",
      "games",
      "obs",
      "discord",
      "live",
      "network",
      "monitor",
      "history",
      "settings",
    ]) {
      await page.goto("/#" + route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.locator("pre").count()).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route}/${width}`,
      ).toBe(true);
    }
  }
});
