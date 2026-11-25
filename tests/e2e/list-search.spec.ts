import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

const searchList = async (page: import("@playwright/test").Page, text: string) => {
  const box = page.getByRole("searchbox", { name: "Search this list" });
  await box.fill(text);
  await box.press("Enter");
};

test("every list has its own search", async ({ page }) => {
  await signInAs(page, "admin@lakesidefreight.test");

  await page.goto("/trucks");
  await searchList(page, "Kenworth");
  await expect(page).toHaveURL(/q=Kenworth/);
  const truckRows = page.getByRole("row").filter({ hasText: "Kenworth" });
  await expect(truckRows.first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Freightliner" })).toHaveCount(0);
  await searchList(page, "zzzz");
  await expect(page.getByText("No trucks match these filters.")).toBeVisible();

  await page.goto("/trailers");
  await searchList(page, "reefer");
  await expect(page.getByRole("row").filter({ hasText: "Reefer" }).first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Dry van" })).toHaveCount(0);

  await page.goto("/drivers");
  await searchList(page, "james car");
  await expect(page.getByTestId("driver-Carter-James")).toBeVisible();
  await expect(page.getByTestId("driver-Gonzalez-Maria")).toHaveCount(0);

  await page.goto("/loads");
  await searchList(page, "1010");
  await expect(page.getByTestId("load-1010")).toBeVisible();
  await expect(page.getByTestId("load-1011")).toHaveCount(0);
  await searchList(page, "Joliet");
  await expect(page.getByTestId("load-1010")).toBeVisible(); // lane Joliet → Columbus

  await page.goto("/customers");
  await page.getByLabel("Search customers").fill("Northline");
  await page.getByLabel("Search customers").press("Enter");
  await expect(page.getByRole("link", { name: "Northline Freight Brokerage" })).toBeVisible();
});

test("the dispatch board narrows to a truck, driver or load", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/dispatch");
  const search = page.getByRole("searchbox", { name: "Search the board" });
  await search.fill("Carter");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=Carter/);
  await expect(page.getByTestId("board-truck-101")).toBeVisible();
  await expect(page.getByTestId("board-truck-102")).toHaveCount(0);
  await expect(page.getByText("No unassigned loads match the search.")).toBeVisible();
  // the search stays when moving between weeks
  await page.getByRole("link", { name: "Next week →" }).click();
  await expect(page).toHaveURL(/q=Carter/);
  await expect(page.getByRole("searchbox", { name: "Search the board" }).filter({ visible: true })).toHaveValue("Carter");
});
