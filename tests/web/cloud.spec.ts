import { test, expect } from "@playwright/test";
test("public site renders 3D, prices, responsive navigation and reduced motion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Seu setup.",
    );
    await expect(
      page.getByRole("heading", { name: "Core", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".hero-canvas canvas")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.impeccable/review/web-public-${width}.png`,
      fullPage: width === 390,
    });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".hero-canvas canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
test("account registration, credits, download, password and logout work with real API", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/cadastro");
  await page.getByLabel("Seu nome").fill("Teste GameForge");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("web-" + Date.now() + "@example.test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("fixture-user-password-123");
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Planos" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Escolher Core" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Seu próximo play/ }),
  ).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/web-user-desktop.png" });
  await page.getByRole("link", { name: "Créditos de IA", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Extrato de créditos" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Baixar aplicativo", exact: true })
    .click();
  await expect(
    page.getByText(
      "O instalador desta versão ainda não foi publicado pelo operador.",
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Minha conta", exact: true }).click();
  await page
    .getByLabel("Senha atual", { exact: true })
    .fill("fixture-user-password-123");
  await page
    .getByLabel("Nova senha", { exact: true })
    .fill("fixture-changed-password-456");
  await page.getByRole("button", { name: "Atualizar senha" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Senha atualizada" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .getByRole("link", { name: "Chaves e dispositivos", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/web-user-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Seu setup.",
  );
  expect(errors).toEqual([]);
});
test("admin login, catalogue edits, manual keys, commercial settings and integrations work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin/login");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@example.test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("fixture-admin-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Atividade recente" }),
  ).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/web-admin-desktop.png" });
  await page.getByRole("link", { name: "Planos e preços" }).click();
  await page.getByRole("button", { name: "Editar plano" }).first().click();
  await page.getByLabel("Nome", { exact: true }).fill("Core Teste");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    page.getByRole("table").getByText("Core Teste", { exact: true }),
  ).toBeVisible();
  const publicResponse = await page.request.get("/api/public");
  expect((await publicResponse.json()).plans[0].name).toBe("Core Teste");
  await page.getByRole("button", { name: "Editar plano" }).first().click();
  await page.getByLabel("Nome", { exact: true }).fill("Core");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    page.getByRole("table").getByText("Core", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Licenças", exact: true }).click();
  await page
    .getByRole("button", { name: "Criar licença", exact: true })
    .click();
  await page.getByLabel("Validade em dias").fill("5");
  await page.getByRole("button", { name: "Criar e revelar chave" }).click();
  await expect(
    page.getByRole("heading", { name: "Guarde sua chave agora" }),
  ).toBeVisible();
  await expect(page.locator(".secret code")).toHaveText(
    /^GF_[A-Za-z0-9_-]{43}$/,
  );
  await page.getByRole("button", { name: "Já guardei minha chave" }).click();
  await page.getByRole("link", { name: "Créditos e margem" }).click();
  await expect(
    page.getByRole("heading", { name: "Política de margem" }),
  ).toBeVisible();
  await expect(page.getByRole("table").first()).toContainText("359,90");
  await page.getByRole("link", { name: "Integrações", exact: true }).click();
  await expect(
    page.getByLabel("GAMEFORGE_LICENSE_PUBLIC_KEY_B64"),
  ).not.toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/web-admin-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
