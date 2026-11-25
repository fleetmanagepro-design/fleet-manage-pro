import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

/** UTC calendar day `days` from today, as the seed computes its dates (current_date in the database). */
const utcDay = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const us = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

test("loads can be filtered by pickup date", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/loads");
  // seed: load 1010 is picked up 156 days ago at 08:00 Chicago, load 1011 three days later
  const day = utcDay(-156);
  await page.getByLabel("Pickup from").fill(day);
  await page.getByLabel("Pickup to").fill(day);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(new RegExp(`from=${day}&to=${day}`));
  await expect(page.getByTestId("load-1010")).toBeVisible();
  await expect(page.getByTestId("load-1011")).toHaveCount(0);

  // a reversed range still works
  await page.getByLabel("Pickup from").fill(utcDay(-150));
  await page.getByLabel("Pickup to").fill(utcDay(-160));
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("load-1010")).toBeVisible();
  await expect(page.getByTestId("load-1011")).toBeVisible();
});

test("the dispatch board jumps to any day", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/dispatch");
  const day = utcDay(-400); // more than a year back
  await page.getByLabel("Week starting").fill(day);
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page).toHaveURL(new RegExp(`start=${day}`));
  await expect(page.getByText(new RegExp(`^${us(day).replace(/\//g, "\\/")} – `))).toBeVisible();
  await expect(page.getByLabel("Week starting").filter({ visible: true })).toHaveValue(day);
});
