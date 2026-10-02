"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { API_ORIGIN } from "@/lib/api-client";
import { getPrimaryRole } from "@/lib/utils/routing";
import { useAuthStore } from "@/store/auth";

function fullEvidenceUrl(url: string) {
  return url.startsWith("http") ? url : `${API_ORIGIN}${url}`;
}

interface AppraisalDetail {
  id: string;
  status: string;
  finalScore: number | null;
  finalPercent: number;
  currentSalary: number;
  revisedSalary: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    department?: { id: string; name: string } | null;
    facultyProfile?: {
      currentSalary?: number;
      lastIncrementDate?: string;
    } | null;
  };
  cycle: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  };
  items: Array<{
    id: string;
    key: string;
    points: number;
    notes?: string;
  }>;
  superAdminApprovedPercent?: number | null;
  superAdminRemark?: string | null;
  hodRemarks?: string | null;
}

function SuperAdminAppraisalDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { session } = useAuthStore();
  const role = getPrimaryRole(session?.user.roles ?? []);
  const { toast } = useToast();

  useEffect(() => {
    if (!session) {
      router.push("/login");
    }
  }, [session, router]);

  const [appraisal, setAppraisal] = useState<AppraisalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adjustedPercent, setAdjustedPercent] = useState<number | undefined>();
  const [remark, setRemark] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetReason, setResetReason] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const response = await api.superAdmin.getById(id);
        if (!active) return;
        setAppraisal(response.data);
        setAdjustedPercent(
          response.data?.superAdminApprovedPercent ?? undefined,
        );
        setRemark(response.data?.superAdminRemark || "");
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
    return () => {
      active = false;
    };
  }, [id]);

  const finalPercent = adjustedPercent ?? appraisal?.finalPercent ?? 0;
  const revisedSalary = appraisal
    ? appraisal.currentSalary + (appraisal.currentSalary * finalPercent) / 100
    : 0;
  const salaryIncrement = revisedSalary - (appraisal?.currentSalary ?? 0);
  const hrRecommendedPercent = appraisal?.finalPercent ?? 0;
  const percentAdjusted =
    adjustedPercent !== undefined && adjustedPercent !== hrRecommendedPercent;

  async function handleApprove() {
    if (!appraisal) return;

    try {
      setSaving(true);

      await api.superAdmin.approve(appraisal.id, {
        adjustedPercent:
          adjustedPercent !== undefined &&
          adjustedPercent !== appraisal.finalPercent
            ? adjustedPercent
            : undefined,
        remark: remark.trim() || undefined,
      });

      toast({
        title: "Success",
        description: "Appraisal approved successfully!",
        variant: "success",
      });
      setTimeout(() => {
        router.push("/super-admin-dashboard/appraisals");
      }, 2000);
    } catch (err: any) {
      toast({
        title: "Error",
        description:
          err?.response?.data?.message || err?.message || "Failed to approve",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!appraisal) return;
    if (!resetReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for returning to committee.",
        variant: "error",
      });
      return;
    }

    try {
      setResetting(true);

      await api.superAdmin.returnToCommittee(appraisal.id, { reason: resetReason });

      toast({
        title: "Success",
        description: "Appraisal returned to Committee Review.",
        variant: "success",
      });
      setTimeout(() => {
        router.push("/super-admin-dashboard/appraisals");
      }, 2000);
    } catch (err: any) {
      toast({
        title: "Error",
        description:
          err?.response?.data?.message || err?.message || "Failed to reset",
        variant: "error",
      });
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="flex items-center gap-3 text-text-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading appraisal...</span>
        </div>
      </div>
    );
  }

  if (!appraisal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="text-center">
          <p className="text-sm text-danger">Appraisal not found</p>
          <Link
            href="/super-admin-dashboard/appraisals"
            className="mt-4 inline-block text-xs font-medium text-brand underline"
          >
            Back to appraisals
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/super-admin-dashboard/appraisals"
          className="rounded-lg p-2 hover:bg-surface"
        >
          <ArrowLeft className="h-5 w-5 text-text-2" />
        </Link>
        <PageHeader
          title="Super Admin Appraisal Review"
          subtitle={`Reviewing appraisal for ${appraisal.user.firstName} ${appraisal.user.lastName}`}
          actions={undefined}
        />
      </div>

      <div className="mx-auto max-w-6xl space-y-6">
        {/* Faculty & Cycle Info */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                Faculty Information
              </p>
              <div className="mt-3 space-y-2">
                <div>
                  <p className="text-xs text-text-3">Name</p>
                  <p className="font-medium text-text">
                    {appraisal.user.firstName} {appraisal.user.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Email</p>
                  <p className="text-sm text-text">{appraisal.user.email}</p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Department</p>
                  <p className="text-sm text-text">
                    {appraisal.user.department?.name || "N/A"}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                Appraisal Cycle
              </p>
              <div className="mt-3 space-y-2">
                <div>
                  <p className="text-xs text-text-3">Cycle Name</p>
                  <p className="font-medium text-text">
                    {appraisal.cycle.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Period</p>
                  <p className="text-sm text-text">
                    {new Date(appraisal.cycle.startDate).toLocaleDateString()} -{" "}
                    {new Date(appraisal.cycle.endDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Appraisal Scores Summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
              Final Score (HR Approved)
            </p>
            <p className="mt-2 text-2xl font-bold text-text">
              {appraisal.finalScore?.toFixed(2) ?? 0}
            </p>
            <p className="mt-1 text-xs text-text-2">Out of 4</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
              Approved Percentage
            </p>
            <p className="mt-2 text-2xl font-bold text-brand">
              {appraisal.finalPercent?.toFixed(1) ?? 0}%
            </p>
            <p className="mt-1 text-xs text-text-2">HR recommended</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
              Current Status
            </p>
            <p className="mt-2 inline-block rounded-full bg-warning-bg px-3 py-1 text-xs font-semibold text-warning">
              {(appraisal.status === "ADMIN_REVIEW" || appraisal.status === "SUPER_ADMIN_PENDING")
                ? "Pending Approval"
                : "Approved"}
            </p>
          </div>
        </div>

        {/* Appraisal Review Breakdown */}
        <div className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-text-3">
              Appraisal Breakdown Report
            </h2>
          </div>
          <div className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase text-text-3">
                <tr>
                  <th className="px-6 py-4 font-semibold w-16">S.No</th>
                  <th className="px-6 py-4 font-semibold">Criterion</th>
                  <th className="px-6 py-4 font-semibold">Faculty Demand</th>
                  <th className="px-6 py-4 font-semibold">HOD Review</th>
                  <th className="px-6 py-4 font-semibold">Committee Review</th>
                  <th className="px-6 py-4 font-semibold">HR Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appraisal.items.map((item, index) => {
                  let parsed = {} as any;
                  try {
                    if (item.notes) parsed = JSON.parse(item.notes);
                  } catch (e) {}

                  // Format key like "academic_performance" -> "Academic Performance"
                  let criterionName = item.key
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');

                  if (item.key === 'fdp_stp') {
                    criterionName = 'FDPs / STPs';
                  }

                  return (
                    <tr key={item.id} className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-6 py-4 text-text-2">{index + 1}</td>
                      <td className="px-6 py-4 font-medium text-text">{criterionName}</td>
                      <td className="px-6 py-4 text-text-2">{parsed?.hodReview?.originalPoints ?? item.points}</td>
                      <td className="px-6 py-4">
                        <span className="font-semibold">{parsed?.hodReview?.approvedPoints ?? "—"}</span>
                        {parsed?.hodReview?.remark && (
                          <div className="text-xs text-text-3 italic mt-1">({parsed.hodReview.remark})</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold">{parsed?.committeeReview?.approvedPoints ?? "—"}</span>
                        {parsed?.committeeReview?.remark && (
                          <div className="text-xs text-text-3 italic mt-1">({parsed.committeeReview.remark})</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold">{parsed?.hrReview?.approvedPoints ?? "—"}</span>
                        {parsed?.hrReview?.remark && (
                          <div className="text-xs text-text-3 italic mt-1">({parsed.hrReview.remark})</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                
                {/* HOD Remarks and Memo Issues for Normal Faculty */}
                {!appraisal.items.some((item) =>
                  [
                    "fee_recovery",
                    "awards_outside_svgoi",
                    "overall_university_result",
                    "placement",
                    "department_university_positions",
                  ].includes(item.key)
                ) && (
                  <>
                    <tr className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-6 py-4 text-text-2">13</td>
                      <td className="px-6 py-4 font-medium text-text">HOD&apos;s Remarks</td>
                      <td className="px-6 py-4 text-text-2">—</td>
                      <td className="px-6 py-4">
                        {(appraisal.hodRemarks && typeof (() => {
                          try { return JSON.parse(appraisal.hodRemarks).additionalPoints; } catch { return undefined; }
                        })() === "number") ? (
                          <>
                            <span className="font-semibold">
                              {(() => {
                                try { return JSON.parse(appraisal.hodRemarks).additionalPoints; } catch { return undefined; }
                              })()}
                            </span>
                            {(() => {
                              try { return JSON.parse(appraisal.hodRemarks).additionalPointsRemark; } catch { return null; }
                            })() && (
                              <div className="text-xs text-text-3 italic mt-1">
                                {(() => {
                                  try { return JSON.parse(appraisal.hodRemarks).additionalPointsRemark; } catch { return null; }
                                })()}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="font-semibold">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-text-2">—</td>
                      <td className="px-6 py-4 text-text-2">—</td>
                    </tr>
                    <tr className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-6 py-4 text-text-2">14</td>
                      <td className="px-6 py-4 font-medium text-text">Memo Issues / Penalty</td>
                      <td className="px-6 py-4 text-text-2">—</td>
                      <td className="px-6 py-4">
                        {(appraisal.hodRemarks && typeof (() => {
                          try { return JSON.parse(appraisal.hodRemarks).memoIssues; } catch { return undefined; }
                        })() === "number") ? (
                          <>
                            <span className="font-semibold">
                              {(() => {
                                try { return JSON.parse(appraisal.hodRemarks).memoIssues; } catch { return undefined; }
                              })()}
                            </span>
                            {(() => {
                              try { return JSON.parse(appraisal.hodRemarks).memoNote; } catch { return null; }
                            })() && (
                              <div className="text-xs text-text-3 italic mt-1">
                                {(() => {
                                  try { return JSON.parse(appraisal.hodRemarks).memoNote; } catch { return null; }
                                })()}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="font-semibold">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-text-2">—</td>
                      <td className="px-6 py-4 text-text-2">—</td>
                    </tr>
                  </>
                )}


                
                {/* Total Row */}
                {(() => {
                  const totals = appraisal.items.reduce(
                    (acc, item) => {
                      let parsed = {} as any;
                      try {
                        if (item.notes) parsed = JSON.parse(item.notes);
                      } catch (e) {}
                      
                      acc.faculty += (parsed?.hodReview?.originalPoints ?? item.points) || 0;

                      if (parsed?.hodReview?.approvedPoints != null) {
                        acc.hod += Number(parsed.hodReview.approvedPoints);
                      }
                      if (parsed?.committeeReview?.approvedPoints != null) {
                        acc.committee += Number(parsed.committeeReview.approvedPoints);
                      }
                      if (parsed?.hrReview?.approvedPoints != null) {
                        acc.hr += Number(parsed.hrReview.approvedPoints);
                      }
                      return acc;
                    },
                    { faculty: 0, hod: 0, committee: 0, hr: 0 }
                  );

                  let additionalPoints = 0;
                  let memoDeduction = 0;
                  try {
                    if (appraisal.hodRemarks) {
                      const remarks = JSON.parse(appraisal.hodRemarks);
                      additionalPoints = Number(remarks.additionalPoints) || 0;
                      memoDeduction = Number(remarks.memoDeductionPoints) || 0;
                    }
                  } catch (e) {}

                  // Apply the additional points and deductions to all downstream reviewers
                  totals.hod = totals.hod + additionalPoints - memoDeduction;
                  totals.committee = totals.committee + additionalPoints - memoDeduction;
                  totals.hr = totals.hr + additionalPoints - memoDeduction;

                  return (
                    <tr className="bg-surface-2 font-bold text-text">
                      <td colSpan={2} className="px-6 py-4 uppercase text-right">Total Net Score</td>
                      <td className="px-6 py-4">{totals.faculty}</td>
                      <td className="px-6 py-4">{totals.hod}</td>
                      <td className="px-6 py-4">{totals.committee}</td>
                      <td className="px-6 py-4">{totals.hr}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* HOD Overall Remark */}
        {!appraisal.items.some((item) =>
          [
            "fee_recovery",
            "awards_outside_svgoi",
            "overall_university_result",
            "placement",
            "department_university_positions",
          ].includes(item.key)
        ) && (
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-3 mb-3">
              HOD&apos;s Overall Remark
            </p>
            <div className="rounded-lg border border-border bg-bg p-4 text-sm text-text-2 whitespace-pre-wrap">
              {(() => {
                try {
                  const remark = appraisal.hodRemarks ? JSON.parse(appraisal.hodRemarks).overallRemark : null;
                  return remark ? remark : <span className="font-semibold">—</span>;
                } catch {
                  return <span className="font-semibold">—</span>;
                }
              })()}
            </div>
          </div>
        )}

        {/* Salary Information */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
            Salary Calculation
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-bg p-4">
              <p className="text-xs text-text-3">Current Salary</p>
              <p className="mt-1 text-2xl font-bold text-text">
                ₹{appraisal.currentSalary?.toLocaleString("en-IN") ?? 0}
              </p>
            </div>

            <div className="rounded-lg bg-bg p-4">
              <p className="text-xs text-text-3">Approved Increment %</p>
              <p className="mt-1 text-2xl font-bold text-text">
                {finalPercent.toFixed(1)}%
              </p>
            </div>

            <div className="rounded-lg bg-success/10 p-4">
              <p className="text-xs text-text-3">Increment Amount</p>
              <p className="mt-1 text-2xl font-bold text-success">
                ₹
                {salaryIncrement.toLocaleString("en-IN", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>

            <div className="rounded-lg bg-brand/10 p-4">
              <p className="text-xs text-text-3">Revised Salary</p>
              <p className="mt-1 text-2xl font-bold text-brand">
                ₹
                {revisedSalary.toLocaleString("en-IN", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Approval Controls */}
        {(appraisal.status === "ADMIN_REVIEW" || appraisal.status === "SUPER_ADMIN_PENDING") && (
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
              Approval Actions
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text">
                  Adjust Approval Percentage (Optional)
                </label>
                <p className="mt-1 text-xs text-text-2">
                  Leave blank to use HR recommended{" "}
                  {appraisal.finalPercent?.toFixed(1)}%
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={adjustedPercent !== undefined ? adjustedPercent : ""}
                    onChange={(e) => {
                      const val = e.target.value
                        ? parseFloat(e.target.value)
                        : undefined;
                      setAdjustedPercent(val);
                    }}
                    placeholder={appraisal.finalPercent?.toFixed(1)}
                    className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder-text-3"
                  />
                  <span className="flex items-center text-text-2">%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text">
                  Approval Remarks (Optional)
                </label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Add any remarks about the approval..."
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder-text-3"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={saving || resetting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Approving..." : "Approve Appraisal"}
                </button>

                <button
                  type="button"
                  disabled={saving || resetting}
                  className="flex items-center justify-center rounded-lg bg-danger px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setConfirmResetOpen(true)}
                >
                  {resetting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {resetting ? "Returning..." : "Return to Committee"}
                </button>

                <Link
                  href="/super-admin-dashboard/appraisals"
                  className="flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 font-medium text-text hover:bg-bg"
                >
                  Cancel
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Already Approved Info */}
        {appraisal.status === "FULLY_APPROVED" && (
          <div className="rounded-2xl border border-success/20 bg-success-bg p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-success">
              Approval Complete
            </p>
            <p className="mt-2 text-sm text-success">
              This appraisal has been approved. The faculty salary has been
              updated to ₹
              {revisedSalary.toLocaleString("en-IN", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
              .
            </p>
            {appraisal.superAdminRemark && (
              <div className="mt-3 rounded-lg bg-success/10 p-3">
                <p className="text-xs font-medium text-text-3">
                  Approval Remark
                </p>
                <p className="mt-1 text-sm text-text">
                  {appraisal.superAdminRemark}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Final-approval confirmation. This step is irreversible: it marks the
          appraisal FULLY_APPROVED and writes the revised salary. */}
      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Final Approval"
        description={
          <div className="space-y-4">
            <p>
              You are about to <span className="font-semibold text-text">fully approve</span>{" "}
              the appraisal for{" "}
              <span className="font-semibold text-text">
                {appraisal.user.firstName} {appraisal.user.lastName}
              </span>{" "}
              ({appraisal.cycle.name}).
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-bg p-3">
                <p className="text-xs text-text-3">Increment %</p>
                <p className="mt-1 text-xl font-bold text-brand">
                  {finalPercent.toFixed(1)}%
                </p>
                {percentAdjusted && (
                  <p className="mt-1 text-xs text-warning">
                    Adjusted from HR recommended {hrRecommendedPercent.toFixed(1)}%
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-bg p-3">
                <p className="text-xs text-text-3">Increment Amount</p>
                <p className="mt-1 text-xl font-bold text-success">
                  ₹
                  {salaryIncrement.toLocaleString("en-IN", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
              <div className="rounded-lg bg-bg p-3">
                <p className="text-xs text-text-3">Current Salary</p>
                <p className="mt-1 text-base font-semibold text-text">
                  ₹{appraisal.currentSalary?.toLocaleString("en-IN") ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-bg p-3">
                <p className="text-xs text-text-3">Revised Salary</p>
                <p className="mt-1 text-base font-semibold text-text">
                  ₹
                  {revisedSalary.toLocaleString("en-IN", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
            </div>

            <p className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
              This will mark the appraisal as <strong>FULLY APPROVED</strong> and
              update the faculty&apos;s salary. This action cannot be undone.
            </p>
          </div>
        }
        confirmLabel={saving ? "Approving..." : "Yes, Approve & Finalise"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleApprove();
        }}
      />

      {/* Reset Review Confirmation */}
      <ConfirmDialog
        open={confirmResetOpen}
        title="Return to Committee Review"
        description={
          <div className="space-y-4">
            <p>
              This will return the appraisal to <span className="font-semibold text-text">Committee Review</span> so they can update it. Their previous scoring will be preserved.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-text">
                Reason for returning <span className="text-danger">*</span>
              </label>
              <textarea
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="Explain why this appraisal is being returned..."
                className="w-full rounded-lg border border-border bg-surface p-2 text-sm text-text focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                rows={3}
              />
            </div>
          </div>
        }
        confirmLabel={resetting ? "Returning..." : "Return to Committee"}
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          if (!resetReason.trim()) {
             toast({ title: "Error", description: "Reason is required", variant: "error" });
             return;
          }
          setConfirmResetOpen(false);
          void handleReset();
        }}
      />
    </div>
  );
}

export default SuperAdminAppraisalDetail;
