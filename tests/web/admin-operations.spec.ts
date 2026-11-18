import { test, expect } from "@playwright/test";
test("admin manages manual access, credit balance and write-only payment settings", async ({
  page,
  playwright,
  baseURL,
}) => {
  const account = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL! },
  });
  const email = "operator-" + Date.now() + "@example.test";
  expect(
    (
      await account.post("/api/auth/register", {
        data: {
          email,
          name: "Operator fixture",
          password: "fixture-operator-password-123",
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/admin/login");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@example.test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("fixture-admin-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("link", { name: "Usuários", exact: true }).click();
  await page.getByPlaceholder("Buscar por conta, ID ou estado").fill(email);
  const row = page.getByRole("row").filter({ hasText: email });
  await row.getByRole("button", { name: "Gerenciar", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Créditos a conceder uma vez").fill("25");
  await modal.getByLabel("Validade a partir de hoje (dias)").fill("5");
  await modal.getByRole("button", { name: "Conceder assinatura" }).click();
  await expect(
    modal.getByRole("heading", { name: "Editar assinatura manual" }),
  ).toBeVisible();
  await expect(
    modal.getByRole("heading", { name: "Créditos · saldo 25" }),
  ).toBeVisible();
  await modal
    .getByLabel("Ajuste de créditos (negativo para remover)")
    .fill("5");
  await modal
    .getByLabel("Motivo do ajuste")
    .fill("Homologação da interface de créditos");
  await modal.getByRole("button", { name: "Aplicar ajuste de saldo" }).click();
  await expect(
    modal.getByRole("heading", { name: "Créditos · saldo 30" }),
  ).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await modal.getByRole("button", { name: "Remover concessão" }).click();
  await expect(
    modal.getByRole("heading", { name: "Atribuir assinatura manual" }),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Fechar", exact: true }).click();
  await row.getByRole("button", { name: "Bloquear", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Bloquear", exact: true })
    .click();
  await expect(row).toContainText("Bloqueado");
  expect((await (await account.get("/api/me")).json()).user).toBeNull();
  await row.getByRole("button", { name: "Gerenciar", exact: true }).click();
  page.once("dialog", (d) => void d.accept());
  await modal
    .getByRole("button", { name: "Remover acesso do usuário" })
    .click();
  await expect(modal).toHaveCount(0);
  await page.getByRole("link", { name: "Integrações", exact: true }).click();
  await page
    .getByLabel("Access token Mercado Pago", { exact: true })
    .fill("fixture-mp-ui-token-123456789");
  await page
    .getByLabel("Segredo de assinatura do webhook")
    .fill("fixture-mp-ui-webhook-123456789");
  await page.getByLabel("ID do vendedor (collector ID)").fill("123");
  await page.getByRole("button", { name: "Salvar Mercado Pago" }).click();
  await expect(
    page.getByLabel("Access token Mercado Pago", { exact: true }),
  ).toBeEmpty();
  await expect(
    page.getByLabel("Access token Mercado Pago", { exact: true }),
  ).toHaveAttribute("placeholder", /configurado/);
  await expect(page.getByLabel("URL do webhook", { exact: true })).toHaveValue(
    baseURL + "/api/webhooks/mercadopago",
  );
  await page
    .getByRole("button", {
      name: "Restaurar configuração anterior",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Access token Mercado Pago", { exact: true }),
  ).toHaveAttribute("placeholder", "Cole o access token");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/admin-payment-settings.png",
    fullPage: true,
  });
  await account.dispose();
});
