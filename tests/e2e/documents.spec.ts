import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

const pdf = (text: string) => ({
  name: "Registration 2026.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n% ${text}\ntrailer<<>>\n%%EOF\n`),
});

test("maintenance uploads a truck registration, opens it, and wrong files are refused", async ({ page }) => {
  await signInAs(page, "shop@lakesidefreight.test");
  await page.goto("/trucks");
  await page.getByRole("link", { name: "101", exact: true }).first().click();
  await page.getByRole("link", { name: "Documents" }).click();
  await expect(page.getByRole("button", { name: "Upload document" })).toBeVisible();

  // A Word file is refused before upload
  await page.getByLabel("File (PDF, JPG or PNG, up to 20 MB)").setInputFiles({
    name: "notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("x"),
  });
  await page.getByLabel("Document type").selectOption("registration");
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText("Only PDF, JPG and PNG files can be uploaded.")).toBeVisible();

  await page.getByLabel("File (PDF, JPG or PNG, up to 20 MB)").setInputFiles(pdf("truck 101"));
  await page.getByLabel("Document type").selectOption("registration");
  await page.getByLabel("Expires (optional)").fill("2027-03-31");
  await page.getByRole("button", { name: "Upload document" }).click();
  const doc = page.getByTestId("document-registration").first();
  await expect(doc).toContainText("Registration");
  await expect(doc).toContainText("Registration 2026.pdf");
  await expect(doc).toContainText("expires 03/31/2027");

  // Open goes through a short-lived signed link (the browser may show or download the PDF, so check the link itself).
  const signed = page.context().waitForEvent("request", (r) => /\/storage\/v1\/object\/sign\/documents\//.test(r.url()));
  await doc.getByRole("button", { name: /^Open/ }).click();
  const url = (await signed).url();
  const file = await page.request.get(url);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/pdf");
  // maintenance can't remove documents
  await expect(doc.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
});

test("driver documents: admin uploads and removes them", async ({ page }) => {
  await signInAs(page, "admin@lakesidefreight.test");
  await page.goto("/drivers");
  await page.getByTestId("driver-Carter-James").getByRole("link", { name: "James Carter" }).click();
  await page.getByLabel("File (PDF, JPG or PNG, up to 20 MB)").setInputFiles({ ...pdf("cdl"), name: "CDL Carter.pdf" });
  await page.getByLabel("Document type").selectOption("cdl");
  await page.getByRole("button", { name: "Upload document" }).click();
  const doc = page.getByTestId("document-cdl");
  await expect(doc).toContainText("CDL Carter.pdf");

  page.once("dialog", (d) => d.accept());
  await doc.getByRole("button", { name: /^Remove/ }).click();
  await expect(page.getByTestId("document-cdl")).toHaveCount(0);
});

test("viewers see truck documents but can't upload", async ({ page }) => {
  await signInAs(page, "viewer@lakesidefreight.test");
  await page.goto("/trucks");
  await page.getByRole("link", { name: "102", exact: true }).first().click();
  await page.getByRole("link", { name: "Documents" }).click();
  await expect(page.getByText("No documents yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload document" })).toHaveCount(0);
});
