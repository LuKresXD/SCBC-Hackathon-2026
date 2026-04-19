import React from "react";
import { SandboxProvider } from "./_lib/demo-state";

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return <SandboxProvider>{children}</SandboxProvider>;
}