import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["email", "signup", "recovery", "invite", "magiclink", "email_change"];

/** Landing point for links in Supabase Auth emails (confirmation, password reset). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"), publicEnv.NEXT_PUBLIC_SITE_URL);

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, publicEnv.NEXT_PUBLIC_SITE_URL));
    }
    console.error("[auth.confirm] verifyOtp failed", { type, code: error.code });
  }

  const url = new URL("/sign-in", publicEnv.NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("error", "link_invalid");
  return NextResponse.redirect(url);
}
