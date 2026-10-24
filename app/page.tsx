"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { ContinueWithKnot } from "@knot-ai/sdk/react";

interface ContextItem {
  id: string;
  kind: "decision" | "fact" | "constraint" | "goal" | "preference" | string;
  statement: string;
  confidence?: string;
  observed_at?: string;
}

interface ChatResult {
  prompt: string;
  systemPrompt: string;
  retrievedInvariants: ContextItem[];
  answer: string;
}

export default function Home() {
  const [env, setEnv] = useState<"production" | "staging">("production");
  const [connectionId, setConnectionId] = useState<string>("demo_conn_preview");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "chat" | "add" | "code">("search");
  const [items, setItems] = useState<ContextItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKind, setSelectedKind] = useState<string>("all");

  // Chat simulator state
  const [chatPrompt, setChatPrompt] = useState("What is our database stack and encryption policy?");
  const [chatResult, setChatResult] = useState<ChatResult | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  // New invariant contribution state
  const [newStatement, setNewStatement] = useState("");
  const [newKind, setNewKind] = useState("decision");
  const [contributeStatus, setContributeStatus] = useState<string | null>(null);

  // Staging ping state
  const [pingState, setPingState] = useState<"idle" | "pinging" | "ready" | "error">("idle");
  const [latency, setLatency] = useState<number | null>(null);

  // Code snippet copy state
  const [copied, setCopied] = useState(false);

  const healthUrl =
    env === "staging"
      ? "https://staging.connectknot.com/api/healthz"
      : "https://production.connectknot.com/api/healthz";

  const originUrl =
    env === "staging"
      ? "https://staging.connectknot.com"
      : "https://production.connectknot.com";

  // Perform search query
  const fetchItems = async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&connectionId=${connectionId}&env=${env}`
      );
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems(searchQuery);
  }, [searchQuery, env, connectionId]);

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

  // Run chat simulator
  const handleRunChat = async () => {
    if (!chatPrompt.trim()) return;
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: chatPrompt,
          connectionId,
          environment: env,
        }),
      });
      const data = await res.json();
      setChatResult(data);
    } catch (err) {
      console.error("Chat simulator failed:", err);
    } finally {
      setChatLoading(false);
    }
  };

  // Add invariant contribution
  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatement.trim()) return;
    setContributeStatus("saving");
    try {
      const res = await fetch("/api/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: newStatement,
          kind: newKind,
          connectionId,
          environment: env,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setContributeStatus("Saved successfully!");
        setNewStatement("");
        fetchItems(searchQuery);
        setTimeout(() => setContributeStatus(null), 3000);
      } else {
        setContributeStatus("Error: " + (data.error || "Save failed"));
      }
    } catch {
      setContributeStatus("Failed to contribute decision");
    }
  };

  const filteredItems = items.filter((item) =>
    selectedKind === "all" ? true : item.kind === selectedKind
  );

  const integrationCodeSnippet = `import { KnotClient } from '@knot-ai/sdk';

// 1. Initialize client
const knot = new KnotClient({
  secret: process.env.KNOT_SECRET!, // set in .env
  baseUrl: '${originUrl}/api',
});

// 2. Query user's verified invariants on Turn 0
const { current } = await knot.query(user.knotConnectionId, {
  query: userPrompt,
  limit: 5,
});

// 3. Prepend into your LLM system prompt
const invariants = current.map(item => \`[\${item.kind.toUpperCase()}] \${item.statement}\`).join('\\n');
const systemPrompt = \`You are an assistant. User verified rules:\\n\${invariants}\`;`;

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
            <span className="hidden sm:inline-block text-xs font-mono px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-muted-foreground">
              Demo App
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Target Environment Toggle */}
            <div className="inline-flex rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setEnv("production")}
                className={`px-3 py-1 rounded-md transition-all ${
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
                className={`px-3 py-1 rounded-md transition-all ${
                  env === "staging"
                    ? "bg-white dark:bg-zinc-800 text-black dark:text-white shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-black dark:hover:text-white"
                }`}
              >
                Staging
              </button>
            </div>

            <a
              href="https://github.com/Knot-Repo/knot-sdk"
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

        {/* Hero Card & Drop-in Auth Connection */}
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900/50 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
              <ShieldCheck size={13} />
              <span>One Shared Brain for All Your AIs</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Search your user&apos;s project invariants on Turn 0.
            </h1>
            <p className="text-sm text-foreground/65 leading-relaxed">
              When a user connects Knot, your app queries their tech stack, architectural decisions, and rules established across ChatGPT, Claude, and Cursor without manual prompt copying.
            </p>
          </div>

          <div className="shrink-0 flex flex-col items-center md:items-end gap-2 w-full md:w-auto">
            <ContinueWithKnot
              clientId="demo_search_client"
              externalUserId="demo_user_123"
              appName="Knot Recall Demo"
              knotUrl={originUrl}
              onSuccess={(result) => {
                setConnectionId(result.connectionId);
                alert(`Connected to Knot!\nConnection ID: ${result.connectionId}\nReach: ${result.reach}`);
              }}
            />
            <span className="text-[11px] font-mono text-muted-foreground">
              Connection: {connectionId.slice(0, 16)}...
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-black/10 dark:border-white/10 gap-2">
          {[
            { id: "search", label: "Context Search", icon: Search },
            { id: "chat", label: "Turn-0 AI Prompt Simulator", icon: Bot },
            { id: "add", label: "Add Decision (Writeback)", icon: PlusCircle },
            { id: "code", label: "12-Line Integration Code", icon: Code2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`inline-flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
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

        {/* TAB 1: CONTEXT SEARCH */}
        {activeTab === "search" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-foreground/40" />
                <input
                  type="text"
                  placeholder="Search decisions, database stack, encryption constraints, or goals..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-foreground transition-all"
                />
              </div>

              {/* Kind Filters */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {["all", "decision", "fact", "constraint", "goal", "preference"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedKind(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                      selectedKind === k
                        ? "bg-foreground text-background font-semibold"
                        : "bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            {/* Results Grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900/60 p-4 space-y-2 hover:border-black/25 dark:hover:border-white/25 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/5 dark:bg-white/10">
                      {item.kind}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {item.confidence || "high"} confidence
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{item.statement}</p>
                </div>
              ))}

              {filteredItems.length === 0 && !loading && (
                <div className="col-span-2 text-center py-12 rounded-xl border border-dashed border-black/15 dark:border-white/15">
                  <p className="text-sm text-muted-foreground">No matching invariants found.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: TURN-0 AI PROMPT SIMULATOR */}
        {activeTab === "chat" && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Turn-0 System Prompt Simulator</h2>
              <p className="text-xs text-muted-foreground">
                Observe how Knot context is automatically retrieved and injected into your model&apos;s system prompt.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={chatPrompt}
                onChange={(e) => setChatPrompt(e.target.value)}
                placeholder="Enter prompt for the AI (e.g. What database stack do we use?)"
                className="flex-1 h-11 px-4 rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
              />
              <button
                type="button"
                onClick={handleRunChat}
                disabled={chatLoading || !chatPrompt.trim()}
                className="px-5 h-11 rounded-xl bg-foreground text-background font-semibold text-xs inline-flex items-center gap-2 hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
              >
                <span>{chatLoading ? "Injecting..." : "Simulate Turn 0"}</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {chatResult && (
              <div className="grid md:grid-cols-2 gap-4">
                {/* Injected System Prompt */}
                <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-4 space-y-2">
                  <span className="text-xs font-mono font-bold text-primary">
                    1. Injected System Prompt
                  </span>
                  <pre className="text-xs font-mono bg-black/5 dark:bg-black/40 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {chatResult.systemPrompt}
                  </pre>
                </div>

                {/* Model Completion */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-zinc-900 p-4 space-y-2">
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    2. AI Response (Zero Cold-Start)
                  </span>
                  <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap bg-white dark:bg-black/40 p-3 rounded-lg border border-black/5">
                    {chatResult.answer}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ADD DECISION */}
        {activeTab === "add" && (
          <div className="max-w-xl space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Contribute a New Invariant</h2>
              <p className="text-xs text-muted-foreground">
                Save an architectural decision back to Knot. Connected tools (Cursor, Claude, ChatGPT) immediately know about it too.
              </p>
            </div>

            <form onSubmit={handleContribute} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Invariant Kind
                </label>
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-xs font-medium"
                >
                  <option value="decision">Decision (Architectural choice)</option>
                  <option value="fact">Fact (Technical stack, API version)</option>
                  <option value="constraint">Constraint (Security or privacy rule)</option>
                  <option value="goal">Goal (Milestone or target)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Statement
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
                disabled={!newStatement.trim()}
                className="px-5 py-2.5 rounded-lg bg-foreground text-background font-semibold text-xs hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
              >
                Save to Shared Brain
              </button>

              {contributeStatus && (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {contributeStatus}
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
                <h2 className="text-base font-semibold">12-Line Integration Code</h2>
                <p className="text-xs text-muted-foreground">
                  Paste this directly into your application backend to query user invariants on Turn 0.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(integrationCodeSnippet);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-black/15 text-xs font-medium hover:bg-black/5"
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
