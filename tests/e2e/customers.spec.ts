import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

test("dispatcher adds a customer with contacts and marks it do-not-use", async ({ page }) => {
  const name = `E2E Brokerage ${Date.now().toString().slice(-6)}`;
  const mc = Date.now().toString().slice(-7);
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.getByRole("link", { name: "Customers" }).click();
  await page.getByRole("link", { name: "Add customer" }).click();

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("MC number").fill("610233"); // already used by Northline
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByText("Another active customer already has this MC number.")).toBeVisible();

  await page.getByLabel("MC number").fill(`MC-${mc}`);
  await page.getByLabel("Payment terms (days)").fill("45");
  await page.getByLabel("Billing email").fill("AP@e2e-brokerage.test");
  await page.getByRole("button", { name: "Add customer" }).click();

  await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByText("Net 45 days")).toBeVisible();
  await expect(page.getByText("ap@e2e-brokerage.test").filter({ visible: true })).toBeVisible();

  // Contacts
  await page.getByLabel("Contact name").fill("Pat Lee");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Add an email or a phone number")).toBeVisible();
  await page.getByLabel("Contact name").fill("Pat Lee");
  await page.getByLabel("Role (optional)").fill("Carrier sales");
  await page.getByLabel("Phone").filter({ visible: true }).last().fill("(555) 010-2030");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByTestId("contact-Pat Lee")).toContainText("Carrier sales");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove Pat Lee" }).click();
  await expect(page.getByTestId("contact-Pat Lee")).toHaveCount(0);

  // Do not use needs a reason
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Status").filter({ visible: true }).selectOption("do_not_use");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Say why this customer should not be used")).toBeVisible();
  // A failed submit keeps every choice the user made (regression: selects used to snap back)
  await expect(page.getByLabel("Status").filter({ visible: true })).toHaveValue("do_not_use");
  await expect(page.getByLabel("Payment terms (days)").filter({ visible: true })).toHaveValue("45");
  await page.getByLabel("Why not use this customer?").fill("Never paid detention");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Do not use this customer").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Never paid detention").filter({ visible: true })).toBeVisible();
});

test("customer list search and filters", async ({ page }) => {
  await signInAs(page, "viewer@lakesidefreight.test");
  await page.goto("/customers");
  await expect(page.getByRole("link", { name: "Add customer" })).toHaveCount(0);
  await expect(page.getByTestId("customer-Quickturn Freight Solutions")).toContainText("Do not use");
  // Other organization's customers never appear
  await expect(page.getByText("Sandhills Freight Brokers")).toHaveCount(0);

  await page.getByLabel("Search customers").fill("MC 583340");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("customer-Keystone Cargo Partners")).toBeVisible();
  await expect(page.getByTestId("customer-Northline Freight Brokerage")).toHaveCount(0);

  await page.getByLabel("Search customers").fill("");
  await page.getByLabel("Filter by type").selectOption("shipper");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("customer-Riverbend Foods")).toBeVisible();
  await expect(page.getByTestId("customer-Keystone Cargo Partners")).toHaveCount(0);

  await page.getByTestId("customer-Riverbend Foods").getByRole("link", { name: "Riverbend Foods" }).click();
  await expect(page.getByRole("button", { name: "Add contact" })).toHaveCount(0);
  await expect(page.getByTestId("contact-Dock office")).toBeVisible();
});
