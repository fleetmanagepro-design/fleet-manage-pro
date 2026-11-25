import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

test("one search box finds loads, drivers, trucks and customers", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  const box = page.getByRole("combobox", { name: "Search" });

  await box.fill("1010");
  await expect(page.getByTestId("search-group-load")).toContainText("Load 1010");
  await page.getByRole("option", { name: /Load 1010/ }).click();
  await expect(page.getByRole("heading", { name: /Load 1010/ })).toBeVisible();

  // Every word counts: "james car" → James Carter
  await box.fill("james car");
  await expect(page.getByTestId("search-group-driver")).toContainText("James Carter");

  // Keyboard: "/" focuses, Enter opens the first hit
  await box.fill("");
  await page.getByRole("heading", { name: /Load 1010/ }).click();
  await page.keyboard.press("/");
  await expect(box).toBeFocused();
  await page.keyboard.type("Northline");
  await expect(page.getByTestId("search-group-customer")).toContainText("Northline Freight Brokerage");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Northline Freight Brokerage/ })).toBeVisible();

  // Trucks by unit number; loads by a stop's city
  await box.fill("111");
  await expect(page.getByTestId("search-group-truck")).toContainText("Truck 111");
  await box.fill("Paducah");
  await expect(page.getByText("Nothing found.")).toBeVisible();
  await box.fill("Joliet");
  await expect(page.getByTestId("search-group-load")).toContainText("Joliet, IL");
});

test("viewers don't find drivers", async ({ page }) => {
  await signInAs(page, "viewer@lakesidefreight.test");
  await page.getByRole("combobox", { name: "Search" }).fill("Carter");
  await expect(page.getByText("Nothing found.")).toBeVisible();
  await expect(page.getByTestId("search-group-driver")).toHaveCount(0);
});
