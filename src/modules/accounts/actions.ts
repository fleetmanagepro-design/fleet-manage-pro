"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  type ActionState,
  errorState,
  validationError,
} from "@/lib/action-state";
import { ACTIVE_ORG_COOKIE, authorizeAction, getSessionContext } from "@/lib/auth";
import { EmailNotConfiguredError, escapeHtml, sendEmail } from "@/lib/email";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/tokens";
import { ROLE_LABELS, assignableRoles, canManageMember } from "./permissions";
import {
  acceptInvitationSchema,
  changeMemberRoleSchema,
  createOrganizationSchema,
  forgotPasswordSchema,
  inviteMemberSchema,
  removeMemberSchema,
  resetPasswordSchema,
  revokeInvitationSchema,
  signInSchema,
  signUpSchema,
  switchOrganizationSchema,
} from "./schemas";

const SITE = publicEnv.NEXT_PUBLIC_SITE_URL;
const MEMBERS_PATH = "/settings/members";
const NO_PERMISSION = "You don't have permission to do that.";
const UNEXPECTED = "Something went wrong. Please try again.";

async function setActiveOrg(organizationId: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function logError(action: string, error: unknown, context: Record<string, unknown> = {}) {
  console.error(`[accounts.${action}]`, { ...context, error });
}

/** Map database errors raised by our triggers/functions to user-facing text. */
function membershipError(error: PostgrestError): string {
  if (error.hint === "last_owner") return "An organization must have at least one owner.";
  if (error.code === "42501") return NO_PERMISSION;
  return UNEXPECTED;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return errorState("Confirm your email address first. Check your inbox for the link.", formData);
    }
    if (error.code !== "invalid_credentials") logError("signIn", error);
    return errorState("Incorrect email or password.", formData);
  }
  redirect(safeNextPath(parsed.data.next, SITE));
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const { email, password, firstName, lastName, next } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${SITE}${safeNextPath(next, SITE)}`,
      data: { first_name: firstName, last_name: lastName },
    },
  });
  if (error) {
    if (error.code === "weak_password") {
      return { ...validationErrorFor("password", error.message), values: { email, firstName, lastName } };
    }
    logError("signUp", error);
    return errorState(UNEXPECTED, formData);
  }
  // Supabase answers the same way for existing emails (no account enumeration).
  return {
    status: "success",
    message: `We sent a confirmation link to ${email}. Open it to finish creating your account.`,
  };
}

function validationErrorFor(field: string, message: string): ActionState {
  return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { [field]: [message] } };
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${SITE}/reset-password`,
  });
  if (error && error.code !== "over_email_send_rate_limit") logError("requestPasswordReset", error);
  // Same answer whether or not the account exists.
  return {
    status: "success",
    message: `If an account exists for ${parsed.data.email}, we sent a link to reset the password.`,
  };
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return validationErrorFor("password", "Choose a password different from your current one.");
    }
    if (error.code === "weak_password") return validationErrorFor("password", error.message);
    logError("resetPassword", error);
    return errorState("Your reset link may have expired. Request a new one.");
  }
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logError("signOut", error);
  (await cookies()).delete(ACTIVE_ORG_COOKIE);
  redirect("/sign-in");
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function createOrganization(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");

  const parsed = createOrganizationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const o = parsed.data;

  const supabase = await createClient();
  const { data: organizationId, error } = await supabase.rpc("create_organization", {
    p_name: o.name,
    p_timezone: o.timezone,
    p_usdot_number: o.usdotNumber,
    p_mc_number: o.mcNumber,
    p_address_line1: o.addressLine1,
    p_city: o.city,
    p_state: o.state,
    p_zip: o.zip,
  });
  if (error || !organizationId) {
    logError("createOrganization", error, { userId: ctx.user.id });
    return errorState(UNEXPECTED, formData);
  }
  await setActiveOrg(organizationId);
  redirect("/dashboard");
}

export async function switchOrganization(formData: FormData): Promise<void> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  const parsed = switchOrganizationSchema.safeParse(Object.fromEntries(formData));
  if (parsed.success && ctx.memberships.some((m) => m.organizationId === parsed.data.organizationId)) {
    await setActiveOrg(parsed.data.organizationId);
  }
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Members & invitations (owner/admin)
// ---------------------------------------------------------------------------

export async function inviteMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(["owner", "admin"]);
  if (!ctx) return errorState(NO_PERMISSION);

  const parsed = inviteMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const { email, role } = parsed.data;
  const org = ctx.active;

  if (!assignableRoles(org.role).includes(role)) {
    return { ...validationErrorFor("role", "Only an owner can invite another owner."), values: { email, role } };
  }

  const supabase = await createClient();
  const { data: members, error: membersError } = await supabase.rpc("list_organization_members", {
    p_org: org.organizationId,
  });
  if (membersError) {
    logError("inviteMember.members", membersError);
    return errorState(UNEXPECTED, formData);
  }
  if (members?.some((m) => m.email.toLowerCase() === email)) {
    return { ...validationErrorFor("email", "This person is already a member."), values: { email, role } };
  }

  const token = generateToken();
  const { error } = await supabase.from("invitations").insert({
    organization_id: org.organizationId,
    email,
    role,
    token_hash: hashToken(token),
    invited_by: ctx.user.id,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        ...validationErrorFor("email", "An invitation is already pending for this email. Revoke it to send a new one."),
        values: { email, role },
      };
    }
    logError("inviteMember.insert", error, { organizationId: org.organizationId });
    return errorState(error.code === "42501" ? NO_PERMISSION : UNEXPECTED, formData);
  }
  revalidatePath(MEMBERS_PATH);

  const link = `${SITE}/invite/${token}`;
  const inviter =
    [ctx.user.user_metadata?.first_name, ctx.user.user_metadata?.last_name].filter(Boolean).join(" ") ||
    ctx.user.email ||
    "A colleague";
  const roleLabel = ROLE_LABELS[role];

  try {
    await sendEmail({
      to: email,
      subject: `${inviter} invited you to ${org.organizationName} on Fleet Manage Pro`,
      text: [
        `${inviter} invited you to join ${org.organizationName} on Fleet Manage Pro as ${roleLabel}.`,
        "",
        `Accept the invitation: ${link}`,
        "",
        "This link expires in 7 days. If you weren't expecting this, you can ignore this email.",
      ].join("\n"),
      html: `<p>${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(org.organizationName)}</strong> on Fleet Manage Pro as <strong>${escapeHtml(roleLabel)}</strong>.</p>
<p><a href="${escapeHtml(link)}">Accept the invitation</a></p>
<p>This link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>`,
    });
  } catch (sendError) {
    if (!(sendError instanceof EmailNotConfiguredError)) logError("inviteMember.email", sendError);
    return {
      status: "success",
      message: `Invitation created, but the email to ${email} could not be sent. Copy the link below and send it yourself.`,
      data: { inviteLink: link },
    };
  }
  return {
    status: "success",
    message: `Invitation sent to ${email}.`,
    data: { inviteLink: link },
  };
}

export async function revokeInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(["owner", "admin"]);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = revokeInvitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", parsed.data.invitationId)
    .eq("organization_id", ctx.active.organizationId)
    .select("id");
  if (error) {
    logError("revokeInvitation", error);
    return errorState(UNEXPECTED);
  }
  if (!data?.length) return errorState(NO_PERMISSION);
  revalidatePath(MEMBERS_PATH);
  return { status: "success", message: "Invitation revoked." };
}

export async function changeMemberRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(["owner", "admin"]);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = changeMemberRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState("Choose a valid role.");
  const { userId, role } = parsed.data;
  if (!assignableRoles(ctx.active.role).includes(role)) {
    return errorState("Only an owner can make someone an owner.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("organization_id", ctx.active.organizationId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    if (error.hint !== "last_owner") logError("changeMemberRole", error);
    return errorState(membershipError(error));
  }
  if (!data?.length) return errorState(NO_PERMISSION);
  revalidatePath(MEMBERS_PATH);
  return { status: "success", message: "Role updated." };
}

export async function removeMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction();
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = removeMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);
  const { userId } = parsed.data;
  const isSelf = userId === ctx.user.id;

  if (!isSelf) {
    const supabase = await createClient();
    const { data: target } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", ctx.active.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!target || !canManageMember(ctx.active.role, target.role)) return errorState(NO_PERMISSION);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", ctx.active.organizationId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    if (error.hint !== "last_owner") logError("removeMember", error);
    return errorState(membershipError(error));
  }
  if (!data?.length) return errorState(NO_PERMISSION);

  if (isSelf) {
    (await cookies()).delete(ACTIVE_ORG_COOKIE);
    redirect("/dashboard");
  }
  revalidatePath(MEMBERS_PATH);
  return { status: "success", message: "Member removed." };
}

// ---------------------------------------------------------------------------
// Accepting an invitation (any signed-in user holding the token)
// ---------------------------------------------------------------------------

export async function acceptInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  const parsed = acceptInvitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState("This invitation link is not valid.");

  const supabase = await createClient();
  const { data: organizationId, error } = await supabase.rpc("accept_invitation", {
    p_token: parsed.data.token,
  });
  if (error || !organizationId) {
    if (error?.code === "P0002") return errorState("This invitation is no longer valid. It may have expired or already been used.");
    if (error?.code === "42501") return errorState(`${error.message}.`);
    logError("acceptInvitation", error, { userId: ctx.user.id });
    return errorState(UNEXPECTED);
  }
  await setActiveOrg(organizationId);
  redirect("/dashboard");
}
