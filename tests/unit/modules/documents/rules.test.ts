import { describe, expect, it } from "vitest";
import { canAddDocuments, canArchiveDocuments, canViewDocuments, documentPath, fileProblem, safeFileName } from "@/modules/documents/rules";
import { registerDocumentSchema } from "@/modules/documents/schemas";

const ORG = "a0000000-0000-4000-8000-000000000001";
const ID = "11111111-1111-4111-8111-111111111111";

describe("fileProblem", () => {
  it("accepts PDF, JPG and PNG up to 20 MB", () => {
    expect(fileProblem({ name: "cdl.pdf", size: 1000, type: "application/pdf" })).toBeNull();
    expect(fileProblem({ name: "a.jpg", size: 20 * 1024 * 1024, type: "image/jpeg" })).toBeNull();
    expect(fileProblem({ name: "a.png", size: 5, type: "image/png" })).toBeNull();
  });
  it("refuses other types, empty and too large files", () => {
    expect(fileProblem({ name: "a.heic", size: 5, type: "image/heic" })).toBe("Only PDF, JPG and PNG files can be uploaded.");
    expect(fileProblem({ name: "a.docx", size: 5, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))
      .toBe("Only PDF, JPG and PNG files can be uploaded.");
    expect(fileProblem({ name: "a.pdf", size: 0, type: "application/pdf" })).toBe("This file is empty.");
    expect(fileProblem({ name: "a.pdf", size: 20 * 1024 * 1024 + 1, type: "application/pdf" })).toBe("Files can be up to 20 MB.");
  });
});

describe("file names and paths", () => {
  it("keeps names safe for storage", () => {
    expect(safeFileName("Registration 2026 (truck #101).pdf")).toBe("Registration_2026_truck_101_.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("etc_passwd");
    expect(safeFileName("Čačak dozvola.PNG")).toBe("Cacak_dozvola.PNG");
    expect(safeFileName(".pdf")).toBe("pdf");
  });
  it("builds organization/entity/document/file", () => {
    expect(documentPath(ORG, "truck", ID, "reg 1.pdf")).toBe(`${ORG}/truck/${ID}/reg_1.pdf`);
  });
});

describe("who sees and adds documents (temporary rules)", () => {
  it("driver documents: not for viewers; truck and trailer: everyone sees, viewers don't add", () => {
    expect(canViewDocuments("viewer", "driver")).toBe(false);
    expect(canViewDocuments("dispatcher", "driver")).toBe(true);
    expect(canViewDocuments("viewer", "truck")).toBe(true);
    expect(canAddDocuments("viewer", "truck")).toBe(false);
    expect(canAddDocuments("maintenance", "trailer")).toBe(true);
    expect(canArchiveDocuments("admin")).toBe(true);
    expect(canArchiveDocuments("dispatcher")).toBe(false);
  });
});

describe("registerDocumentSchema", () => {
  const base = { entityType: "driver", entityId: ID, documentId: ID, storagePath: "x", fileName: "cdl.pdf", docType: "cdl", expiresOn: "", notes: "" };
  it("accepts a type that belongs to the entity", () => {
    expect(registerDocumentSchema.parse(base)).toMatchObject({ docType: "cdl", expiresOn: undefined });
    expect(registerDocumentSchema.parse({ ...base, expiresOn: "2027-03-01" }).expiresOn).toBe("2027-03-01");
  });
  it("refuses a type of another entity", () => {
    expect(registerDocumentSchema.safeParse({ ...base, docType: "registration" }).success).toBe(false);
    expect(registerDocumentSchema.safeParse({ ...base, entityType: "trailer", docType: "insurance" }).success).toBe(false);
  });
});
