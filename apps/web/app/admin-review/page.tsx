"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { withAuth } from "@/components/auth/withAuth";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { getPrimaryRole } from "@/lib/utils/routing";
import { useAuthStore } from "@/store/auth";

type AppraisalRow = {
  id: string;
  status: string;
  submittedAt: string | null;
  finalScore: number | null;
  finalPercent: number | null;
  currentSalary: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    department: { id: string; name: string } | null;
  };
  cycle: { id: string; name: string; startDate: string; endDate: string };
  totalSelectedPoints: number;
  itemsCount: number;
};

const STATUS_LABEL: Record<string, string> = {
  ADMIN_REVIEW: "Pending Admin Review",
  SUPER_ADMIN_PENDING: "Forwarded to Super Admin",
  HR_FINALIZED: "Forwarded to HR",
  COMMITTEE_REVIEW: "At Committee",
  FULLY_APPROVED: "Fully Approved",
  REJECTED: "Rejected",
};

const STATUS_COLOR: Record<string, string> = {
  ADMIN_REVIEW: "bg-orange-100 text-orange-700",
  SUPER_ADMIN_PENDING: "bg-purple-100 text-purple-700",
  HR_FINALIZED: "bg-blue-100 text-blue-700",
  COMMITTEE_REVIEW: "bg-purple-100 text-purple-700",
  FULLY_APPROVED: "bg-success-bg text-success",
  REJECTED: "bg-danger-bg text-danger",
};

function AdminReviewDashboard() {
  const { session } = useAuthStore();
  const role = getPrimaryRole(session?.user.roles ?? []);
  const { toast } = useToast();
  const [appraisals, setAppraisals] = useState<AppraisalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        const res = await api.adminReview.getList();
        if (active) {
          setAppraisals((res.data as AppraisalRow[]) ?? []);
        }
      } catch (err: any) {
        if (active) {
          toast({
            title: "Error",
            description:
              err?.response?.data?.message ||
              err?.message ||
              "Failed to load appraisals",
            variant: "error",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, []);

  const pending = appraisals.filter((a) => a.status === "ADMIN_REVIEW");
  const reviewed = appraisals.filter((a) => a.status !== "ADMIN_REVIEW");

  if (loading) {
    return (
      <AppShell role={role}>
        <PageHeader title="Admin Review" subtitle="Level 2 appraisal review" />
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-text-2 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role={role}>
      <PageHeader
        title="Admin Review Dashboard"
        subtitle="Level 2 — review HOD-approved appraisals before forwarding to HR"
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">Pending Review</p>
          <p className="mt-2 font-display text-3xl font-bold text-warning">{pending.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">Reviewed</p>
          <p className="mt-2 font-display text-3xl font-bold text-text">{reviewed.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">Total</p>
          <p className="mt-2 font-display text-3xl font-bold text-text">{appraisals.length}</p>
        </div>
      </div>

      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-text">
            <Clock className="h-4 w-4 text-warning" />
            Pending Review ({pending.length})
          </h2>
          <AppraisalTable rows={pending} />
        </section>
      )}

      {reviewed.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-text">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Reviewed ({reviewed.length})
          </h2>
          <AppraisalTable rows={reviewed} />
        </section>
      )}

      {appraisals.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-text-3 shadow-sm">
          No appraisals found for the current cycle.
        </div>
      )}
    </AppShell>
  );
}

function AppraisalTable({ rows }: { rows: AppraisalRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
      <table className="w-full">
        <thead className="border-b border-border bg-bg">
          <tr>
            {["Faculty", "Department", "Cycle", "Points", "Status", ""].map((h) => (
              <th
                key={h}
                className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-text-3"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border hover:bg-bg/50">
              <td className="px-5 py-3">
                <p className="font-medium text-text">{row.user.firstName} {row.user.lastName}</p>
                <p className="text-xs text-text-3">{row.user.email}</p>
              </td>
              <td className="px-5 py-3 text-sm text-text-2">{row.user.department?.name ?? "—"}</td>
              <td className="px-5 py-3 text-sm text-text-2">{row.cycle.name}</td>
              <td className="px-5 py-3 text-sm font-semibold text-text">{row.totalSelectedPoints}</td>
              <td className="px-5 py-3">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.status] ?? "bg-slate-100 text-slate-700"}`}>
                  {STATUS_LABEL[row.status] ?? row.status.replace(/_/g, " ")}
                </span>
              </td>
              <td className="px-5 py-3 text-right">
                <Link
                  href={`/admin-review/${row.id}/review`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-dark"
                >
                  {row.status === "ADMIN_REVIEW" ? "Review" : "View"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default withAuth(AdminReviewDashboard, ["MANAGEMENT", "SUPER_ADMIN"]);
