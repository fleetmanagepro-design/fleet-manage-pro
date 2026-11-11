import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

test("a ZIP code fills city, state and time zone; saved facilities fill the whole stop", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/loads/new");
  const stop1 = page.getByTestId("stop-1");
  const stop2 = page.getByTestId("stop-2");

  // Paducah, KY is Central even though most of Kentucky is Eastern
  await stop1.getByLabel("ZIP").fill("42001");
  await expect(stop1.getByLabel("City")).toHaveValue("Paducah");
  await expect(stop1.getByLabel("State")).toHaveValue("KY");
  await expect(stop1.getByLabel("Local time zone")).toHaveValue("America/Chicago");
  await expect(stop1.getByText("City, state and time zone filled in from the ZIP.")).toBeVisible();
  await expect(stop1.getByText("KY has two time zones — check this one.")).toBeVisible();

  await stop1.getByLabel("ZIP").fill("00000");
  await expect(stop1.getByText("ZIP not in our list — enter the city and state.")).toBeVisible();

  // seed: "Dallas Warehouse" was used on earlier loads
  await stop2.getByLabel("Facility").fill("dallas ware");
  await stop2.getByRole("option", { name: /Dallas Warehouse/ }).click();
  await expect(stop2.getByLabel("Facility")).toHaveValue("Dallas Warehouse");
  await expect(stop2.getByLabel("City")).toHaveValue("Dallas");
  await expect(stop2.getByLabel("State")).toHaveValue("TX");
  await expect(stop2.getByLabel("Local time zone")).toHaveValue("America/Chicago");
});

test("a new facility is remembered for the next load", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/loads/new");
  await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Blue Prairie Logistics" });
  await page.getByLabel("Linehaul (USD)").fill("1200");
  const name = `Kroger DC ${Date.now() % 100000}`;
  const stop1 = page.getByTestId("stop-1");
  await stop1.getByLabel("Facility").fill(name);
  await stop1.getByLabel("Address").fill("2525 Cottonwood Dr");
  await stop1.getByLabel("ZIP").fill("46168");
  await expect(stop1.getByLabel("City")).toHaveValue("Plainfield");
  const stop2 = page.getByTestId("stop-2");
  await stop2.getByLabel("ZIP").fill("60439");
  await expect(stop2.getByLabel("City")).toHaveValue("Lemont");
  await page.getByRole("button", { name: "Create load" }).click();
  await expect(page.getByRole("heading", { name: /Load \d+/ })).toBeVisible();

  await page.goto("/loads/new");
  const next = page.getByTestId("stop-1").filter({ visible: true });
  await next.getByLabel("Facility").fill(name.slice(0, 9));
  await next.getByRole("option", { name: new RegExp(name) }).click();
  await expect(next.getByLabel("Address")).toHaveValue("2525 Cottonwood Dr");
  await expect(next.getByLabel("ZIP")).toHaveValue("46168");
  await expect(next.getByLabel("City")).toHaveValue("Plainfield");
  await expect(next.getByLabel("Local time zone")).toHaveValue("America/Indiana/Indianapolis");
});
