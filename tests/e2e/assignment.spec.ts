import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

test("a driver has a default truck and trailer", async ({ page }) => {
  await signInAs(page, "accounting@lakesidefreight.test");
  await page.goto("/drivers");
  await page.getByTestId("driver-Brooks-Linda").getByRole("link", { name: "Linda Brooks" }).click();
  await expect(page.getByText("Default trailer")).toBeVisible();
  await expect(page.getByRole("link", { name: "5304", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Default trailer").locator("option:checked")).toHaveText(/^5304/);
});

test("on a load, picking the driver fills their truck and trailer", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/loads/new");
  // Assignment comes before the stops now
  const top = async (name: string) => (await page.getByRole("heading", { name, exact: true }).filter({ visible: true }).boundingBox())!.y;
  expect(await top("Assignment")).toBeLessThan(await top("Stops"));

  await page.getByLabel("Driver", { exact: true }).selectOption({ label: "Linda Brooks" });
  await expect(page.getByLabel("Truck", { exact: true }).locator("option:checked")).toHaveText(/^104/);
  await expect(page.getByLabel("Trailer", { exact: true }).locator("option:checked")).toHaveText(/^5304/);

  // Another driver swaps the equipment; a trailer picked by hand stays
  await page.getByLabel("Trailer", { exact: true }).selectOption({ label: "5310 · dry van" });
  await page.getByLabel("Driver", { exact: true }).selectOption({ label: "David Foster" });
  await expect(page.getByLabel("Truck", { exact: true }).locator("option:checked")).toHaveText(/^107/);
  await expect(page.getByLabel("Trailer", { exact: true }).locator("option:checked")).toHaveText("5310 · dry van");
});
