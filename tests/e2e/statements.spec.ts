import { type Page, expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

// Next keeps recently visited pages mounted but hidden; only look at the visible one.
const shown = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

const cents = (t: string) => Math.round(Number(t.replace(/[$,]/g, "")) * 100);
const usd = (c: number) => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });

test("owner-operator weekly statement: value − 12% fee − truck rent 10% of gross − trailer rent; finalize, then void", async ({ page }) => {
  await signInAs(page, "accounting@lakesidefreight.test");
  await page.goto("/loads");
  // seed: load 1022 on truck 111 (Richard Long, owner-op keeping 88%; truck rent 10%, trailer rent $250/week)
  await page.getByTestId("load-1022").getByRole("link", { name: "1022" }).click();
  const value = cents(await page.getByTestId("load-revenue").innerText());
  await page.getByTestId("driver-pay-Long").getByRole("link", { name: /Pay statement, week of/ }).click();

  await expect(page.getByRole("heading", { name: /Pay statement · Richard Long/ })).toBeVisible();
  await expect(shown(page, "statement-status")).toHaveText("Draft");
  await expect(shown(page, "statement-load")).toHaveCount(1);
  await expect(shown(page, "statement-load")).toContainText("Load 1022");
  await expect(shown(page, "statement-gross")).toHaveText(usd(value));
  const fee = Math.round(value * 0.12);
  const rent = Math.round(value * 0.1);
  await expect(page.getByTestId("statement-deduction-Truck rent")).toContainText(usd(-rent));
  await expect(page.getByTestId("statement-deduction-Trailer rent")).toContainText("-$250.00");
  const net = value - fee - rent - 25000;
  await expect(shown(page, "statement-net")).toHaveText(usd(net));

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Finalize statement" }).click();
  await expect(shown(page, "statement-status")).toHaveText("Finalized");
  await expect(shown(page, "statement-net")).toHaveText(usd(net));
  await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toBeVisible();

  const statementUrl = page.url();
  await page.goto("/drivers");
  await page.getByTestId("driver-Long-Richard").getByRole("link", { name: "Richard Long" }).click();
  const week = statementUrl.split("/").at(-1)!;
  await expect(page.getByTestId(`driver-statement-${week}`)).toContainText(usd(net));

  await page.goto(statementUrl);
  await page.getByLabel("Reason for voiding").fill("Truck rent should start next month");
  await page.getByRole("button", { name: "Void statement" }).click();
  await expect(shown(page, "statement-status")).toHaveText("Draft");
  await expect(shown(page, "voided-statement")).toContainText("Truck rent should start next month");
  await expect(page.getByRole("button", { name: "Finalize statement" })).toBeVisible();
});

test("a week with no loads goes negative and the debt is carried into the next week", async ({ page }) => {
  await signInAs(page, "owner@lakesidefreight.test");
  await page.goto("/statements"); // last week
  await page.getByRole("link", { name: "← Previous week" }).click();
  await expect(page.getByTestId("pay-row-Coleman")).toBeVisible();
  // Susan Coleman has no loads in these weeks; Insurance & ELD is $175/week
  await expect(page.getByTestId("pay-row-Coleman").getByTestId("pay-net")).toHaveText("-$175.00");
  await page.getByTestId("pay-row-Coleman").getByRole("link", { name: "Susan Coleman" }).click();
  await expect(shown(page, "statement-debt-note")).toContainText("$175.00 balance is carried into the next statement");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Finalize statement" }).click();
  await expect(shown(page, "statement-status")).toHaveText("Finalized");
  const finalizedUrl = page.url();

  await page.getByRole("link", { name: "Week →" }).click();
  await expect(shown(page, "statement-status")).toHaveText("Draft");
  await expect(shown(page, "statement-carryover")).toContainText("-$175.00");
  await expect(shown(page, "statement-net")).toHaveText("-$350.00");

  // the earlier week can't be finalized out of order, and voiding undoes the carry
  await page.goto(finalizedUrl);
  await page.getByLabel("Reason for voiding").fill("Test run");
  await page.getByRole("button", { name: "Void statement" }).click();
  await expect(shown(page, "statement-status")).toHaveText("Draft");
});

test("dispatchers never see driver pay statements", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await expect(page.getByRole("link", { name: "Driver pay" })).toHaveCount(0);
  await page.goto("/statements");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByTestId("pay-week")).toHaveCount(0);
});
