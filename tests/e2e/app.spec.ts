import { test, expect } from "@playwright/test";
test("preview never applies a system plan", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quick Boost", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Planejar a otimização" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Usar preset offline" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Abra o aplicativo desktop",
  );
});
test("responsive layout", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Um bom setup começa aqui." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.impeccable/review/${width === 1440 ? "desktop" : "mobile"}.png`,
      fullPage: true,
    });
  }
});

test("module boundaries and manual Discord checklist", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Jogos", "Rede"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page
      .getByRole("button", {
        name: name === "Jogos" ? "Detectar jogos" : "Testar conectividade",
      })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Disponível no aplicativo desktop",
    );
  }
  await page.getByRole("button", { name: "Streaming", exact: true }).click();
  await page
    .getByRole("button", { name: "Conectar e autenticar no OBS" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Abra o aplicativo desktop",
  );
  await page.getByRole("button", { name: "Discord", exact: true }).click();
  await page.getByRole("checkbox").first().check();
  await expect(page.getByRole("status")).toContainText("1 de 5");
});
test("diagnostic report renders fixture with missing sensors honestly", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gameforge.onboarding.v1", "done");
    Object.defineProperty(window, "isTauri", { value: true });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd !== "diagnose") throw new Error("Unexpected command");
          return {
            os: "Windows fixture",
            arch: "x86_64",
            cpu: "CPU fixture",
            logical_cores: 8,
            memory_gb: 16,
            memory_used_gb: 8,
            cpu_usage: 25,
            disks: [
              {
                name: "Fixture disk",
                total_gb: 100,
                available_gb: 50,
                kind: "SSD",
              },
            ],
            processes: [],
            sensors: [],
            warnings: ["Fixture test"],
            source: "test fixture",
          };
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Analisar computador" }).click();
  await expect(
    page.getByRole("heading", { name: "Dados coletados" }),
  ).toBeVisible();
  await expect(
    page.getByText("Nenhum sensor disponível por esta API."),
  ).toBeVisible();
  await expect(page.getByText("CPU fixture", { exact: true })).toBeVisible();
});

test("offline review requires a separate approval before system apply", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const plan = {
      summary: "Fixture local",
      system_actions: ["enable_game_mode", "high_performance_power"],
      video: { width: 1280, height: 720, fps: 30, bitrate: 3500 },
      provider: "offline",
      model: "test fixture",
      warnings: [],
    };
    localStorage.setItem("gameforge.onboarding.v1", "done");
    Object.defineProperty(window, "isTauri", { value: true });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args: Record<string, unknown>) => {
          if (cmd === "offline_plan") return plan;
          if (cmd === "prepare_system") {
            if (
              JSON.stringify(args.actions) !==
              JSON.stringify(["enable_game_mode"])
            )
              throw new Error("Advanced action was selected without consent");
            return {
              id: "1",
              kind: "system",
              status: "approved",
              summary: "Fixture",
              payload: { before: { fixture: null }, after: { fixture: 1 } },
            };
          }
          if (cmd === "apply_system")
            return {
              id: "1",
              kind: "system",
              status: "applied",
              summary: "Fixture",
              payload: {},
            };
          throw new Error("Unexpected command " + cmd);
        },
      },
    });
  });
  await page.goto("/#boost");
  await page.getByRole("button", { name: "Usar preset offline" }).click();
  await expect(
    page.getByLabel("Plano de energia Alto desempenho", { exact: false }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Revisar valores antes de aplicar" })
    .click();
  await expect(
    page.getByRole("button", { name: "Aprovar e aplicar no Windows (UAC)" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aprovar e aplicar no Windows (UAC)" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Ajustes aplicados e verificados",
  );
});
test("streaming targets have separate credentials and require review", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gameforge.onboarding.v1", "done");
    Object.defineProperty(window, "isTauri", { value: true });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "secret_status") return ["stream_key_twitch"];
          if (cmd === "obs_connect")
            return {
              version: "fixture",
              profile: "Original",
              streaming: false,
              recording: false,
              width: 1280,
              height: 720,
              fps: 30,
            };
          if (cmd === "obs_configure")
            return {
              id: "2",
              kind: "obs",
              status: "applied",
              summary: "Fixture",
              payload: {},
            };
          throw new Error(cmd);
        },
      },
    });
  });
  await page.goto("/#obs");
  await page
    .getByRole("button", { name: "Conectar e autenticar no OBS" })
    .click();
  await page
    .getByLabel("URL do servidor (sem a chave)", { exact: true })
    .fill("rtmp://fixture.example/app");
  const apply = page.getByRole("button", {
    name: "Criar e configurar perfil no OBS",
  });
  await expect(apply).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(apply).toBeEnabled();
  await page.getByLabel("Plataforma", { exact: true }).selectOption("kick");
  await expect(apply).toBeDisabled();
});

test("connection forms stay within the viewport", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["boost", "obs", "settings"]) {
      await page.goto("/#" + route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.impeccable/review/${route}-${width}.png`,
        fullPage: true,
      });
    }
  }
});

test("first opening explains how to continue", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("gameforge.onboarding.v1");
    Object.defineProperty(window, "isTauri", { value: true });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bem-vindo ao GameForge AI" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Começar pelo diagnóstico" }).click();
  await expect(
    page.getByRole("heading", { name: "Um bom setup começa aqui." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("gameforge.onboarding.v1")),
  ).toBe("done");
});
test("program inventory opens a goal questionnaire without automatic changes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gameforge.onboarding.v1", "done");
    Object.defineProperty(window, "isTauri", { value: true });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "list_programs")
            return {
              apps: [
                {
                  id: "fixture",
                  name: "OBS Studio",
                  version: "fixture",
                  publisher: "Fixture",
                  source: "fixture",
                  adapter: "obs",
                },
              ],
              warnings: ["Fixture inventory"],
            };
          if (cmd === "create_workflow")
            return {
              id: "123",
              kind: "workflow",
              status: "questions",
              summary: "Fixture request",
              payload: {},
            };
          throw new Error("Unexpected operation " + cmd);
        },
      },
    });
  });
  await page.goto("/#programs");
  await page.getByRole("button", { name: "Ler programas instalados" }).click();
  await page.getByRole("button", { name: "Configurar OBS Studio" }).click();
  await expect(
    page.getByRole("heading", {
      name: "O que você quer fazer com OBS Studio?",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar objetivo e critérios de aceite" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Solicitação registrada",
  );
});

test("monitor plots CPU RAM GPU temperature and handles unavailable sensors", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gameforge.onboarding.v1", "done");
    Object.defineProperty(window, "isTauri", { value: true });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd !== "monitor_sample") throw new Error("Unexpected command");
          return {
            cpu_usage: 24,
            memory_used_gb: 8,
            memory_total_gb: 16,
            timestamp_ms: Date.now(),
            per_core_usage: [20, 28],
            cpu_frequency_mhz: 4200,
            swap_used_gb: 1,
            swap_total_gb: 8,
            uptime_seconds: 3600,
            network_receive_mbps: 2,
            network_transmit_mbps: 0.5,
            disks: [
              {
                name: "Fixture volume",
                total_gb: 100,
                available_gb: 30,
                kind: "SSD",
              },
            ],
            sensors: [],
            gpus: [
              {
                name: "Fixture GPU",
                usage_percent: 40,
                temperature_c: 65,
                memory_used_mb: 1000,
                memory_total_mb: 8000,
                power_w: null,
                source: "Test fixture",
              },
            ],
            hardware_sampled_at_ms: Date.now(),
            warnings: ["Fixture CPU sensor unavailable"],
          };
        },
      },
    });
  });
  await page.goto("/#monitor");
  await page.getByRole("button", { name: "Iniciar monitor" }).click();
  await expect(
    page.getByText("Fixture GPU", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.locator(".telemetry-chart path[d^='M']").first(),
  ).toBeAttached();
  await expect(page.getByText("Fixture CPU sensor unavailable")).toBeVisible();
  await expect(page.locator(".telemetry-device")).toContainText("65 °C");
  await expect(page.getByText("Fixture volume · SSD")).toBeVisible();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(page.getByText(/Monitor pausado/)).toBeVisible();
  await page.screenshot({
    path: ".impeccable/review/monitor-desktop.png",
    fullPage: true,
  });
});
