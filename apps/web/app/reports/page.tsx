"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Download,
  Loader2,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { getPrimaryRole } from "@/lib/utils/routing";
import { useAuthStore } from "@/store/auth";

type AppraisalRow = {
  id: string;
  status: string;
  finalScore: number | null;
  finalPercent: number | null;
  currentSalary: number;
  superAdminApprovedPercent: number | null;
  submittedAt: string | null;
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
  SUBMITTED: "Submitted",
  HOD_REVIEW: "HOD Review",
  ADMIN_REVIEW: "Admin Review",
  HR_FINALIZED: "HR Review",
  COMMITTEE_REVIEW: "Committee Review",
  FULLY_APPROVED: "Fully Approved",
  REJECTED: "Rejected",
  DRAFT: "Draft",
};

const STATUS_COLOR: Record<string, string> = {
  SUBMITTED: "bg-blue-100 text-blue-700",
  HOD_REVIEW: "bg-yellow-100 text-yellow-700",
  ADMIN_REVIEW: "bg-orange-100 text-orange-700",
  HR_FINALIZED: "bg-indigo-100 text-indigo-700",
  COMMITTEE_REVIEW: "bg-purple-100 text-purple-700",
  FULLY_APPROVED: "bg-success-bg text-success",
  REJECTED: "bg-danger-bg text-danger",
  DRAFT: "bg-slate-100 text-slate-700",
};

function ReportsPage() {
  const router = useRouter();
  const { session } = useAuthStore();
  const role = getPrimaryRole(session?.user.roles ?? []);
  const { toast } = useToast();
  const [appraisals, setAppraisals] = useState<AppraisalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDept, setFilterDept] = useState("all");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const res = await api.hr.getTeamAppraisals();
        if (active) setAppraisals((res.data as AppraisalRow[]) ?? []);
      } catch (err: any) {
        if (active)
          toast({
            title: "Error",
            description:
              err?.response?.data?.message || err?.message || "Failed to load",
            variant: "error",
          });
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const departments = Array.from(
    new Set(appraisals.map((a) => a.user.department?.name).filter(Boolean)),
  ) as string[];

  const filtered = appraisals.filter((a) => {
    const statusMatch = filterStatus === "all" || a.status === filterStatus;
    const deptMatch = filterDept === "all" || a.user.department?.name === filterDept;
    return statusMatch && deptMatch;
  });

  const totalApproved = filtered.filter((a) => a.status === "FULLY_APPROVED").length;
  const totalRejected = filtered.filter((a) => a.status === "REJECTED").length;
  const avgScore =
    filtered.length > 0
      ? Math.round(filtered.reduce((s, a) => s + (a.totalSelectedPoints || 0), 0) / filtered.length)
      : 0;

  function downloadCSV() {
    const header = ["Name", "Email", "Department", "Cycle", "Points", "Increment %", "Status", "Salary"];
    const rows = filtered.map((a) => [
      `${a.user.firstName} ${a.user.lastName}`,
      a.user.email,
      a.user.department?.name ?? "",
      a.cycle.name,
      a.totalSelectedPoints,
      a.superAdminApprovedPercent ?? a.finalPercent ?? "",
      STATUS_LABEL[a.status] ?? a.status,
      a.currentSalary,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appraisal-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <AppShell role={role}>
        <PageHeader title="Appraisal Reports" subtitle="Faculty score summary and reports" />
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-text-2 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading report data...</span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role={role}>
      <PageHeader
        title="Appraisal Reports"
        subtitle="Faculty Score Summary — view, filter, and export appraisal results"
        actions={
          <button
            type="button"
            onClick={downloadCSV}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand-dark"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">Total Appraisals</p>
          <p className="mt-2 font-display text-3xl font-bold text-text">{filtered.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">Fully Approved</p>
          <p className="mt-2 font-display text-3xl font-bold text-success">{totalApproved}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">Rejected</p>
          <p className="mt-2 font-display text-3xl font-bold text-danger">{totalRejected}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">Avg Points</p>
          <p className="mt-2 font-display text-3xl font-bold text-text">{avgScore}</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div>
          <label className="mr-2 text-sm font-medium text-text">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-text"
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mr-2 text-sm font-medium text-text">Department</label>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-text"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full">
          <thead className="border-b border-border bg-bg">
            <tr>
              {["Faculty", "Department", "Cycle", "Points", "Increment %", "Salary", "Status", ""].map((h) => (
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-sm text-text-3">
                  No appraisals match the selected filters.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const incPct = row.superAdminApprovedPercent ?? row.finalPercent;
                const revisedSalary = incPct && row.currentSalary
                  ? Math.round(row.currentSalary * (1 + incPct / 100))
                  : null;

                return (
                  <tr key={row.id} className="border-t border-border hover:bg-bg/50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-text">{row.user.firstName} {row.user.lastName}</p>
                      <p className="text-xs text-text-3">{row.user.email}</p>
                    </td>
                    <td className="px-5 py-3 text-sm text-text-2">{row.user.department?.name ?? "—"}</td>
                    <td className="px-5 py-3 text-sm text-text-2">{row.cycle.name}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-text">{row.totalSelectedPoints}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-text">
                      {incPct != null ? `${incPct}%` : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-text-2">
                      {row.currentSalary ? `₹${row.currentSalary.toLocaleString("en-IN")}` : "—"}
                      {revisedSalary && (
                        <span className="ml-1 text-success">→ ₹{revisedSalary.toLocaleString("en-IN")}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.status] ?? "bg-slate-100 text-slate-700"}`}>
                        {STATUS_LABEL[row.status] ?? row.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/hr-review/${row.id}/review`}
                        className="text-xs font-medium text-brand hover:text-brand-dark"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

export default ReportsPage;
