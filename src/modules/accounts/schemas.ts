import { z } from "zod";
import { US_STATE_CODES, US_TIME_ZONES } from "@/lib/us";
import { ORG_ROLES } from "./permissions";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address" }).max(254));

// Supabase Auth hashes with bcrypt, which ignores bytes past 72.
const newPassword = z
  .string()
  .min(8, { error: "Password must be at least 8 characters" })
  .max(72, { error: "Password must be at most 72 characters" });

/** Empty form fields arrive as "" — treat them as "not provided". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

const optionalDigits = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/^(USDOT|DOT|MC)[\s#-]*/i, ""))
    .refine((v) => v === "" || /^\d{1,8}$/.test(v), { error: `${label} must be 1–8 digits` })
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password" }),
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  firstName: z.string().trim().min(1, { error: "Enter your first name" }).max(100),
  lastName: z.string().trim().min(1, { error: "Enter your last name" }).max(100),
  email,
  password: newPassword,
  next: z.string().optional(),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter the company name" }).max(200),
  usdotNumber: optionalDigits("USDOT number"),
  mcNumber: optionalDigits("MC number"),
  addressLine1: optionalText(200),
  city: optionalText(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || (US_STATE_CODES as readonly string[]).includes(v), {
      error: "Choose a US state",
    })
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  zip: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{5}(-\d{4})?$/.test(v), { error: "ZIP must be 12345 or 12345-6789" })
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  timezone: z.enum(US_TIME_ZONES.map((t) => t.value) as [string, ...string[]], {
    error: "Choose a time zone",
  }),
});

const role = z.enum(ORG_ROLES, { error: "Choose a role" });

export const inviteMemberSchema = z.object({ email, role });

export const changeMemberRoleSchema = z.object({ userId: z.uuid(), role });

export const removeMemberSchema = z.object({ userId: z.uuid() });

export const revokeInvitationSchema = z.object({ invitationId: z.uuid() });

export const switchOrganizationSchema = z.object({ organizationId: z.uuid() });

export const acceptInvitationSchema = z.object({ token: z.string().min(20).max(200) });
