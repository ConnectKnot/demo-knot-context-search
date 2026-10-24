import { NextRequest, NextResponse } from "next/server";
import { KnotClient } from "@knot-ai/sdk";

// Synthetic fallback data for instant demo mode if user hasn't connected a real Knot secret yet
const DEMO_ITEMS = [
  {
    id: "demo-item-1",
    kind: "decision",
    statement: "Frontend uses React 19, Next.js 15 App Router, and Tailwind CSS v4.",
    confidence: "high",
    observed_at: new Date().toISOString(),
  },
  {
    id: "demo-item-2",
    kind: "fact",
    statement: "Primary database is PostgreSQL 16 on Neon with AES-256-GCM envelope encryption.",
    confidence: "high",
    observed_at: new Date().toISOString(),
  },
  {
    id: "demo-item-3",
    kind: "constraint",
    statement: "Never persist raw chat transcripts or provider-private prompts to shared memory.",
    confidence: "high",
    observed_at: new Date().toISOString(),
  },
  {
    id: "demo-item-4",
    kind: "goal",
    statement: "Maintain sub-50ms context retrieval latency across all MCP tool endpoints.",
    confidence: "high",
    observed_at: new Date().toISOString(),
  },
  {
    id: "demo-item-5",
    kind: "preference",
    statement: "Lead UI copy with 'Shared Brain' instead of generic AI memory middleware terminology.",
    confidence: "high",
    observed_at: new Date().toISOString(),
  },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const connectionId = searchParams.get("connectionId") || "";
  const environment = searchParams.get("env") || "production";

  const baseUrl =
    environment === "staging"
      ? "https://staging.connectknot.com/api"
      : process.env.KNOT_BASE_URL || "https://production.connectknot.com/api";

  const secret = process.env.KNOT_SECRET;

  // Real SDK call if secret and connectionId are provided
  if (secret && connectionId && !connectionId.startsWith("demo_")) {
    try {
      const knot = new KnotClient({
        secret,
        baseUrl,
      });

      const result = await knot.query(connectionId, {
        query: query.trim() || "*",
        limit: 8,
      });

      return NextResponse.json({
        success: true,
        source: "knot_cloud",
        environment,
        items: result.current,
      });
    } catch (error: unknown) {
      console.error("Knot search error:", error);
      const message = error instanceof Error ? error.message : "Failed to query Knot context";
      return NextResponse.json(
        {
          success: false,
          error: message,
        },
        { status: 500 }
      );
    }
  }

  // Graceful in-memory demo search for instant preview
  const qLower = query.toLowerCase().trim();
  const matched = qLower
    ? DEMO_ITEMS.filter(
        (item) =>
          item.statement.toLowerCase().includes(qLower) ||
          item.kind.toLowerCase().includes(qLower)
      )
    : DEMO_ITEMS;

  return NextResponse.json({
    success: true,
    source: "demo_sandbox",
    environment,
    items: matched,
  });
}
