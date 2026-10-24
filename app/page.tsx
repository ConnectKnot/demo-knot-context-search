"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  Zap,
  ShieldCheck,
  Bot,
  PlusCircle,
  Code2,
  Check,
  Copy,
  Activity,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  FolderGit2,
  SlidersHorizontal,
  LogOut,
  Lock,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { ContinueWithKnot } from "@knot-ai/sdk/react";

interface ContextItem {
  id: string;
  kind:
    | "decision"
    | "fact"
    | "constraint"
    | "goal"
    | "preference"
    | "project_state"
    | "personal"
    | string;
  statement: string;
  title?: string;
  rationale?: string | null;
  confidence?: string;
  entityId?: string;
  entityName?: string;
  sourceClientName?: string | null;
  createdAt?: string;
}

interface ActiveThreadState {
  id: string;
  project_label?: string;
  task_summary: string;
  activity_summary?: string | null;
  source?: string;
  current?: boolean;
  updated_at?: string;
}

interface KnotConnectionPermissions {
  knotConnect?: boolean;
  userContext?: boolean;
  selectedContextCount?: number;
  projectContextRead?: boolean;
  projectContextContribute?: boolean;
}

interface KnotOAuthSession {
  accessToken: string;
  refreshToken?: string;
  clientId: string;
  redirectUri: string;
  grantedScopes: string[];
  connectedAt: string;
}

interface ChatResult {
  prompt?: string;
  systemPrompt: string;
  retrievedMemories: ContextItem[];
  answer: string;
}

const DEFAULT_MEMORIES: ContextItem[] = [
  {
    id: "mem-1",
    kind: "decision",
    statement: "Frontend uses React 19, Next.js 15 App Router, and Tailwind CSS v4.",
    confidence: "high",
    entityName: "Knot Core & SDK",
    sourceClientName: "Claude",
  },
  {
    id: "mem-2",
    kind: "fact",
    statement: "Primary database is PostgreSQL 16 on Neon with AES-256-GCM envelope encryption.",
    confidence: "high",
    entityName: "Knot Core & SDK",
    sourceClientName: "Cursor",
  },
  {
    id: "mem-3",
    kind: "constraint",
    statement: "Never persist raw chat transcripts or provider-private prompts to shared memory.",
    confidence: "high",
    entityName: "Security & Privacy",
    sourceClientName: "ChatGPT",
  },
  {
    id: "mem-4",
    kind: "goal",
    statement: "Maintain sub-50ms context retrieval latency across all MCP tool endpoints.",
    confidence: "high",
    entityName: "Knot Core & SDK",
    sourceClientName: "Antigravity",
  },
  {
    id: "mem-5",
    kind: "preference",
    statement: "Lead UI copy with 'Shared Brain' instead of generic AI memory middleware terminology.",
    confidence: "high",
    entityName: "Developer Docs",
    sourceClientName: "Claude",
  },
];

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateBrowserPkce(): Promise<{ verifier: string; challenge: string; state: string }> {
  const verifierBytes = new Uint8Array(32);
  window.crypto.getRandomValues(verifierBytes);
  const verifier = toBase64Url(verifierBytes);

  const stateBytes = new Uint8Array(24);
  window.crypto.getRandomValues(stateBytes);
  const state = toBase64Url(stateBytes);

  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  const challenge = toBase64Url(new Uint8Array(digest));

  return { verifier, challenge, state };
}

function computeMatchTier(item: ContextItem, query: string): "Direct Match" | "Related Context" | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const terms = q
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/gi, ""))
    .filter((t) => t.length >= 3 && !["what", "who", "how", "are", "the", "for", "and", "with", "our", "from"].includes(t));

  const haystack = `${item.statement} ${item.rationale || ""} ${item.entityName || ""}`.toLowerCase();
  if (haystack.includes(q) || (terms.length > 0 && terms.some((t) => haystack.includes(t)))) {
    return "Direct Match";
  }
  return "Related Context";
}

const OAUTH_PENDING_KEY = "knot_recall_oauth_pending_v1";
const SESSION_KEY_PREFIX = "knot_recall_session_v1_";

export default function Home() {
  const [env, setEnv] = useState<"production" | "staging">("production");
  const [session, setSession] = useState<KnotOAuthSession | null>(null);
  const [permissions, setPermissions] = useState<KnotConnectionPermissions | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "chat" | "add" | "code">("search");
  const [items, setItems] = useState<ContextItem[]>(DEFAULT_MEMORIES);
  const [allMemories, setAllMemories] = useState<ContextItem[]>(DEFAULT_MEMORIES);
  const [activeStates, setActiveStates] = useState<ActiveThreadState[]>([]);
  const [knownProjects, setKnownProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedKind, setSelectedKind] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Chat simulator state
  const [chatPrompt, setChatPrompt] = useState("What is our pricing model and database stack?");
  const [chatResult, setChatResult] = useState<ChatResult | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  // New memory contribution state
  const [newStatement, setNewStatement] = useState("");
  const [newKind, setNewKind] = useState("decision");
  const [newProjectHint, setNewProjectHint] = useState("");
  const [contributeStatus, setContributeStatus] = useState<string | null>(null);
  const [contributeError, setContributeError] = useState<string | null>(null);
  const [contributing, setContributing] = useState(false);

  // Staging ping state
  const [pingState, setPingState] = useState<"idle" | "pinging" | "ready" | "error">("idle");
  const [latency, setLatency] = useState<number | null>(null);

  // Code snippet copy state
  const [copied, setCopied] = useState(false);
  // Preview modal toggle for developers who also want to inspect the embedded SDK sheet
  const [showSdkPreviewButton, setShowSdkPreviewButton] = useState(false);

  const originUrl =
    env === "staging"
      ? "https://staging.connectknot.com"
      : "https://production.connectknot.com";

  const healthUrl = `${originUrl}/api/healthz`;

  // Helper to call Knot's authenticated MCP JSON-RPC endpoint directly
  const callKnotMcp = useCallback(
    async (
      targetOrigin: string,
      accessToken: string,
      toolName: string,
      args: Record<string, unknown> = {}
    ) => {
      const res = await fetch(`${targetOrigin}/api/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `${toolName}-${Date.now()}`,
          method: "tools/call",
          params: {
            name: toolName,
            arguments: args,
          },
        }),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error("UNAUTHORIZED");
      }

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload) {
        throw new Error(`Knot MCP request failed (${res.status})`);
      }
      if (payload.error) {
        throw new Error(payload.error.message || "MCP error");
      }
      if (payload.result?.isError) {
        const errText =
          payload.result?.content?.[0]?.text || "Knot tool execution returned an error.";
        throw new Error(errText);
      }
      return payload.result?.structuredContent ?? payload.result ?? {};
    },
    []
  );

  // Sync live context from Knot for the authenticated user
  const syncLiveKnotContext = useCallback(
    async (
      activeSession: KnotOAuthSession,
      targetOrigin: string,
      queryText = "",
      projectFilter = "all"
    ) => {
      setLoading(true);
      setAuthError(null);
      try {
        const trimmedQuery = queryText.trim().slice(0, 480);
        const entityHint =
          projectFilter !== "all" && projectFilter !== "__personal__"
            ? projectFilter
            : undefined;

        const [statusRes, relevantRes, personalRes, activeStateRes] = await Promise.allSettled([
          callKnotMcp(targetOrigin, activeSession.accessToken, "get_knot_connection_status", {}),
          callKnotMcp(targetOrigin, activeSession.accessToken, "get_relevant_context", {
            query: trimmedQuery,
            ...(entityHint ? { entity_hint: entityHint } : {}),
          }),
          trimmedQuery
            ? callKnotMcp(targetOrigin, activeSession.accessToken, "search_context", {
                query: trimmedQuery,
              })
            : callKnotMcp(targetOrigin, activeSession.accessToken, "list_context", {
                offset: 0,
              }),
          callKnotMcp(targetOrigin, activeSession.accessToken, "get_active_state", {}),
        ]);

        if (
          (statusRes.status === "rejected" && statusRes.reason?.message === "UNAUTHORIZED") ||
          (relevantRes.status === "rejected" && relevantRes.reason?.message === "UNAUTHORIZED")
        ) {
          window.localStorage.removeItem(`${SESSION_KEY_PREFIX}${env}`);
          setSession(null);
          setPermissions(null);
          setAuthError("Your Knot connection expired or was revoked. Reconnect your Knot account.");
          setAllMemories(DEFAULT_MEMORIES);
          setItems(DEFAULT_MEMORIES);
          return;
        }

        if (statusRes.status === "fulfilled" && statusRes.value?.permissions) {
          setPermissions(statusRes.value.permissions as KnotConnectionPermissions);
        }

        const mergedItems: ContextItem[] = [];
        const discoveredProjects = new Set<string>();

        if (relevantRes.status === "fulfilled" && Array.isArray(relevantRes.value?.items)) {
          for (const raw of relevantRes.value.items) {
            const pName =
              typeof raw.entityName === "string" && raw.entityName.trim()
                ? raw.entityName.trim()
                : undefined;
            if (pName) discoveredProjects.add(pName);

            mergedItems.push({
              id: String(raw.id),
              kind: String(raw.kind || "fact"),
              statement: String(raw.statement || ""),
              rationale: raw.rationale ?? null,
              confidence: String(raw.confidence || "high"),
              entityId: raw.entityId ? String(raw.entityId) : undefined,
              entityName: pName,
              sourceClientName: raw.sourceClientName ?? null,
              createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
            });
          }
        }

        if (
          personalRes.status === "fulfilled" &&
          Array.isArray(personalRes.value?.items) &&
          (projectFilter === "all" || projectFilter === "__personal__")
        ) {
          for (const raw of personalRes.value.items) {
            const title = typeof raw.title === "string" ? raw.title.trim() : "";
            const content = typeof raw.content === "string" ? raw.content.trim() : "";
            const statement = title && content ? `${title}: ${content}` : content || title;
            if (!statement) continue;
            mergedItems.push({
              id: `personal-${raw.id}`,
              kind: "personal",
              title,
              statement,
              confidence: "high",
              entityName: "Saved Memories",
              sourceClientName:
                typeof raw.provenance?.client_name === "string"
                  ? raw.provenance.client_name
                  : "Your Knot",
            });
          }
        }

        if (activeStateRes.status === "fulfilled" && Array.isArray(activeStateRes.value?.states)) {
          const states = activeStateRes.value.states as ActiveThreadState[];
          setActiveStates(states);
          for (const st of states) {
            if (st.project_label && st.project_label.trim()) {
              discoveredProjects.add(st.project_label.trim());
            }
          }
        }

        setKnownProjects((prev) => {
          const combined = new Set([...prev, ...Array.from(discoveredProjects)]);
          return Array.from(combined);
        });

        setAllMemories(mergedItems);
        setItems(mergedItems);
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : "Could not load memories from your Knot account."
        );
      } finally {
        setLoading(false);
      }
    },
    [callKnotMcp, env]
  );

  // Start real OAuth 2.1 PKCE redirect to Knot's /authorize consent page
  const handleStartRealKnotOAuth = async () => {
    if (typeof window === "undefined") return;
    setAuthLoading(true);
    setAuthError(null);

    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;

      // 1. Dynamic Client Registration on the selected Knot environment
      const regRes = await fetch(`${originUrl}/api/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Knot Recall (Context Search Demo)",
          redirect_uris: [redirectUri],
        }),
      });
      const regData = await regRes.json().catch(() => ({}));
      if (!regRes.ok || !regData.client_id) {
        throw new Error(
          regData.error_description ||
            regData.message ||
            "Could not register OAuth client with Knot."
        );
      }

      // 2. Generate S256 PKCE verifier & challenge
      const { verifier, challenge, state } = await generateBrowserPkce();

      window.localStorage.setItem(
        OAUTH_PENDING_KEY,
        JSON.stringify({
          verifier,
          state,
          clientId: regData.client_id,
          redirectUri,
          env,
          originUrl,
        })
      );

      // 3. Redirect user to Knot's real OAuth 2.1 consent page (/authorize)
      const authorizeUrl = new URL(`${originUrl}/api/oauth/authorize`);
      authorizeUrl.searchParams.set("client_id", regData.client_id);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("code_challenge", challenge);
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
      authorizeUrl.searchParams.set(
        "scope",
        "knot:connect context:read active_state:read active_state:contribute context:contribute:project context:propose"
      );

      window.location.assign(authorizeUrl.toString());
    } catch (err) {
      setAuthLoading(false);
      setAuthError(
        err instanceof Error
          ? err.message
          : "Could not start Knot login. If using Staging, click 'Wake up staging' first."
      );
    }
  };

  // Disconnect and revoke OAuth token
  const handleDisconnect = async () => {
    if (!session) return;
    const tokenToRevoke = session.accessToken;
    const clientToRevoke = session.clientId;
    window.localStorage.removeItem(`${SESSION_KEY_PREFIX}${env}`);
    setSession(null);
    setPermissions(null);
    setKnownProjects([]);
    setActiveStates([]);
    setSelectedProject("all");
    setAllMemories(DEFAULT_MEMORIES);
    setItems(DEFAULT_MEMORIES);
    setChatResult(null);

    try {
      await fetch(`${originUrl}/api/oauth/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenToRevoke, client_id: clientToRevoke }),
      });
    } catch {
      // Ignore network errors on revoke cleanup
    }
  };

  // On mount: check for OAuth 2.1 callback (?code=...&state=...) or existing saved session
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (
      tabParam === "chat" ||
      tabParam === "add" ||
      tabParam === "code" ||
      tabParam === "search"
    ) {
      setActiveTab(tabParam);
    }

    const code = params.get("code");
    const returnedState = params.get("state");
    const oauthError = params.get("error");

    if (code || oauthError) {
      const rawPending = window.localStorage.getItem(OAUTH_PENDING_KEY);
      window.localStorage.removeItem(OAUTH_PENDING_KEY);

      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("code");
      cleanUrl.searchParams.delete("state");
      cleanUrl.searchParams.delete("error");
      cleanUrl.searchParams.delete("error_description");
      window.history.replaceState(
        {},
        document.title,
        cleanUrl.pathname + cleanUrl.search + cleanUrl.hash
      );

      if (oauthError) {
        setAuthError(
          params.get("error_description") ||
            (oauthError === "access_denied"
              ? "You declined the Knot connection request."
              : `OAuth error: ${oauthError}`)
        );
        return;
      }

      if (rawPending && code) {
        try {
          const pending = JSON.parse(rawPending) as {
            verifier: string;
            state: string;
            clientId: string;
            redirectUri: string;
            env: "production" | "staging";
            originUrl: string;
          };

          if (returnedState && pending.state !== returnedState) {
            setAuthError("OAuth state mismatch. Please try connecting again.");
            return;
          }

          setEnv(pending.env);
          setAuthLoading(true);
          void (async () => {
            try {
              const tokenRes = await fetch(`${pending.originUrl}/api/oauth/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  grant_type: "authorization_code",
                  client_id: pending.clientId,
                  code,
                  redirect_uri: pending.redirectUri,
                  code_verifier: pending.verifier,
                }),
              });
              const tokenData = await tokenRes.json().catch(() => ({}));
              if (!tokenRes.ok || !tokenData.access_token) {
                throw new Error(
                  tokenData.error_description ||
                    tokenData.error ||
                    "Failed to exchange Knot authorization code."
                );
              }

              const grantedScopes =
                typeof tokenData.scope === "string"
                  ? tokenData.scope.split(/\s+/).filter(Boolean)
                  : [];

              const newSession: KnotOAuthSession = {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                clientId: pending.clientId,
                redirectUri: pending.redirectUri,
                grantedScopes,
                connectedAt: new Date().toISOString(),
              };

              window.localStorage.setItem(
                `${SESSION_KEY_PREFIX}${pending.env}`,
                JSON.stringify(newSession)
              );
              setSession(newSession);
              await syncLiveKnotContext(newSession, pending.originUrl, "", "all");
            } catch (err) {
              setAuthError(
                err instanceof Error ? err.message : "Failed to complete Knot OAuth login."
              );
            } finally {
              setAuthLoading(false);
            }
          })();
          return;
        } catch {
          setAuthError("Invalid OAuth session state. Please try connecting again.");
        }
      }
    }
  }, [syncLiveKnotContext]);

  // Load saved session when switching between Production and Staging
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).has("code")) return;

    const savedRaw = window.localStorage.getItem(`${SESSION_KEY_PREFIX}${env}`);
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw) as KnotOAuthSession;
        if (parsed?.accessToken) {
          setSession(parsed);
          const targetOrigin =
            env === "staging"
              ? "https://staging.connectknot.com"
              : "https://production.connectknot.com";
          void syncLiveKnotContext(parsed, targetOrigin, searchQuery, selectedProject);
          return;
        }
      } catch {
        window.localStorage.removeItem(`${SESSION_KEY_PREFIX}${env}`);
      }
    }

    setSession(null);
    setPermissions(null);
    setKnownProjects([]);
    setActiveStates([]);
    setSelectedProject("all");
    setAllMemories(DEFAULT_MEMORIES);
    setItems(DEFAULT_MEMORIES);
  }, [env]);

  // Debounced live search when connected, or client-side filter when in demo preview
  useEffect(() => {
    if (!session) {
      const q = searchQuery.trim().toLowerCase();
      const matches = allMemories.filter((item) => {
        if (
          selectedProject !== "all" &&
          selectedProject !== "__personal__" &&
          item.entityName !== selectedProject
        ) {
          return false;
        }
        if (selectedProject === "__personal__" && item.kind !== "personal") {
          return false;
        }
        if (!q) return true;
        return (
          item.statement.toLowerCase().includes(q) ||
          (item.entityName && item.entityName.toLowerCase().includes(q)) ||
          item.kind.toLowerCase().includes(q)
        );
      });
      setItems(matches);
      return;
    }

    const timer = setTimeout(() => {
      void syncLiveKnotContext(session, originUrl, searchQuery, selectedProject);
    }, 260);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedProject, session, originUrl, syncLiveKnotContext]);

  // Ping handler
  const handlePing = async () => {
    setPingState("pinging");
    const start = performance.now();
    try {
      await fetch(healthUrl, { mode: "no-cors", cache: "no-store" });
      const elapsed = Math.round(performance.now() - start);
      setLatency(elapsed);
      setPingState("ready");
    } catch {
      setPingState("error");
    }
  };

  // Run Turn-0 chat simulator against real Knot context (or demo fallback)
  const handleRunChat = async () => {
    if (!chatPrompt.trim()) return;
    setChatLoading(true);

    try {
      let matched: ContextItem[] = [];

      if (session) {
        const entityHint =
          selectedProject !== "all" && selectedProject !== "__personal__"
            ? selectedProject
            : undefined;
        const relevant = await callKnotMcp(
          originUrl,
          session.accessToken,
          "get_relevant_context",
          {
            query: chatPrompt.trim().slice(0, 480),
            ...(entityHint ? { entity_hint: entityHint } : {}),
          }
        );
        if (Array.isArray(relevant?.items) && relevant.items.length > 0) {
          matched = relevant.items.slice(0, 5).map((raw: Record<string, unknown>) => ({
            id: String(raw.id),
            kind: String(raw.kind || "fact"),
            statement: String(raw.statement || ""),
            confidence: String(raw.confidence || "high"),
            entityName: typeof raw.entityName === "string" ? raw.entityName : undefined,
            sourceClientName:
              typeof raw.sourceClientName === "string" ? raw.sourceClientName : null,
          }));
        }
      }

      if (matched.length === 0 && !session) {
        matched = (items.length > 0 ? items : allMemories).slice(0, 4);
      }

      const injectedLines =
        matched.length > 0
          ? matched
              .map(
                (mem) =>
                  `• [${mem.kind.toUpperCase()}${mem.entityName ? ` · ${mem.entityName}` : ""}] ${mem.statement}`
              )
              .join("\n")
          : "• (No matching project memories found for this prompt)";

      const injectedPrompt = `You are an AI assistant connected to the user's Shared Brain via Knot.
Relevant project memories and decisions retrieved on Turn 0:
${injectedLines}

Answer the user's prompt using these shared memories without asking them to repeat their context.`;

      const directMatches = matched.filter(
        (m) => computeMatchTier(m, chatPrompt) === "Direct Match"
      );

      let groundedAnswer = "";
      if (session) {
        if (matched.length === 0) {
          groundedAnswer = `Knot searched your shared projects${
            selectedProject !== "all" && selectedProject !== "__personal__"
              ? ` (filtered to "${selectedProject}")`
              : ""
          } and found 0 saved memories matching "${chatPrompt}".\n\nSave a memory in the "Save Memory" tab or switch your project filter to "All Shared Projects" to broaden retrieval.`;
        } else if (directMatches.length === 0) {
          const summaryBullets = matched.map((mem) => `- ${mem.statement}`).join("\n");
          groundedAnswer = `Note: No exact keyword match for "${chatPrompt}" was found in ${
            selectedProject !== "all" && selectedProject !== "__personal__"
              ? `"${selectedProject}"`
              : "your shared projects"
          }, so Knot surfaced the ${matched.length} closest project memories for background context:\n\n${summaryBullets}\n\n(In production, your app passes the injected system prompt on the left to your LLM so it knows your project context on Turn 0.)`;
        } else {
          const summaryBullets = matched.map((mem) => `- ${mem.statement}`).join("\n");
          groundedAnswer = `Knot retrieved ${matched.length} relevant project memories (${directMatches.length} direct match${directMatches.length === 1 ? "" : "es"}) from your Shared Brain:\n\n${summaryBullets}\n\n(In production, your app passes the injected system prompt on the left to your LLM so it answers "${chatPrompt}" on Turn 0 without you re-explaining your work.)`;
        }
      } else {
        const summaryBullets = matched.map((mem) => `- ${mem.statement}`).join("\n");
        groundedAnswer = `Preview of memories injected into your AI's system prompt on Turn 0:\n\n${summaryBullets}\n\nConnect your Knot account above to test Turn-0 retrieval against your own projects and saved memories.`;
      }

      setChatResult({
        systemPrompt: injectedPrompt,
        retrievedMemories: matched,
        answer: groundedAnswer,
      });
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Could not run Turn-0 query against Knot."
      );
    } finally {
      setChatLoading(false);
    }
  };

  // Save a new memory back to Knot
  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatement.trim() || contributing) return;
    setContributing(true);
    setContributeStatus(null);
    setContributeError(null);

    try {
      if (session) {
        const targetProject =
          newProjectHint.trim() ||
          (selectedProject !== "all" && selectedProject !== "__personal__"
            ? selectedProject
            : knownProjects[0] || undefined);

        const res = await callKnotMcp(originUrl, session.accessToken, "propose_context", {
          kind: newKind,
          statement: newStatement.trim(),
          confidence: "high",
          ...(targetProject ? { entity_hint: targetProject } : {}),
          idempotency_key: `recall_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        });

        const statusLabel =
          res?.status === "accepted"
            ? `Saved directly to your Shared Brain (${res?.entityName || targetProject || "Project Memory"})!`
            : "Suggested to your Knot review queue! Approve it anytime in Your Knot.";

        setContributeStatus(statusLabel);
        setNewStatement("");
        await syncLiveKnotContext(session, originUrl, searchQuery, selectedProject);
      } else {
        const newItem: ContextItem = {
          id: `mem-${Date.now()}`,
          kind: newKind as ContextItem["kind"],
          statement: newStatement.trim(),
          confidence: "high",
          entityName: newProjectHint.trim() || "Sandbox Preview",
          sourceClientName: "Knot Recall Demo",
        };
        setAllMemories((prev) => [newItem, ...prev]);
        setContributeStatus(
          "Saved to local preview! Connect your Knot account above to save directly to your real Shared Brain."
        );
        setNewStatement("");
      }
    } catch (err) {
      setContributeError(
        err instanceof Error
          ? err.message
          : "Could not save memory to Knot. Make sure you enabled project write or memory suggestions when connecting."
      );
    } finally {
      setContributing(false);
      setTimeout(() => setContributeStatus(null), 5000);
    }
  };

  const projectOptions = useMemo(() => {
    const set = new Set<string>(knownProjects);
    for (const item of allMemories) {
      if (item.entityName && item.entityName !== "Saved Memories") {
        set.add(item.entityName);
      }
    }
    return Array.from(set);
  }, [knownProjects, allMemories]);

  const filteredItems = items.filter((item) => {
    if (selectedProject === "__personal__" && item.kind !== "personal") return false;
    if (
      selectedProject !== "all" &&
      selectedProject !== "__personal__" &&
      item.entityName !== selectedProject
    ) {
      return false;
    }
    if (selectedKind === "all") return true;
    return item.kind === selectedKind;
  });

  const integrationCodeSnippet = `import { ContinueWithKnot } from '@knot-ai/sdk/react';

// 1. Let users connect their Shared Brain and choose which projects & permissions to share
<ContinueWithKnot
  mode="oauth"
  appName="Knot Recall Demo"
  knotUrl="${originUrl}"
  onSuccess={async ({ accessToken }) => {
    // 2. Retrieve relevant project memories & decisions on Turn 0
    const res = await fetch('${originUrl}/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: \`Bearer \${accessToken}\`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_relevant_context', arguments: { query: userPrompt } },
      }),
    });
    const { result } = await res.json();
    console.log('Shared project memories:', result.structuredContent.items);
  }}
/>`;

  return (
    <div className="min-h-screen bg-[#fbfaf8] dark:bg-[#0e100d] text-[#151714] dark:text-[#ededec] transition-colors">
      {/* Top Header */}
      <header className="border-b border-black/10 dark:border-white/10 bg-white/70 dark:bg-zinc-900/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold tracking-tight text-lg flex items-center gap-2">
              <span className="h-6 w-6 rounded-md bg-black text-white dark:bg-white dark:text-black flex items-center justify-center font-mono text-xs font-bold">
                K
              </span>
              <span>Knot Recall</span>
            </span>
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-0.5 rounded-full ${
                session
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-semibold"
                  : "bg-black/5 dark:bg-white/10 text-muted-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  session ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                }`}
              />
              {session ? "Shared Brain Connected" : "Sandbox Preview"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Target Environment Toggle */}
            <div className="inline-flex rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setEnv("production")}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  env === "production"
                    ? "bg-white dark:bg-zinc-800 text-black dark:text-white shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-black dark:hover:text-white"
                }`}
              >
                Production
              </button>
              <button
                type="button"
                onClick={() => setEnv("staging")}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  env === "staging"
                    ? "bg-white dark:bg-zinc-800 text-black dark:text-white shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-black dark:hover:text-white"
                }`}
              >
                Staging
              </button>
            </div>

            <a
              href="https://github.com/Knot-Repo/demo-knot-context-search"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold underline text-foreground/80 hover:text-foreground hidden sm:flex items-center gap-1"
            >
              <span>GitHub</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Scale to zero notice when staging is active */}
        {env === "staging" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-950 dark:text-amber-200">
                  <Zap size={14} className="text-amber-600 dark:text-amber-400" />
                  <span>Staging Server Scale to Zero</span>
                </div>
                <p className="text-xs text-amber-900/80 dark:text-amber-300/80">
                  Staging instances scale down to 0 instances when idle to conserve compute. Cold starts take 5 to 10 seconds. Subsequent calls run under 50ms.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePing}
                disabled={pingState === "pinging"}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-600/30 bg-white/80 dark:bg-zinc-900/80 text-xs font-medium text-amber-950 dark:text-amber-200 hover:bg-white dark:hover:bg-zinc-900 transition-all cursor-pointer disabled:opacity-50"
              >
                <Activity size={12} className={pingState === "pinging" ? "animate-spin" : ""} />
                <span>
                  {pingState === "pinging"
                    ? "Warming up..."
                    : pingState === "ready"
                    ? `Active (${latency}ms)`
                    : "Wake up staging"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* OAuth Error Banner */}
        {authError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start justify-between gap-3 text-xs text-red-900 dark:text-red-200">
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{authError}</span>
            </div>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="text-xs font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Hero Card & Real Knot OAuth Connection */}
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900/50 p-6 sm:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-xs">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
              <ShieldCheck size={13} />
              <span>One Shared Brain for All Your AIs</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Don&apos;t start from scratch. Search your shared memories on Turn 0.
            </h1>
            <p className="text-sm text-foreground/65 leading-relaxed">
              Connect your Knot account, choose which projects and permissions to share, and search your project decisions, notes, and saved memories across ChatGPT, Claude, and Cursor.
            </p>
          </div>

          <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2.5 w-full lg:w-auto">
            {!session ? (
              <div className="flex flex-col sm:items-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleStartRealKnotOAuth()}
                  disabled={authLoading}
                  data-testid="real-continue-with-knot-button"
                  className="knot-button min-h-[2.75rem] px-5 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2.5 shadow-sm cursor-pointer disabled:opacity-60"
                >
                  <img
                    src="/knot-mark.webp"
                    alt="Knot"
                    className="h-4 w-auto brightness-0 invert"
                  />
                  <span>
                    {authLoading
                      ? `Redirecting to Knot (${env})...`
                      : "Continue with Knot"}
                  </span>
                </button>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Lock size={11} />
                    OAuth 2.1 PKCE · Choose projects &amp; permissions on{" "}
                    <strong className="text-foreground/80">
                      {env === "staging" ? "staging.connectknot.com" : "connectknot.com"}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSdkPreviewButton((v) => !v)}
                    className="underline hover:text-foreground cursor-pointer"
                  >
                    {showSdkPreviewButton ? "Hide SDK UI preview" : "Preview embedded SDK modal"}
                  </button>
                </div>
                {showSdkPreviewButton && (
                  <div className="pt-1">
                    <ContinueWithKnot
                      clientId="demo_search_client"
                      externalUserId="demo_user_123"
                      appName="Knot Recall Demo"
                      knotUrl={originUrl}
                      variant="secondary"
                      label="Open Embedded SDK Sheet (UI Preview)"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-zinc-900 p-4 space-y-3 w-full sm:min-w-[330px]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-semibold text-foreground">
                      Connected to Knot ({env === "staging" ? "Staging" : "Production"})
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {allMemories.length} shared memories
                  </span>
                </div>

                {/* Granted Permission Badges */}
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      permissions?.projectContextRead !== false
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                        : "bg-black/5 border-black/10 text-muted-foreground"
                    }`}
                  >
                    Read Shared Brain: {permissions?.projectContextRead !== false ? "On" : "Off"}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      permissions?.projectContextContribute
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                        : "bg-black/5 border-black/10 text-muted-foreground"
                    }`}
                  >
                    Save Updates: {permissions?.projectContextContribute ? "On" : "Read-only"}
                  </span>
                  {typeof permissions?.selectedContextCount === "number" && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground/80">
                      {permissions.selectedContextCount} Individual Memories
                    </span>
                  )}
                </div>

                {/* Action buttons: Adjust Projects/Permissions on Knot, Refresh, Disconnect */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-black/10 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => void handleStartRealKnotOAuth()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-foreground text-background text-[11px] font-semibold hover:opacity-90 transition-all cursor-pointer"
                  >
                    <SlidersHorizontal size={11} />
                    <span>Change Shared Projects &amp; Permissions</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void syncLiveKnotContext(session, originUrl, searchQuery, selectedProject)
                    }
                    disabled={loading}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-black/15 dark:border-white/15 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                    <span>Sync</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDisconnect()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-500/25 text-red-600 dark:text-red-400 text-[11px] font-medium hover:bg-red-500/10 cursor-pointer"
                  >
                    <LogOut size={11} />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notice when viewing Sandbox Preview data */}
        {!session && (
          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-foreground/80">
              <Sparkles size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                Showing <strong>5 sample memories</strong> in preview mode. Click{" "}
                <strong>Continue with Knot</strong> above to log into your Knot account, choose which projects and permissions to share, and search your real shared brain.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleStartRealKnotOAuth()}
              className="text-xs font-semibold underline shrink-0 text-left sm:text-right cursor-pointer"
            >
              Connect real Knot account →
            </button>
          </div>
        )}

        {/* Shared Project Filter Bar (populated from the user's shared Knot projects) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground shrink-0 mr-1">
            <FolderGit2 size={13} />
            <span>Projects:</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedProject("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
              selectedProject === "all"
                ? "bg-foreground text-background font-semibold"
                : "bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            All Shared Projects ({allMemories.length})
          </button>
          {projectOptions.map((proj) => (
            <button
              key={proj}
              type="button"
              onClick={() => setSelectedProject(proj)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                selectedProject === proj
                  ? "bg-foreground text-background font-semibold"
                  : "bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              {proj}
            </button>
          ))}
          {session && (
            <button
              type="button"
              onClick={() => setSelectedProject("__personal__")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                selectedProject === "__personal__"
                  ? "bg-foreground text-background font-semibold"
                  : "bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              Saved Memories
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-black/10 dark:border-white/10 gap-2 overflow-x-auto">
          {[
            { id: "search", label: "Search Memories", icon: Search },
            { id: "chat", label: "Turn-0 Prompt Inspector", icon: Bot },
            { id: "add", label: "Save Memory (Writeback)", icon: PlusCircle },
            { id: "code", label: "Integration Code", icon: Code2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`inline-flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all shrink-0 cursor-pointer ${
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: SEARCH MEMORIES */}
        {activeTab === "search" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-foreground/40" />
                <input
                  type="text"
                  placeholder={
                    session
                      ? "Search your shared project decisions, notes, goals, or saved memories..."
                      : "Search project decisions, tech stack notes, rules, or goals..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-foreground transition-all"
                />
              </div>

              {/* Kind Filters */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {[
                  "all",
                  "decision",
                  "fact",
                  "constraint",
                  "goal",
                  "preference",
                  "project_state",
                  ...(session ? ["personal"] : []),
                ].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedKind(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all shrink-0 cursor-pointer ${
                      selectedKind === k
                        ? "bg-foreground text-background font-semibold"
                        : "bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {k === "personal" ? "saved memory" : k.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {loading && (
              <div className="text-xs font-mono text-muted-foreground flex items-center gap-2 py-2">
                <RefreshCw size={12} className="animate-spin" />
                <span>Searching your Shared Brain...</span>
              </div>
            )}

            {/* Results Grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredItems.map((item) => {
                const matchTier = computeMatchTier(item, searchQuery);
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900/60 p-4 space-y-2.5 hover:border-black/25 dark:hover:border-white/25 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/5 dark:bg-white/10">
                            {item.kind === "personal"
                              ? "saved memory"
                              : item.kind.replace("_", " ")}
                          </span>
                          {item.entityName && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                              {item.entityName}
                            </span>
                          )}
                          {matchTier && (
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                matchTier === "Direct Match"
                                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25 font-semibold"
                                  : "bg-black/5 dark:bg-white/5 text-muted-foreground border-black/10 dark:border-white/10"
                              }`}
                            >
                              {matchTier}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {item.sourceClientName ? `from ${item.sourceClientName}` : "Shared Brain"}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-relaxed">{item.statement}</p>
                      {item.rationale && (
                        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-black/15 dark:border-white/15 pl-2.5">
                          {item.rationale}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredItems.length === 0 && !loading && (
                <div className="col-span-2 text-center py-12 rounded-xl border border-dashed border-black/15 dark:border-white/15 space-y-2 px-4">
                  <p className="text-sm font-medium text-foreground">
                    No matching memories found.
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    {session
                      ? "Try clearing your search query, switching the project filter above to 'All Shared Projects', or clicking 'Change Shared Projects & Permissions' to share additional projects."
                      : "Try a different keyword or connect your Knot account to search your real projects."}
                  </p>
                </div>
              )}
            </div>

            {/* Active Continuity Threads from Connected AIs */}
            {session && activeStates.length > 0 && (
              <div className="pt-4 space-y-2.5">
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Recent Work Updates Across Your Connected AIs ({activeStates.length})
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeStates.slice(0, 4).map((st) => (
                    <div
                      key={st.id}
                      className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="font-semibold text-foreground">
                          {st.project_label || "General Workspace"}
                        </span>
                        {st.source && (
                          <span className="text-muted-foreground">from {st.source}</span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-foreground/90">{st.task_summary}</p>
                      {st.activity_summary && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {st.activity_summary}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TURN-0 PROMPT INSPECTOR */}
        {activeTab === "chat" && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                Turn-0 Prompt Inspector (Zero-LLM Context Retrieval)
              </h2>
              <p className="text-xs text-muted-foreground">
                {session
                  ? `Queries your live Knot account${
                      selectedProject !== "all" && selectedProject !== "__personal__"
                        ? ` (currently filtered to project "${selectedProject}")`
                        : ""
                    } via get_relevant_context and shows the exact memories injected into your AI's system prompt before calling an LLM.`
                  : "See how Knot retrieves relevant project memories and prepends them into your model's system prompt on Turn 0."}
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={chatPrompt}
                onChange={(e) => setChatPrompt(e.target.value)}
                placeholder="Enter a user prompt to test Turn-0 memory retrieval (e.g. What is our pricing model?)"
                className="flex-1 h-11 px-4 rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
              />
              <button
                type="button"
                onClick={() => void handleRunChat()}
                disabled={chatLoading || !chatPrompt.trim()}
                className="px-5 h-11 rounded-xl bg-foreground text-background font-semibold text-xs inline-flex items-center gap-2 hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
              >
                <span>{chatLoading ? "Searching Knot..." : "Inspect Turn 0"}</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {chatResult && (
              <div className="grid md:grid-cols-2 gap-4">
                {/* Injected System Prompt */}
                <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-4 space-y-2">
                  <span className="text-xs font-mono font-bold text-primary">
                    1. System Prompt Injected by Knot ({chatResult.retrievedMemories.length} memories)
                  </span>
                  <pre className="text-xs font-mono bg-black/5 dark:bg-black/40 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {chatResult.systemPrompt}
                  </pre>
                </div>

                {/* Retrieval Breakdown */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-zinc-900 p-4 space-y-2">
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    2. Retrieved Memory Context (No LLM Call Required)
                  </span>
                  <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap bg-white dark:bg-black/40 p-3 rounded-lg border border-black/5">
                    {chatResult.answer}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SAVE MEMORY */}
        {activeTab === "add" && (
          <div className="max-w-xl space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Save a New Memory to Your Shared Brain</h2>
              <p className="text-xs text-muted-foreground">
                {session
                  ? "Save a project decision, note, or preference back to your Knot account so Claude, ChatGPT, and Cursor stay in sync."
                  : "Save a project decision or note back to Knot. Connect your Knot account above to save directly to your live Shared Brain."}
              </p>
            </div>

            <form onSubmit={(e) => void handleContribute(e)} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Memory Type
                  </label>
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-xs font-medium"
                  >
                    <option value="decision">Decision (Project or architecture choice)</option>
                    <option value="fact">Fact (Tech stack, API, or reference note)</option>
                    <option value="constraint">Constraint (Rule or boundary to follow)</option>
                    <option value="goal">Goal (Milestone or priority)</option>
                    <option value="preference">Preference (Workflow or style)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Project Name (Optional)
                  </label>
                  <input
                    type="text"
                    list="knot-shared-projects"
                    value={newProjectHint}
                    onChange={(e) => setNewProjectHint(e.target.value)}
                    placeholder={
                      selectedProject !== "all" && selectedProject !== "__personal__"
                        ? selectedProject
                        : knownProjects[0] || "e.g. Knot Core"
                    }
                    className="w-full h-10 px-3 rounded-lg bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-xs"
                  />
                  <datalist id="knot-shared-projects">
                    {projectOptions.map((proj) => (
                      <option key={proj} value={proj} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Memory or Decision
                </label>
                <textarea
                  rows={3}
                  required
                  value={newStatement}
                  onChange={(e) => setNewStatement(e.target.value)}
                  placeholder="e.g. Switched auth to HTTP-only session cookies with Redis rate limiting."
                  className="w-full p-3 rounded-lg bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>

              <button
                type="submit"
                disabled={!newStatement.trim() || contributing}
                className="px-5 py-2.5 rounded-lg bg-foreground text-background font-semibold text-xs hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
              >
                {contributing
                  ? "Saving to Knot..."
                  : session
                  ? "Save to Shared Brain"
                  : "Save to Preview"}
              </button>

              {contributeStatus && (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {contributeStatus}
                </p>
              )}
              {contributeError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {contributeError}
                </p>
              )}
            </form>
          </div>
        )}

        {/* TAB 4: INTEGRATION CODE */}
        {activeTab === "code" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">OAuth 2.1 + Shared Brain Search Integration</h2>
                <p className="text-xs text-muted-foreground">
                  Drop-in OAuth 2.1 PKCE login and Turn-0 memory retrieval with @knot-ai/sdk.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(integrationCodeSnippet);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-black/15 text-xs font-medium hover:bg-black/5 cursor-pointer"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                <span>{copied ? "Copied" : "Copy snippet"}</span>
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-black/5 dark:bg-black/60 font-mono text-xs leading-relaxed overflow-x-auto text-foreground">
              <code>{integrationCodeSnippet}</code>
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
