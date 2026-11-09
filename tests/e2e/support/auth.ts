import { expect, type Page } from "@playwright/test";

export const SEED_PASSWORD = "Password123!";

/** Sign in as a seeded user (supabase/seed.sql). */
export async function signInAs(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
