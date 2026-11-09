import { expect, test, type Page } from "@playwright/test";
import { waitForEmailLink } from "./support/mailpit";

const PASSWORD = "Correct-Horse-9";
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function signUp(page: Page, email: string, firstName: string) {
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(`We sent a confirmation link to ${email}`)).toBeVisible();
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("owner signs up, creates an organization, invites a dispatcher who joins", async ({ page }) => {
  const id = unique();
  const ownerEmail = `owner-${id}@example.test`;
  const dispatcherEmail = `dispatch-${id}@example.test`;
  const orgName = `E2E Freight ${id}`;

  // Sign up and confirm email
  await page.goto("/sign-up");
  await signUp(page, ownerEmail, "Olivia");
  await page.goto(await waitForEmailLink(ownerEmail, "Confirm", /\/auth\/confirm\?/));

  // No organization yet → onboarding
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Company name").fill(orgName);
  await page.getByLabel("USDOT number").fill("1234567");
  await page.getByLabel("State").selectOption("TX");
  await page.getByLabel("Time zone").selectOption("America/Chicago");
  await page.getByRole("button", { name: "Create organization" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("active-org")).toHaveText(orgName);
  await expect(page.getByTestId("active-role")).toHaveText("Owner");

  // Invite a dispatcher
  await page.getByRole("link", { name: "Members" }).click();
  await page.getByLabel("Email", { exact: true }).fill(dispatcherEmail);
  await page.getByLabel("Role", { exact: true }).selectOption("dispatcher");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(`Invitation sent to ${dispatcherEmail}.`)).toBeVisible();
  await expect(page.getByTestId(`invitation-${dispatcherEmail}`)).toContainText("Dispatcher");

  const inviteLink = await waitForEmailLink(dispatcherEmail, orgName, /\/invite\//);

  // Revoking an invitation removes it
  const extraEmail = `extra-${id}@example.test`;
  await page.getByLabel("Email", { exact: true }).fill(extraEmail);
  await page.getByLabel("Role", { exact: true }).selectOption("viewer");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByTestId(`invitation-${extraEmail}`)).toBeVisible();
  await page.getByRole("button", { name: `Revoke invitation for ${extraEmail}` }).click();
  await expect(page.getByTestId(`invitation-${extraEmail}`)).toHaveCount(0);

  // The only owner cannot step down
  const ownerRow = page.getByTestId(`member-${ownerEmail}`);
  await ownerRow.getByRole("combobox").selectOption("admin");
  await ownerRow.getByRole("button", { name: "Save" }).click();
  await expect(ownerRow.getByText("An organization must have at least one owner.")).toBeVisible();

  // Owner signs out; invitee opens the link and creates an account from it
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto(inviteLink);
  await page.getByRole("link", { name: "Create an account" }).click();
  await signUp(page, dispatcherEmail, "Diego");
  await page.goto(await waitForEmailLink(dispatcherEmail, "Confirm", /\/auth\/confirm\?/));

  // Confirmation lands back on the invitation
  await expect(page).toHaveURL(/\/invite\//);
  await expect(page.getByText("You've been invited as Dispatcher.")).toBeVisible();
  await page.getByRole("button", { name: `Join ${orgName}` }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("active-org")).toHaveText(orgName);
  await expect(page.getByTestId("active-role")).toHaveText("Dispatcher");

  // A dispatcher has no access to member management
  await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);
  // (rendered as not-found; the status stays 200 because the page streams)
  await page.goto("/settings/members");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Members" })).toHaveCount(0);

  // The invitation is single-use
  await page.goto(inviteLink);
  await expect(page.getByText("This invitation has already been used.")).toBeVisible();
});

test("signed-out users are sent to sign-in and returned afterwards", async ({ page }) => {
  await page.goto("/settings/members");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Fmembers$/);
  await signIn(page, "owner@lakesidefreight.test", "Password123!");
  await expect(page).toHaveURL(/\/settings\/members$/);
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByTestId("member-dispatch@lakesidefreight.test")).toBeVisible();
  // Never shows another organization's people
  await expect(page.getByText("owner@prairiehaul.test")).toHaveCount(0);
});

test("wrong password shows a clear error", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page, "owner@lakesidefreight.test", "wrong-password");
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

test("viewer sees only the dashboard", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page, "viewer@lakesidefreight.test", "Password123!");
  await expect(page.getByTestId("active-role")).toHaveText("Viewer");
  await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);
});

test("password reset by email", async ({ page }) => {
  const email = `reset-${unique()}@example.test`;
  await page.goto("/sign-up");
  await signUp(page, email, "Rita");
  await page.goto(await waitForEmailLink(email, "Confirm", /\/auth\/confirm\?/));
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.context().clearCookies();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();

  await page.goto(await waitForEmailLink(email, "Reset", /type=recovery/));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("New password", { exact: true }).fill("Brand-New-Pass-1");
  await page.getByLabel("Confirm new password").fill("Brand-New-Pass-1");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.context().clearCookies();
  await page.goto("/sign-in");
  await signIn(page, email, "Brand-New-Pass-1");
  await expect(page).toHaveURL(/\/onboarding$/);
});
