import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

test("Back returns to the list as it was, or to the list when opened directly", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/trucks?q=101");
  await page.getByRole("link", { name: "101", exact: true }).first().click();
  await expect(page).toHaveURL(/\/trucks\/[0-9a-f-]+$/);
  await page.getByRole("link", { name: "← Back" }).click();
  await expect(page).toHaveURL(/\/trucks\?q=101$/); // the search is kept

  // A detail page opened in a fresh tab has nothing to go back to: Back goes to its list.
  const truckUrl = await page.getByRole("link", { name: "101", exact: true }).first().getAttribute("href");
  const fresh = await page.context().newPage();
  await fresh.goto(new URL(truckUrl!, page.url()).toString());
  await fresh.getByRole("link", { name: "← Back" }).click();
  await expect(fresh).toHaveURL(/\/trucks$/);
});
