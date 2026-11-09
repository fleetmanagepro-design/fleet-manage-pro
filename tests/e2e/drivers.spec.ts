import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test("accounting adds a driver with a default truck and pay rules", async ({ page }) => {
  const last = `Tester${Date.now().toString().slice(-6)}`;
  await signInAs(page, "accounting@lakesidefreight.test");
  await page.getByRole("link", { name: "Drivers" }).click();
  await page.getByRole("link", { name: "Add driver" }).click();

  await page.getByLabel("First name").fill("Ana");
  await page.getByLabel("Last name").fill(last);
  await page.getByLabel("CDL number").fill(`x${Date.now().toString().slice(-8)}`);
  await page.getByRole("button", { name: "Add driver" }).click();
  await expect(page.getByText("Choose the state that issued the CDL")).toBeVisible();

  await page.getByLabel("CDL state").selectOption("IN");
  await page.getByLabel("Class").selectOption("A");
  await page.getByLabel("CDL expires").fill(inDays(45));
  await page.getByLabel("Medical card expires").fill(inDays(400));
  await page.getByLabel("Default truck").selectOption({ label: "110" });
  await page.getByRole("button", { name: "Add driver" }).click();

  await expect(page.getByRole("heading", { name: new RegExp(`Ana ${last}`) })).toBeVisible();
  await expect(page.getByTestId("compliance-cdl")).toContainText("Due in 45 days");
  await expect(page.getByText("No pay rule yet.")).toBeVisible();

  // Pay rule in effect from today (the form defaults to today in the company's time zone)
  const today = await page.getByLabel("Effective from").inputValue();
  const later = new Date(Date.parse(`${today}T12:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Rate per mile (USD)").fill("0.60");
  await page.getByLabel("Stop pay per extra stop (USD, optional)").fill("50");
  await page.getByRole("button", { name: "Add pay rule" }).click();
  await expect(page.getByText("Pay rule added.")).toBeVisible();
  await expect(page.getByText("$0.60/mi on loaded miles")).toBeVisible();

  // An upcoming percent rule can be removed; the current one can't
  await page.getByLabel("Pay type").selectOption("percent");
  await page.getByLabel("Effective from").fill(later);
  await page.getByLabel("Percent").fill("70");
  await page.getByRole("button", { name: "Add pay rule" }).click();
  await expect(page.getByText("70% of linehaul + fuel surcharge")).toBeVisible();
  await expect(page.getByTestId(`pay-rule-${later}`)).toContainText("Upcoming");
  await expect(page.getByTestId(`pay-rule-${today}`).getByRole("button", { name: "Remove" })).toHaveCount(0);

  page.once("dialog", (d) => d.accept());
  await page.getByTestId(`pay-rule-${later}`).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId(`pay-rule-${later}`)).toHaveCount(0);

  // The truck shows its driver
  await page.getByRole("link", { name: "110" }).filter({ visible: true }).click();
  await expect(page.getByRole("link", { name: `Ana ${last}` })).toBeVisible();
});

test("dispatcher sees drivers but never pay", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/drivers");
  await expect(page.getByRole("link", { name: "Add driver" })).toHaveCount(0);
  // seed: Robert Hill's CDL is due within 30 days, William Hayes's has expired
  await expect(page.getByTestId("driver-Hill-Robert")).toContainText("Due soon");
  await expect(page.getByTestId("driver-Hayes-William")).toContainText("Expired");

  await page.getByTestId("driver-Carter-James").getByRole("link", { name: "James Carter" }).click();
  await expect(page.getByRole("heading", { name: /James Carter/ })).toBeVisible();
  await expect(page.getByText("Pay", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/\/mi on/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);

  await page.goto("/drivers");
  await page.getByTestId("driver-Hayes-William").getByRole("link", { name: "William Hayes" }).click();
  await expect(page.getByText("Can't be dispatched until renewed")).toBeVisible();
});

test("viewer has no access to drivers", async ({ page }) => {
  await signInAs(page, "viewer@lakesidefreight.test");
  await expect(page.getByRole("link", { name: "Drivers" })).toHaveCount(0);
  await page.goto("/drivers");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("owner sees current and upcoming pay for a driver with a raise scheduled", async ({ page }) => {
  await signInAs(page, "owner@lakesidefreight.test");
  await page.goto("/drivers");
  await page.getByTestId("driver-Carter-James").getByRole("link", { name: "James Carter" }).click();
  await expect(page.getByText("$0.58/mi on loaded miles")).toBeVisible();
  await expect(page.getByText("$0.60/mi on loaded miles")).toBeVisible();
  await expect(page.getByText("Annual raise")).toBeVisible();
});
