import { Outlet } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/sonner";

export interface AppShellProps {
  children?: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main id="main-content" className="flex-1 focus:outline-none" tabIndex={-1}>
        {children ?? <Outlet />}
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}
