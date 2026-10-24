import { NextRequest, NextResponse } from "next/server";
import { KnotClient } from "@knot-ai/sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { statement, kind = "decision", connectionId, environment = "production" } = body;

    if (!statement || typeof statement !== "string") {
      return NextResponse.json(
        { success: false, error: "Statement is required" },
        { status: 400 }
      );
    }

    const baseUrl =
      environment === "staging"
        ? "https://staging.connectknot.com/api"
        : process.env.KNOT_BASE_URL || "https://production.connectknot.com/api";

    const secret = process.env.KNOT_SECRET;

    if (secret && connectionId && !connectionId.startsWith("demo_")) {
      const knot = new KnotClient({
        secret,
        baseUrl,
      });

      const result = await knot.contribute(connectionId, {
        kind,
        statement: statement.trim(),
        idempotency_key: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      });

      return NextResponse.json({
        success: true,
        source: "knot_cloud",
        result,
      });
    }

    // Demo sandbox response
    return NextResponse.json({
      success: true,
      source: "demo_sandbox",
      result: {
        outcome: "accepted",
        item: {
          id: `demo-${Date.now()}`,
          kind,
          statement: statement.trim(),
          confidence: "high",
          observed_at: new Date().toISOString(),
        },
      },
    });
  } catch (error: unknown) {
    console.error("Knot contribute error:", error);
    const message = error instanceof Error ? error.message : "Failed to contribute decision";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
