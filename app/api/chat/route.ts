import { NextRequest, NextResponse } from "next/server";
import { KnotClient } from "@knot-ai/sdk";

export async function POST(request: NextRequest) {
  try {
    const { prompt, connectionId, environment = "production" } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    const baseUrl =
      environment === "staging"
        ? "https://staging.connectknot.com/api"
        : process.env.KNOT_BASE_URL || "https://production.connectknot.com/api";

interface InvariantItem {
  kind: string;
  statement: string;
}

    const secret = process.env.KNOT_SECRET;
    let invariants: InvariantItem[] = [];

    // STEP 1: Query Knot context for relevant invariants
    if (secret && connectionId && !connectionId.startsWith("demo_")) {
      try {
        const knot = new KnotClient({ secret, baseUrl });
        const res = await knot.query(connectionId, { query: prompt, limit: 5 });
        invariants = res.current || [];
      } catch (err) {
        console.warn("Failed to query Knot cloud, falling back to mock context:", err);
      }
    }

    if (invariants.length === 0) {
      // Mock invariants based on query keywords
      invariants = [
        {
          kind: "decision",
          statement: "Frontend uses React 19, Next.js 15 App Router, and Tailwind CSS v4.",
        },
        {
          kind: "constraint",
          statement: "Never persist raw chat transcripts or provider-private prompts to shared memory.",
        },
      ];
    }

    // STEP 2: Format the injected system prompt (Turn 0)
    const contextLines = invariants
      .map((item) => `• [${item.kind.toUpperCase()}] ${item.statement}`)
      .join("\n");

    const systemPrompt = `You are an AI assistant. You have ambient access to the user's verified project invariants from their Knot Shared Brain:\n${contextLines}\n\nAnswer the user's query while strictly honoring these decisions and constraints.`;

    // STEP 3: Return the simulated or real model completion
    const simulatedAnswer = `Based on your verified project invariants in Knot:
- Your application is architected with React 19 and Next.js 15 App Router.
- Privacy guardrails enforce that zero raw chat transcripts are saved to shared memory.

Your prompt "${prompt}" was answered with full awareness of your tech stack and architectural rules, without requiring any background explanations on Turn 0.`;

    return NextResponse.json({
      success: true,
      prompt,
      retrievedInvariants: invariants,
      systemPrompt,
      answer: simulatedAnswer,
    });
  } catch (error: unknown) {
    console.error("Chat simulator error:", error);
    const message = error instanceof Error ? error.message : "Failed to process chat";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
