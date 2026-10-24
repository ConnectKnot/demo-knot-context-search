# Knot Recall · Cross-Agent Shared Brain Search Demo

A modern, production-ready showcase application built with **Next.js 15 (App Router)**, **TypeScript**, and **Tailwind CSS**, demonstrating how to integrate **Knot** into any AI product using [`@knot-ai/sdk`](https://www.npmjs.com/package/@knot-ai/sdk).

[![npm version](https://img.shields.io/npm/v/@knot-ai/sdk.svg?color=emerald)](https://www.npmjs.com/package/@knot-ai/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.1-black.svg)](https://nextjs.org/)

---

## ⚡ What this Demo Showcases

Just like **Plaid** connects bank accounts without sharing passwords, **Knot** connects your users' **Shared Brain** (architectural decisions, tech stack invariants, and constraints established in ChatGPT, Claude, and Cursor) to your application on **Turn 0** without asking users to copy-paste background notes.

This demo demonstrates the complete developer integration lifecycle:
1. **Frontend Consent Sheet (`<ContinueWithKnot />`)**: 3-line drop-in React button for OAuth 2.1 S256 PKCE authorization.
2. **Context Search & Invariant Explorer**: Hybrid lexical and encrypted semantic search across approved user invariants.
3. **Turn-0 AI Prompt Simulator**: Automatically queries Knot for relevant invariants and prepends them into an LLM's system prompt before generating completions.
4. **Decision Writeback**: Submits new architectural decisions and rules back to Knot so other connected AI tools (Cursor, Claude, ChatGPT) immediately know about them.
5. **Dual Environment Support**: Seamless switching between **Production** and **Staging** with built-in scale-to-zero container wake-up diagnostics.

---

## 🚀 Quickstart (Under 2 Minutes)

### 1. Clone the repository
```bash
git clone https://github.com/Knot-Repo/demo-knot-context-search.git
cd demo-knot-context-search
```

### 2. Install dependencies
```bash
npm install
```

### 3. Provision Credentials (Choose One)

#### Option A: One-Shot Terminal Command via Knot CLI
If you have [`@knot-ai/cli`](https://www.npmjs.com/package/@knot-ai/cli) installed:
```bash
npx @knot-ai/cli app create --name "Knot Recall Demo" --write-env
```
This automatically logs in via browser OAuth, provisions an application, and populates `.env.local`.

#### Option B: Manual Setup
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in your credentials from the [Knot Developer Console](https://connectknot.com/developers):
```ini
KNOT_SECRET="knot_prod_your_secret_here"
NEXT_PUBLIC_KNOT_CLIENT_ID="client_your_client_id"
KNOT_BASE_URL="https://production.connectknot.com/api"
```

> **Note**: Even without credentials, the app includes an interactive sandbox demo mode that runs out of the box!

### 4. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧠 How the Code Works

### 1. Frontend Drop-In Button
In [`app/page.tsx`](./app/page.tsx):
```tsx
import { ContinueWithKnot } from '@knot-ai/sdk/react';

<ContinueWithKnot
  clientId={process.env.NEXT_PUBLIC_KNOT_CLIENT_ID!}
  externalUserId={currentUser.id}
  appName="My AI Application"
  onSuccess={({ connectionId, reach, capabilities }) => {
    // Save connectionId to your user profile
    console.log('Connected with Knot:', connectionId);
  }}
/>
```

### 2. Querying Context on Turn 0
In [`app/api/search/route.ts`](./app/api/search/route.ts):
```ts
import { KnotClient } from '@knot-ai/sdk';

const knot = new KnotClient({
  secret: process.env.KNOT_SECRET!,
  baseUrl: process.env.KNOT_BASE_URL,
});

const { current } = await knot.query(userConnectionId, {
  query: userPrompt,
  limit: 6,
});

// Top matching verified invariants:
// [{ kind: "decision", statement: "Frontend uses React 19 and Next.js 15." }]
```

### 3. Injecting Invariants into your LLM Prompt
In [`app/api/chat/route.ts`](./app/api/chat/route.ts):
```ts
const contextLines = current
  .map((item) => `• [${item.kind.toUpperCase()}] ${item.statement}`)
  .join('\n');

const systemPrompt = `You are an AI assistant. User's verified project invariants from Knot:
${contextLines}

Answer the user's prompt while strictly honoring these decisions.`;
```

### 4. Saving New Decisions (Writeback)
In [`app/api/contribute/route.ts`](./app/api/contribute/route.ts):
```ts
await knot.contribute(userConnectionId, {
  kind: 'decision',
  statement: 'Primary storage uses PostgreSQL 16 on Neon with AES-256-GCM encryption.',
  idempotency_key: `decision-${Date.now()}`,
});
```

---

## 🛡️ Environments & Scale to Zero

| Environment | Host | Base URL | Behavior |
| :--- | :--- | :--- | :--- |
| **Production** | `production.connectknot.com` | `https://production.connectknot.com/api` | Live multi-tenant cluster. Always active with sub-50ms retrieval. |
| **Staging** | `staging.connectknot.com` | `https://staging.connectknot.com/api` | Isolated pre-production environment. Containers scale down to 0 instances when idle (cold start: 5–10s on first ping; sub-50ms thereafter). |

---

## 📄 License

MIT © [Knot](https://connectknot.com)
