import type { z } from "zod";

/** Result of a form server action, consumed with React's useActionState. */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Submitted values, echoed back so a failed form keeps what the user typed. */
  values?: Record<string, string>;
  /** Extra data for the UI (e.g. a one-time invite link). */
  data?: Record<string, string>;
};

export const initialActionState: ActionState = { status: "idle" };

/** FormData → plain object of strings (files are ignored; passwords never echoed). */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.toLowerCase().includes("password") && !key.startsWith("$")) {
      out[key] = value;
    }
  }
  return out;
}

export function validationError(error: z.ZodError, formData: FormData): ActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return {
    status: "error",
    message: "Please fix the highlighted fields.",
    fieldErrors,
    values: formValues(formData),
  };
}

export function errorState(message: string, formData?: FormData): ActionState {
  return { status: "error", message, values: formData ? formValues(formData) : undefined };
}
