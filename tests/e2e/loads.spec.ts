import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./support/auth";

/** "YYYY-MM-DD" today in Chicago (Lakeside's time zone), shifted by `days`. */
function chicagoDate(days = 0) {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
}

async function fillStop(page: Page, n: number, city: string, state: string, start: string) {
  const stop = page.getByTestId(`stop-${n}`);
  await stop.getByLabel("City").fill(city);
  await stop.getByLabel("State").selectOption(state);
  await stop.getByLabel("Appointment from (local)").fill(start);
}

test("dispatcher creates a 2-stop load and assigns it in under a minute", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  const started = Date.now();
  await page.getByRole("link", { name: "Loads" }).click();
  await page.getByRole("link", { name: "New load" }).click();

  await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Blue Prairie Logistics" });
  await page.getByLabel("Linehaul (USD)").fill("1,850.00");
  await page.getByLabel("Fuel surcharge (USD)").fill("310");
  await page.getByLabel("Loaded miles").fill("612.5");
  await page.getByLabel("Deadhead miles").fill("37.5");
  await fillStop(page, 1, "Omaha", "NE", `${chicagoDate(20)}T07:00`);
  await fillStop(page, 2, "Denver", "CO", `${chicagoDate(21)}T09:30`);
  // Choosing the truck suggests its default driver
  await page.getByLabel("Truck", { exact: true }).selectOption({ label: "108" });
  await expect(page.getByLabel("Driver", { exact: true })).not.toHaveValue("");
  await page.getByRole("button", { name: "Create load" }).click();

  await expect(page.getByRole("heading", { name: /Load \d+/ })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(60_000);
  await expect(page.getByTestId("load-revenue")).toHaveText("$2,160.00");
  await expect(page.getByText("$3.32/mi")).toBeVisible(); // 2160 / 650
  // Denver stop shown in Mountain time, Omaha in Central
  await expect(page.getByTestId("load-stop-1")).toContainText("07:00 CST");
  await expect(page.getByTestId("load-stop-2")).toContainText("09:30 MST");

  // Status: forward freely, back only with a reason, delivered needs miles
  await page.getByLabel("Move to").selectOption("in_transit");
  await page.getByRole("button", { name: "Mark in transit" }).click();
  await expect(page.getByRole("heading", { name: /Load \d+/ })).toContainText("In transit");

  await page.getByLabel("Move to").selectOption("dispatched");
  await page.getByRole("button", { name: "Mark dispatched" }).click();
  await expect(page.getByText("Give a reason.")).toBeVisible();
  await page.getByLabel("Why is the status going back?").fill("Truck broke down before pickup");
  await page.getByRole("button", { name: "Mark dispatched" }).click();
  await expect(page.getByRole("heading", { name: /Load \d+/ })).toContainText("Dispatched");
  await expect(page.getByText("Truck broke down before pickup")).toBeVisible();

  await page.getByLabel("Move to").selectOption("delivered");
  await page.getByLabel("Loaded miles").filter({ visible: true }).last().fill("");
  await page.getByRole("button", { name: "Mark delivered" }).click();
  await expect(page.getByText("Enter the loaded miles")).toBeVisible();
  await page.getByLabel("Loaded miles").filter({ visible: true }).last().fill("615");
  await page.getByRole("button", { name: "Mark delivered" }).click();
  await expect(page.getByRole("heading", { name: /Load \d+/ })).toContainText("Delivered");

  // Accessorial adds to revenue
  await page.getByLabel("Amount (USD)").fill("150");
  await page.getByRole("button", { name: "Add accessorial" }).click();
  await expect(page.getByTestId("load-revenue")).toHaveText("$2,310.00");
});

test("overlapping truck assignment: dispatcher is blocked, admin overrides with a reason", async ({ page }) => {
  const fillOverlapping = async () => {
    await page.goto("/loads/new");
    await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Riverbend Foods" });
    await page.getByLabel("Linehaul (USD)").fill("900");
    await fillStop(page, 1, "Joliet", "IL", `${chicagoDate(0)}T12:00`);
    await fillStop(page, 2, "Columbus", "OH", `${chicagoDate(0)}T20:00`);
    await page.getByLabel("Truck", { exact: true }).selectOption({ label: "101" }); // seed: on load 1061 today
    await page.getByRole("button", { name: "Create load" }).click();
  };

  await signInAs(page, "dispatch@lakesidefreight.test");
  await fillOverlapping();
  await expect(page.getByText(/already on load 1061 \(same truck\).*Ask an owner or admin/)).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "admin@lakesidefreight.test");
  await fillOverlapping();
  await expect(page.getByText(/To save anyway, give a reason/)).toBeVisible();
  await page.getByLabel("Reason for overriding the overlap").fill("1061 delivers early, confirmed with receiver");
  await page.getByRole("button", { name: "Create load" }).click();
  await expect(page.getByRole("heading", { name: /Load \d+/ })).toBeVisible();
  await expect(page.getByText(/Overlap override/)).toBeVisible();
  await expect(page.getByText(/Overlaps 1061: 1061 delivers early/)).toBeVisible();
});

test("form keeps stops after a validation error and requires a delivery", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/loads/new");
  await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Riverbend Foods" });
  await page.getByLabel("Linehaul (USD)").fill("700");
  await fillStop(page, 1, "Davenport", "IA", `${chicagoDate(30)}T08:00`);
  await page.getByTestId("stop-2").getByLabel("Stop 2 type").selectOption("pickup");
  await page.getByRole("button", { name: "Create load" }).click();
  await expect(page.getByText("Add at least one pickup and one delivery")).toBeVisible();
  await expect(page.getByText("Enter the city")).toBeVisible();
  await expect(page.getByTestId("stop-1").getByLabel("City")).toHaveValue("Davenport");
  await expect(page.getByTestId("stop-1").getByLabel("State")).toHaveValue("IA");
});

test("expired drivers can't be picked; viewers can't edit loads", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/loads/new");
  await expect(page.getByLabel("Driver", { exact: true }).locator("option", { hasText: "William Hayes — CDL/medical expired" }))
    .toBeDisabled();

  await page.context().clearCookies();
  await signInAs(page, "viewer@lakesidefreight.test");
  await page.getByRole("link", { name: "Loads" }).click();
  await expect(page.getByRole("link", { name: "New load" })).toHaveCount(0);
  await page.getByTestId("load-1064").getByRole("link", { name: "1064" }).click();
  await expect(page.getByRole("heading", { name: /Load 1064/ })).toBeVisible();
  await expect(page.getByLabel("Move to")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit load" })).toHaveCount(0);
  // never another organization's loads
  await page.goto("/loads");
  await expect(page.getByText("Platte River Grain")).toHaveCount(0);
});
