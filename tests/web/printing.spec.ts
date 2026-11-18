import { test, expect } from "@playwright/test";
test("website explains printing and directs the customer to desktop downloads", async ({
  page,
}) => {
  await page.goto("/impressao-3d");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "No seu computador",
  );
  await expect(
    page.getByRole("link", { name: "Baixar aplicativo", exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Analisar arquivo STL")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Analisar com IA" }),
  ).toHaveCount(0);
});
test("public feature page fits mobile and does not offer operational tools", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/impressao-3d");
  await expect(
    page.getByText("STL e presets permanecem no computador.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});
test("browser AI routes are closed while desktop routes require a licensed device", async ({
  request,
}) => {
  for (const path of ["/api/ai/estimate", "/api/account/printing/ai"]) {
    const response = await request.post(path, {
      headers: { Origin: "http://127.0.0.1:8080" },
      data: {},
    });
    expect(response.status()).toBe(410);
  }
  const response = await request.post("/api/desktop/ai/estimate", {
    headers: { Origin: "http://127.0.0.1:8080" },
    data: {},
  });
  expect(response.status()).toBe(401);
});
