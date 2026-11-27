import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./support/auth";

// Fleet Director and Fleet Manager (PRODUCT_SPEC.md §4.1, approved 11/27/2026). Seeded in Lakeside.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

async function inviteRoleOptions(page: Page): Promise<string[]> {
  await nav(page).getByRole("link", { name: "Members" }).click();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  return page.getByLabel("Role", { exact: true }).locator("option").allTextContents();
}

test("Fleet Manager runs loads, trucks and drivers, without pay or members", async ({ page }) => {
  await signInAs(page, "fleetmanager@lakesidefreight.test");
  await expect(page.getByTestId("active-role")).toHaveText("Fleet Manager");

  for (const item of ["Dispatch board", "Loads", "Customers", "Trucks", "Trailers", "Drivers"]) {
    await expect(nav(page).getByRole("link", { name: item })).toBeVisible();
  }
  await expect(nav(page).getByRole("link", { name: "Driver pay" })).toHaveCount(0);
  await expect(nav(page).getByRole("link", { name: "Members" })).toHaveCount(0);

  await nav(page).getByRole("link", { name: "Loads" }).click();
  await expect(page.getByRole("link", { name: "New load" })).toBeVisible();
  await nav(page).getByRole("link", { name: "Trucks" }).click();
  await expect(page.getByRole("link", { name: "Add truck" })).toBeVisible();
  await nav(page).getByRole("link", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add customer" })).toHaveCount(0);

  await page.goto("/statements");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await page.goto("/settings/members");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("Fleet Director manages members, but only with roles they could hold", async ({ page }) => {
  await signInAs(page, "director@lakesidefreight.test");
  await expect(page.getByTestId("active-role")).toHaveText("Fleet Director");
  await expect(nav(page).getByRole("link", { name: "Driver pay" })).toBeVisible();

  const options = await inviteRoleOptions(page);
  expect(options).toEqual(expect.arrayContaining(["Fleet Director", "Fleet Manager", "Dispatcher", "Viewer"]));
  expect(options).not.toContain("Admin");
  expect(options).not.toContain("Owner");

  // The Admin and the Owner can't be changed or removed by the director.
  for (const email of ["admin@lakesidefreight.test", "owner@lakesidefreight.test"]) {
    const row = page.getByTestId(`member-${email}`);
    await expect(row.getByRole("combobox")).toHaveCount(0);
    await expect(row.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  }
});

test("Admin can give the new roles", async ({ page }) => {
  await signInAs(page, "admin@lakesidefreight.test");
  const options = await inviteRoleOptions(page);
  expect(options).toEqual(expect.arrayContaining(["Admin", "Fleet Director", "Fleet Manager"]));
  expect(options).not.toContain("Owner");
});
