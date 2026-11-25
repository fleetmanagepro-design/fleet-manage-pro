import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

test("owner sees revenue, miles, pay and lists for the chosen period", async ({ page }) => {
  await signInAs(page, "owner@lakesidefreight.test");
  await page.goto("/dashboard?period=year");
  await expect(page.getByTestId("dashboard-period")).toContainText("This year");
  await expect(page.getByTestId("tile-revenue")).toHaveText(/^\$[\d,]+\.\d{2}$/);
  await expect(page.getByTestId("tile-loads")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("tile-rpm")).toHaveText(/\/mi$/);
  await expect(page.getByTestId("tile-pay")).toBeVisible();
  // contribution = revenue − driver pay
  const cents = async (id: string) => Math.round(Number((await page.getByTestId(id).innerText()).replace(/[$,]/g, "")) * 100);
  expect(await cents("tile-contribution")).toBe((await cents("tile-revenue")) - (await cents("tile-pay")));

  // revenue chart with a hover tooltip and a table view
  const chart = page.getByRole("img", { name: /Revenue, 12 bars/ });
  await expect(chart).toBeVisible();
  await page.getByText("Show as table").click();
  await expect(page.getByRole("cell", { name: "Jan 26" })).toBeVisible();

  // open loads by status, linked to the list
  await expect(page.getByTestId("bar-in_transit")).toContainText("1");
  await expect(page.getByTestId("in-progress")).toContainText("Load 1061");
  await expect(page.getByTestId("unassigned")).toContainText("Load 1065");
  await expect(page.getByTestId("expiring-list")).toContainText("William Hayes · CDL");

  // custom period
  await page.getByLabel("Period from").fill("2026-01-01");
  await page.getByLabel("Period to").fill("2026-01-31");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByTestId("dashboard-period").filter({ visible: true })).toContainText("Custom · 01/01/2026 – 01/31/2026");
});

test("viewers see no pay on the dashboard", async ({ page }) => {
  await signInAs(page, "viewer@lakesidefreight.test");
  await page.goto("/dashboard");
  await expect(page.getByTestId("tile-revenue")).toBeVisible();
  await expect(page.getByTestId("tile-pay")).toHaveCount(0);
  await expect(page.getByTestId("tile-contribution")).toHaveCount(0);
  // viewers don't see drivers, so no CDL / medical items either
  await expect(page.getByText("William Hayes · CDL")).toHaveCount(0);
});
