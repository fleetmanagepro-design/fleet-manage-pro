import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInAs } from "./support/auth";

// Fleet Director and Fleet Manager (PRODUCT_SPEC.md §4.1, approved 11/27/2026). Seeded in Lakeside.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

/** Open a member's role picker (it may still be open after saving). */
async function openRoles(row: Locator) {
  const details = row.locator("details");
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await row.getByLabel(/^Change roles for/).click();
}

/** The roles the person may tick when inviting (roles beyond their rights are shown disabled). */
async function inviteRoleOptions(page: Page): Promise<string[]> {
  await nav(page).getByRole("link", { name: "Members" }).click();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  const boxes = page.getByRole("group", { name: "Roles", exact: true }).locator("label:has(input:not([disabled]))");
  return (await boxes.allTextContents()).map((t) => t.trim());
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
    await expect(row.getByLabel(/^Change roles for/)).toHaveCount(0);
    await expect(row.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  }
});

test("Admin can give the new roles", async ({ page }) => {
  await signInAs(page, "admin@lakesidefreight.test");
  const options = await inviteRoleOptions(page);
  expect(options).toEqual(expect.arrayContaining(["Admin", "Fleet Director", "Fleet Manager"]));
  expect(options).not.toContain("Owner");
});

test("Admin makes a role by ticking permissions and gives a member two roles", async ({ page }) => {
  await signInAs(page, "admin@lakesidefreight.test");
  const name = `Night dispatch ${Date.now()}`;
  await nav(page).getByRole("link", { name: "Roles" }).click();
  await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Create role" }).click();

  await page.getByLabel("Role name").fill(name);
  // Ticking "override" also ticks what it needs.
  await page.getByLabel("Override an overlapping assignment").check();
  await expect(page.getByLabel("Create and edit loads and dispatch")).toBeChecked();
  await expect(page.getByLabel("View loads and the dispatch board")).toBeChecked();
  await page.getByRole("button", { name: "Create role" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Give the Fleet Manager the new role on top of Fleet Manager (it adds only the override).
  await nav(page).getByRole("link", { name: "Members" }).click();
  const row = page.getByTestId("member-fleetmanager@lakesidefreight.test");
  await openRoles(row);
  await row.getByLabel(name).check();
  await row.getByRole("button", { name: "Save roles" }).click();
  await expect(row.getByLabel(/^Change roles for/)).toContainText(name);
  await expect(row.getByLabel(/^Change roles for/)).toContainText("Fleet Manager");

  // In use: it can't be deleted until taken away.
  await nav(page).getByRole("link", { name: "Roles" }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete role" })).toBeDisabled();
  await nav(page).getByRole("link", { name: "Members" }).click();
  await openRoles(row);
  await row.getByLabel(name).uncheck();
  await row.getByRole("button", { name: "Save roles" }).click();
  await expect(row.getByLabel(/^Change roles for/)).not.toContainText(name);
  await nav(page).getByRole("link", { name: "Roles" }).click();
  await page.getByRole("link", { name, exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete role" }).click();
  await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
});
