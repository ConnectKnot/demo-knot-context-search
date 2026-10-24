import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knot Recall · Cross-Agent Shared Brain Search",
  description: "Search your users' project decisions, tech stack invariants, and rules established in ChatGPT, Claude, and Cursor using @knot-ai/sdk.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-foreground selection:text-background">
        {children}
      </body>
    </html>
  );
}
