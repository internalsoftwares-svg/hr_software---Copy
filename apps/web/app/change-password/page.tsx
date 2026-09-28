"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useToast } from "@/components/ui/Toast";
import { resolvePostLoginPath } from "@/lib/faculty-access";
import { getPrimaryRole, getRoleHomePath } from "@/lib/utils/routing";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { session, setSession } = useAuthStore();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast({ title: "Error", description: "New password must be at least 8 characters.", variant: "error" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match.", variant: "error" });
      return;
    }

    try {
      setSubmitting(true);
      await api.auth.changePassword({ currentPassword, newPassword });

      // Update the session to clear mustChangePassword
      if (session) {
        setSession({ ...session, user: { ...session.user, mustChangePassword: false } });
      }

      toast({ title: "Success", description: "Password changed successfully.", variant: "success" });

      // Redirect to the appropriate dashboard
      let nextPath = "/";
      try {
        nextPath = await resolvePostLoginPath(session?.user.roles ?? []);
      } catch {
        nextPath = getRoleHomePath(getPrimaryRole(session?.user.roles ?? []));
      }
      router.push(nextPath);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.message || err?.message || "Failed to change password.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
              <KeyRound className="h-6 w-6 text-brand" />
            </div>
            <div className="text-center">
              <h1 className="font-display text-xl font-bold text-text">Change Your Password</h1>
              <p className="mt-1 text-sm text-text-2">
                You must set a new password before continuing.
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text">Current Password</label>
              <div className="relative mt-1">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="h-10 w-full rounded-lg border border-border bg-bg px-3 pr-10 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text">New Password</label>
              <div className="relative mt-1">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="h-10 w-full rounded-lg border border-border bg-bg px-3 pr-10 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand/30"
                placeholder="Repeat new password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-70"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Changing..." : "Set New Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
