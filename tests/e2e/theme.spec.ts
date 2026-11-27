import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

test("dark mode can be switched on, is remembered, and switched off", async ({ page }) => {
  await signInAs(page, "viewer@lakesidefreight.test");
  const html = page.locator("html");
  const theme = page.getByRole("group", { name: "Theme" });

  await theme.getByRole("button", { name: "Dark" }).click();
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(theme.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(html).toHaveClass(/\bdark\b/); // set before paint by the boot script

  await theme.getByRole("button", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
});
