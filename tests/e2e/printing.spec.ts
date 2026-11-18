import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { orientedStl } from "../../packages/printing/src/mesh";
function fixtureStl() {
  const v = [
      [0, 0, 0],
      [20, 0, 0],
      [20, 10, 0],
      [0, 10, 0],
      [0, 0, 5],
      [20, 0, 5],
      [20, 10, 5],
      [0, 10, 5],
    ],
    f = [
      [0, 2, 1],
      [0, 3, 2],
      [4, 5, 6],
      [4, 6, 7],
      [0, 1, 5],
      [0, 5, 4],
      [1, 2, 6],
      [1, 6, 5],
      [2, 3, 7],
      [2, 7, 6],
      [3, 0, 4],
      [3, 4, 7],
    ];
  return Buffer.from(
    orientedStl(
      new Float32Array(f.flatMap((a) => a.flatMap((i) => v[i]))),
      [0, 0, 0],
    ),
  );
}
test("desktop STL and reviewed preset copy work locally without uploads", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#printing");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Impressão 3D",
  );
  await page.getByLabel("Marca da impressora").selectOption("Creality");
  await page.getByLabel("Modelo da impressora").fill("Fixture K1");
  await page.getByLabel("Analisar arquivo STL").setInputFiles({
    name: "fixture-box.stl",
    mimeType: "application/octet-stream",
    buffer: fixtureStl(),
  });
  await expect(page.getByText("1 cm³", { exact: true })).toBeVisible();
  await expect(page.locator(".print-model-canvas canvas")).toBeVisible();
  await page.getByLabel("Orientação da cópia STL").selectOption("1");
  await expect(page.getByText("20 × 5 × 10 mm", { exact: true })).toBeVisible();
  await page.getByLabel(/Conferi os limites/).check();
  await page.getByRole("button", { name: "Planejar localmente" }).click();
  await expect(
    page.getByRole("heading", { name: "Perfil FDM proposto para revisão" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Baixar relatório JSON" }),
  ).toBeDisabled();
  await page.getByLabel(/Revisei os parâmetros/).check();
  const original = {
    type: "process",
    name: "Fixture Duplicated",
    layer_height: ".2",
    outer_wall_speed: ["120"],
    machine_start_gcode: "G28",
    inherits: "Fixture Base",
  };
  await page
    .getByLabel("Preset original exportado (cópia)", { exact: true })
    .setInputFiles({
      name: "fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(original)),
    });
  await page.getByLabel(/Dupliquei o preset/).check();
  await page
    .getByRole("button", { name: "Revisar alterações no arquivo" })
    .click();
  await expect(
    page.getByText("outer_wall_speed", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar cópia do preset", exact: true })
    .click();
  const file = await download;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.outer_wall_speed).toEqual(["33.8"]);
  expect(data.machine_start_gcode).toBe("G28");
  expect(data.name).toBe(original.name);
  await page.screenshot({
    path: ".impeccable/review/printing-fdm-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("resin keeps calibrated values, shows guided limits and supports mobile/PreForm", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#printing");
  await page.getByLabel("Tecnologia", { exact: true }).selectOption("resin");
  await page.getByLabel("Marca da impressora").selectOption("Elegoo");
  await page.getByLabel("Modelo da impressora").fill("Saturn fixture");
  await page
    .getByLabel("Material e fabricante")
    .fill("Fixture calibrated resin");
  await page.getByLabel(/A exposição foi calibrada/).check();
  await page.getByLabel(/Conferi os limites/).check();
  await page.getByRole("button", { name: "Planejar localmente" }).click();
  await expect(
    page.getByRole("heading", { name: "Revisão de processo para resina" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Aplicação guiada no seu fatiador" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Baixar cópia do preset", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/printing-resin-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Fatiador", { exact: true }).selectOption("preform");
  await page.getByRole("button", { name: "Planejar localmente" }).click();
  await expect(
    page.getByRole("heading", { name: "Revisão de processo para resina" }),
  ).toBeVisible();
  await expect(page.locator(".print-result table")).toHaveCount(0);
  expect(errors).toEqual([]);
});
