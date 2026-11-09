import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

/** A VIN with a valid format that no seeded truck uses. */
function testVin(n: number) {
  return `1FUJHHDR0JP${String(n).padStart(6, "0").slice(-6)}`;
}

test("maintenance adds a truck, edits it and records odometer readings", async ({ page }) => {
  const unit = `T${Date.now().toString().slice(-6)}`;
  await signInAs(page, "shop@lakesidefreight.test");

  await page.getByRole("link", { name: "Trucks" }).click();
  await expect(page.getByTestId("truck-101")).toBeVisible();
  await page.getByRole("link", { name: "Add truck" }).click();

  // Validation errors are shown next to the fields
  await page.getByLabel("Unit #").fill(unit);
  await page.getByLabel("VIN").fill("BAD-VIN");
  await page.getByRole("button", { name: "Add truck" }).click();
  await expect(page.getByText("A VIN has 17 letters and digits (no I, O or Q)")).toBeVisible();

  await page.getByLabel("VIN").fill(testVin(Date.now()));
  await page.getByLabel("Year").fill("2022");
  await page.getByLabel("Make").fill("Kenworth");
  await page.getByLabel("Model").fill("T680");
  await page.getByLabel("Purchase price (USD)").fill("142,500.00");
  await page.getByLabel("Current odometer (mi)").fill("250,000");
  await page.getByLabel("Registration expires").fill(new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Add truck" }).click();

  await expect(page.getByRole("heading", { name: new RegExp(`Truck ${unit}`) })).toBeVisible();
  // Next keeps the previous page hidden in the DOM, so only look at visible text.
  await expect(page.getByText("2022 Kenworth T680").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("$142,500.00").filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId("compliance-registration")).toContainText(/Due in \d+ days/);
  await expect(page.getByRole("cell", { name: "Initial reading" })).toBeVisible();

  // Edit
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Plate", { exact: true }).filter({ visible: true }).fill("p123456");
  await page.getByLabel("Plate state").filter({ visible: true }).selectOption("IL");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("P123456 (IL)").filter({ visible: true })).toBeVisible();

  // Readings only go up
  await page.getByLabel("Odometer reading").fill("251,200.5");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByText("Reading saved.")).toBeVisible();
  await expect(page.getByText("251,200.5 mi").first()).toBeVisible();

  await page.getByLabel("Odometer reading").fill("249,000");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByText("The reading is lower than the current value. Readings only go up.")).toBeVisible();

  // Maintenance cannot correct readings or sell
  await expect(page.getByLabel(/This corrects a wrong reading/)).toHaveCount(0);
  await expect(page.getByLabel("Status", { exact: true }).locator("option", { hasText: "Sold" })).toHaveCount(0);

  // Not-built tabs say so
  await page.getByRole("link", { name: "Maintenance", exact: true }).click();
  await expect(page.getByText("Maintenance — not built yet")).toBeVisible();
});

test("admin corrects an odometer reading with a reason", async ({ page }) => {
  await signInAs(page, "admin@lakesidefreight.test");
  await page.goto("/trucks");
  await page.getByTestId("truck-112").getByRole("link", { name: "112" }).click();

  await page.getByLabel("Odometer reading").fill("100");
  await page.getByLabel(/This corrects a wrong reading/).check();
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByText("Explain why the reading is being corrected")).toBeVisible();

  await page.getByLabel(/This corrects a wrong reading/).check();
  await page.getByLabel("Odometer reading").fill("100");
  await page.getByLabel("Reason for correction").fill("E2E: wrong unit entered");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByText("Correction saved.")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Correction:\s*E2E: wrong unit entered/ })).toBeVisible();
});

test("dispatcher can only change status", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/trailers");
  await expect(page.getByRole("link", { name: "Add trailer" })).toHaveCount(0);
  await page.getByTestId("trailer-5302").getByRole("link", { name: "5302" }).click();

  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save reading" })).toHaveCount(0);

  await page.getByLabel("Status", { exact: true }).selectOption("in_shop");
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Trailer 5302/ })).toContainText("In shop");

  await page.getByLabel("Status", { exact: true }).selectOption("active");
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByRole("heading", { name: /Trailer 5302/ })).toContainText("Active");

  // Edit page is not available
  await page.goto(page.url() + "/edit");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("viewer has read-only access; lists filter by status and show compliance", async ({ page }) => {
  await signInAs(page, "viewer@lakesidefreight.test");
  await page.goto("/trucks");
  await expect(page.getByRole("link", { name: "Add truck" })).toHaveCount(0);
  // seed: truck 107 registration expired, 102 due soon
  await expect(page.getByTestId("truck-107")).toContainText("Expired");
  await expect(page.getByTestId("truck-102")).toContainText("Due soon");

  await page.getByLabel("Filter by status").selectOption("in_shop");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/status=in_shop/);
  await expect(page.getByTestId("truck-104")).toBeVisible();
  await expect(page.getByTestId("truck-101")).toHaveCount(0);

  await page.getByTestId("truck-104").getByRole("link", { name: "104" }).click();
  await expect(page.getByRole("button", { name: "Update status" })).toHaveCount(0);
  // Never another organization's trucks
  await page.goto("/trucks");
  await expect(page.getByText("PH1")).toHaveCount(0);
});

test("archiving a trailer hides it and can be undone", async ({ page }) => {
  await signInAs(page, "owner@lakesidefreight.test");
  await page.goto("/trailers");
  await page.getByTestId("trailer-5318").getByRole("link", { name: "5318" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Archived.")).toBeVisible();

  await page.goto("/trailers");
  await expect(page.getByTestId("trailer-5318")).toHaveCount(0);
  await page.getByLabel("Show archived").check();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("trailer-5318")).toContainText("Archived");

  await page.getByTestId("trailer-5318").getByRole("link", { name: "5318" }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Restored.")).toBeVisible();
});
