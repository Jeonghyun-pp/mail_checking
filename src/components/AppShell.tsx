"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

// Pages rendered without the app chrome (sidebar).
const BARE_PAGES = ["/login", "/signup"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (BARE_PAGES.includes(pathname)) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-7 max-w-5xl">{children}</main>
    </div>
  );
}
