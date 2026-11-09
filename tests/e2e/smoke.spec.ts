import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Fleet Manage Pro");
  await expect(page.getByRole("heading", { name: "Fleet Manage Pro" })).toBeVisible();
});
