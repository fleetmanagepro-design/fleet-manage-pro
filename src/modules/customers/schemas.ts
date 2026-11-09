import { z } from "zod";
import { optionalText, optionalUsState } from "@/lib/form-fields";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from "./labels";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const optionalEmail = z.preprocess(
  blank,
  z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address" }).max(254)).optional(),
);

export const customerSchema = z
  .object({
    name: z.string().trim().min(1, { error: "Enter the customer name" }).max(200),
    customerType: z.enum(CUSTOMER_TYPES, { error: "Choose a type" }),
    mcNumber: z.preprocess(
      blank,
      z
        .string()
        .trim()
        .transform((v) => v.replace(/^MC[\s#-]*/i, ""))
        .refine((v) => /^\d{1,8}$/.test(v), { error: "MC number must be 1–8 digits" })
        .optional(),
    ),
    billingEmail: optionalEmail,
    phone: optionalText(30),
    addressLine1: optionalText(200),
    city: optionalText(100),
    state: optionalUsState,
    zip: z.preprocess(
      blank,
      z.string().trim().refine((v) => /^\d{5}(-\d{4})?$/.test(v), { error: "ZIP must be 12345 or 12345-6789" }).optional(),
    ),
    paymentTermsDays: z.coerce
      .number({ error: "Enter the number of days" })
      .int({ error: "Enter whole days" })
      .min(0, { error: "Payment terms must be 0–180 days" })
      .max(180, { error: "Payment terms must be 0–180 days" }),
    status: z.enum(CUSTOMER_STATUSES, { error: "Choose a status" }),
    doNotUseReason: optionalText(1000),
    notes: optionalText(5000),
  })
  .refine((c) => c.status !== "do_not_use" || !!c.doNotUseReason, {
    error: "Say why this customer should not be used",
    path: ["doNotUseReason"],
  });

export const contactSchema = z
  .object({
    customerId: z.uuid(),
    name: z.string().trim().min(1, { error: "Enter a name" }).max(200),
    email: optionalEmail,
    phone: optionalText(30),
    role: optionalText(100),
  })
  .refine((c) => c.email || c.phone, { error: "Add an email or a phone number", path: ["email"] });

export const removeContactSchema = z.object({ id: z.uuid(), customerId: z.uuid() });
