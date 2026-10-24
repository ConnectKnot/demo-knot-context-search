import { NextRequest, NextResponse } from "next/server";
import { KnotClient } from "@knot-ai/sdk";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const sessionId = searchParams.get("session_id");

  if (!code || !sessionId) {
    return NextResponse.redirect(new URL("/?error=missing_code", request.url));
  }

  const secret = process.env.KNOT_SECRET;
  const baseUrl = process.env.KNOT_BASE_URL || "https://production.connectknot.com/api";

  if (secret) {
    try {
      const knot = new KnotClient({ secret, baseUrl });
      const connection = await knot.exchangeConnectCode({
        session_id: sessionId,
        code,
        callback_url: request.url.split("?")[0],
        code_verifier: "stored_pkce_verifier", // Retrieved from session cookie or database in production
        state: state || "",
        expected_state: state || "",
      });

      // In production, save connection.id to the user record
      const redirectUrl = new URL(`/?connectionId=${connection.id}`, request.url);
      return NextResponse.redirect(redirectUrl);
    } catch (err) {
      console.error("Failed to exchange code:", err);
      return NextResponse.redirect(new URL("/?error=exchange_failed", request.url));
    }
  }

  // Demo fallback
  return NextResponse.redirect(
    new URL(`/?connectionId=demo_conn_${Date.now()}`, request.url)
  );
}
