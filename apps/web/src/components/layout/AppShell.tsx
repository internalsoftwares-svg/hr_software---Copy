"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getPrimaryRole, type UiRole } from "@/lib/utils/routing";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export function AppShell({
  children,
  role,
}: {
  children: ReactNode;
  role?: UiRole;
}) {
  const { session } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const resolvedRole = role ?? getPrimaryRole(session?.user.roles ?? []);

  useEffect(() => {
    if (session?.user.mustChangePassword && pathname !== "/change-password") {
      router.replace("/change-password");
    }
  }, [session, pathname, router]);

  if (session?.user.mustChangePassword) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar role={resolvedRole} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-6 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
