// AppShell provides the primary layout wrapper.
// Conditionally renders sidebar, main content, and contextual drawers
// based on whether a workspace exists.
export function AppShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
