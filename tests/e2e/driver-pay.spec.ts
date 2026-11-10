import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

test("owner-operator pay on a load: value − company fee + driver extras", async ({ page }) => {
  await signInAs(page, "accounting@lakesidefreight.test");
  await page.goto("/loads");
  // seed: load 1010 on truck 111 (Richard Long, owner-operator keeping 88%), $980.50 + $200 on-time bonus
  await page.getByTestId("load-1010").getByRole("link", { name: "1010" }).click();
  await expect(page.getByTestId("load-revenue")).toHaveText("$1,180.50");

  const pay = page.getByTestId("driver-pay-Long");
  await expect(pay).toContainText("Owner-operator · 12% company fee (keeps 88% of load value)");
  await expect(pay).toContainText("-$141.66");
  await expect(pay).toContainText("$1,038.84");
  await expect(page.getByTestId("load-contribution")).toHaveText("$141.66");

  // He unloaded the trailer himself: +$100, no fee
  await page.getByLabel("For", { exact: true }).fill("Unloaded the trailer");
  await page.getByLabel("Pay to driver (USD)").fill("100");
  await page.getByRole("button", { name: "Add driver extra" }).click();
  await expect(pay).toContainText("$1,138.84");
  await expect(page.getByTestId("load-contribution")).toHaveText("$41.66");
});

test("a late penalty reduces the load value and the owner's share", async ({ page }) => {
  await signInAs(page, "owner@lakesidefreight.test");
  await page.goto("/loads");
  await page.getByTestId("load-1011").getByRole("link", { name: "1011" }).click(); // truck 112, Susan Coleman (owner-op)
  const before = await page.getByTestId("load-revenue").innerText();
  await page.getByLabel("Type", { exact: true }).selectOption("late_penalty");
  await page.getByLabel("Amount (USD)").fill("200");
  await page.getByRole("button", { name: "Add accessorial" }).click();
  const cents = (t: string) => Math.round(Number(t.replace(/[$,]/g, "")) * 100);
  await expect(page.getByTestId("load-revenue")).not.toHaveText(before);
  expect(cents(await page.getByTestId("load-revenue").innerText())).toBe(cents(before) - 20000);
  await expect(page.getByTestId("accessorial-late_penalty")).toContainText("-$200.00");
});

test("company driver pay per mile; deductions are managed on the driver", async ({ page }) => {
  await signInAs(page, "admin@lakesidefreight.test");
  await page.goto("/loads");
  await page.getByTestId("load-1012").getByRole("link", { name: "1012" }).click(); // truck 101, James Carter, company driver
  await expect(page.getByTestId("driver-pay-Carter")).toContainText("Company driver");
  await expect(page.getByTestId("driver-pay-Carter")).toContainText(/mi × \$0\.5[58]/);

  await page.goto("/drivers");
  await page.getByTestId("driver-Long-Richard").getByRole("link", { name: "Richard Long" }).click();
  await expect(page.getByTestId("deduction-Truck rent")).toContainText("10% of gross");
  await expect(page.getByTestId("deduction-Trailer rent")).toContainText("$250.00 / week");

  await page.getByLabel("Deduction", { exact: true }).fill("Fuel card fee");
  await page.getByLabel("Calculated as").selectOption("fixed_weekly");
  await page.getByLabel("USD / week").fill("15");
  await page.getByRole("button", { name: "Add deduction" }).click();
  await expect(page.getByTestId("deduction-Fuel card fee")).toContainText("$15.00 / week");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "End Fuel card fee" }).click();
  await expect(page.getByRole("button", { name: "End Fuel card fee" })).toHaveCount(0);
});

test("dispatchers see driver extras but not pay", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/loads");
  await page.getByTestId("load-1010").getByRole("link", { name: "1010" }).click();
  await expect(page.getByText("Driver pay and contribution are visible to owners, admins and accounting.")).toBeVisible();
  await expect(page.getByTestId("load-contribution")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add driver extra" })).toBeVisible();
});
