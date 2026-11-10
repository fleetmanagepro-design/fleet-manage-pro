import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

test("dispatcher sees the week and assigns an unassigned load from the board", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.getByRole("link", { name: "Dispatch board" }).click();

  // seed: open loads 1061–1064 on trucks 101, 102, 103, 106; truck 104 is in the shop
  await expect(page.getByTestId("board-truck-101").getByTestId("board-load-1061")).toBeVisible();
  await expect(page.getByTestId("board-truck-106").getByTestId("board-load-1064")).toBeVisible();
  await expect(page.getByTestId("board-truck-104")).toContainText("In shop");

  const card = page.getByTestId("unassigned-1065");
  await expect(card).toContainText("Green Bay, WI → Detroit, MI");
  await card.getByLabel("Truck").selectOption({ label: "110" });
  // the truck's default driver is suggested
  await expect(card.getByLabel("Driver", { exact: true })).not.toHaveValue("");
  await card.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByTestId("board-truck-110").getByTestId("board-load-1065")).toBeVisible();
  await expect(page.getByTestId("unassigned-1065")).toHaveCount(0);

  // the block opens the load
  await page.getByTestId("board-load-1065").click();
  await expect(page.getByRole("heading", { name: /Load 1065/ })).toBeVisible();
  await expect(page.getByText("Elizabeth Myers").filter({ visible: true })).toBeVisible();
});

test("assigning a truck that is busy is blocked for dispatchers", async ({ page }) => {
  await signInAs(page, "dispatch@lakesidefreight.test");
  await page.goto("/loads/new");
  // create an unassigned load overlapping 1063 (truck 103, tomorrow)
  const d = (days: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(Date.now() + days * 86_400_000));
  await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Riverbend Foods" });
  await page.getByLabel("Linehaul (USD)").fill("500");
  await page.getByTestId("stop-1").getByLabel("City").fill("Joliet");
  await page.getByTestId("stop-1").getByLabel("State").selectOption("IL");
  await page.getByTestId("stop-1").getByLabel("Appointment from (local)").fill(`${d(1)}T12:00`);
  await page.getByTestId("stop-2").getByLabel("City").fill("Gary");
  await page.getByTestId("stop-2").getByLabel("State").selectOption("IN");
  await page.getByTestId("stop-2").getByLabel("Appointment from (local)").fill(`${d(1)}T15:00`);
  await page.getByRole("button", { name: "Create load" }).click();
  const loadNumber = (await page.getByRole("heading", { name: /Load \d+/ }).innerText()).match(/Load (\S+)/)![1];

  await page.goto("/dispatch");
  const card = page.getByTestId(`unassigned-${loadNumber}`);
  await card.getByLabel("Truck").selectOption({ label: "103" });
  await card.getByRole("button", { name: "Assign" }).click();
  await expect(card.getByText(/Already on load 1063 \(same truck\)/)).toBeVisible();
});

test("week navigation and read-only board for viewers", async ({ page }) => {
  await signInAs(page, "viewer@lakesidefreight.test");
  await page.goto("/dispatch");
  await expect(page.getByRole("button", { name: "Assign" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New load" })).toHaveCount(0);
  await page.getByRole("link", { name: "Next week →" }).click();
  await expect(page).toHaveURL(/\/dispatch\?start=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByTestId("board-load-1061")).toHaveCount(0);
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByTestId("board-load-1061")).toBeVisible();
});
