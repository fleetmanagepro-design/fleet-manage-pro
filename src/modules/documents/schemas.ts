import { z } from "zod";
import { optionalCalendarDate, optionalText } from "@/lib/form-fields";
import { DOCUMENT_ENTITIES, DOC_TYPES } from "./rules";

export const registerDocumentSchema = z
  .object({
    entityType: z.enum(DOCUMENT_ENTITIES),
    entityId: z.uuid(),
    documentId: z.uuid(),
    storagePath: z.string().min(1).max(400),
    fileName: z.string().trim().min(1).max(200),
    docType: z.string({ error: "Choose the document type" }).min(1, { error: "Choose the document type" }),
    expiresOn: optionalCalendarDate,
    notes: optionalText(1000),
  })
  .refine((d) => (DOC_TYPES[d.entityType] as readonly string[]).includes(d.docType), {
    error: "Choose the document type", path: ["docType"],
  });

export const documentIdSchema = z.object({ id: z.uuid() });
