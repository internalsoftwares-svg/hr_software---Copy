"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Save,
  XCircle,
} from "lucide-react";
import { withAuth } from "@/components/auth/withAuth";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { API_ORIGIN } from "@/lib/api-client";
import { getPrimaryRole } from "@/lib/utils/routing";
import { memoPenaltyFor } from "@/lib/utils/memoPolicy";
import { useAuthStore } from "@/store/auth";

type ReviewItem = {
  id: string;
  criterionKey: string;
  heading: string;
  selectedValue: string;
  selectedLabel: string;
  facultyRemarks: string | null;
  facultyPoints: number;
  approvedPoints: number;
  hodRemark: string;
  evidence: {
    url: string;
    fileName?: string;
    mime?: string;
    size?: number;
  } | null;
};

const CRITERION_ORDER = [
  // Base criteria (I–XIII)
  "academics_average_result",
  "research_publications",
  "impact_factor",
  "books_published",
  "patents",
  "conference_seminar_workshop",
  "fdp_stp",
  "research_project_consultancy",
  "research_guidance",
  "co_curricular_activities",
  "attendance",
  "awards_recognition",
  // HOD-only criteria (XIV–XVIII)
  "fee_recovery",
  "awards_outside_svgoi",
  "overall_university_result",
  "placement",
  "department_university_positions",
];

function sortByOrder(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((a, b) => {
    const ia = CRITERION_ORDER.indexOf(a.criterionKey);
    const ib = CRITERION_ORDER.indexOf(b.criterionKey);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

type RequestDetail = {
  id: string;
  status: string;
  submittedAt?: string | null;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  cycle: {
    name: string;
  };
  items: ReviewItem[];
  additionalPoints: number;
  additionalPointsRemark: string;
  overallRemark: string;
  memoIssues: number;
};

type ItemState = {
  approvedPoints: number;
  remark: string;
};

function fullEvidenceUrl(url: string) {
  return url.startsWith("http") ? url : `${API_ORIGIN}${url}`;
}

function HodReviewDetailPage() {
  const router = useRouter();
  const params = useParams();
  const appraisalId = params?.id as string;
  const { session } = useAuthStore();
  const role = getPrimaryRole(session?.user.roles ?? []);
  const { toast } = useToast();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [itemState, setItemState] = useState<Record<string, ItemState>>({});
  const [additionalPoints, setAdditionalPoints] = useState(0);
  const [additionalPointsRemark, setAdditionalPointsRemark] = useState("");
  const [overallRemark, setOverallRemark] = useState("");
  const [memoIssues, setMemoIssues] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returning, setReturning] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showOverallRemarkError, setShowOverallRemarkError] = useState(false);
  const [showAdditionalPointsRemarkError, setShowAdditionalPointsRemarkError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDetail() {
      try {
        setLoading(true);
        const response = await api.hod.getFacultyRequestById(appraisalId);
        if (!active) {
          return;
        }

        const payload = response.data as unknown as RequestDetail;
        setDetail(payload);
        setAdditionalPoints(payload.additionalPoints || 0);
        setAdditionalPointsRemark(payload.additionalPointsRemark || "");
        setOverallRemark(payload.overallRemark || "");
        setMemoIssues(payload.memoIssues || 0);

        const nextState: Record<string, ItemState> = {};
        payload.items.forEach((item) => {
          nextState[item.id] = {
            approvedPoints: item.approvedPoints,
            remark: item.hodRemark || "",
          };
        });
        setItemState(nextState);
      } catch (loadError: any) {
        if (active) {
          toast({
            title: "Error",
            description:
              loadError?.response?.data?.message ||
              loadError?.message ||
              "Failed to load appraisal request detail",
            variant: "error",
          });
          setDetail(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (appraisalId) {
      void loadDetail();
    }

    return () => {
      active = false;
    };
  }, [appraisalId]);

  const canEdit =
    detail?.status === "SUBMITTED" || detail?.status === "HOD_REVIEW";

  // Gross = criteria points + criterion XIII (HOD's remarks score).
  const grossApprovedPoints = useMemo(() => {
    const itemTotal = Object.values(itemState).reduce(
      (sum, item) => sum + Number(item.approvedPoints || 0),
      0,
    );
    return itemTotal + additionalPoints;
  }, [additionalPoints, itemState]);

  const memoPenalty = useMemo(() => memoPenaltyFor(memoIssues), [memoIssues]);

  const totalApprovedPoints = Math.max(
    grossApprovedPoints - memoPenalty.deductionPoints,
    0,
  );

  function updateItem(id: string, patch: Partial<ItemState>) {
    setItemState((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  }

  async function submitReview() {
    if (!detail) {
      return;
    }

    const itemsPayload = detail.items.map((item) => ({
      itemId: item.id,
      approvedPoints: Number(
        itemState[item.id]?.approvedPoints ?? item.facultyPoints,
      ),
      remark: itemState[item.id]?.remark?.trim() || undefined,
    }));

    const hasDeduction = detail.items.some((item) => {
      const approved = Number(
        itemState[item.id]?.approvedPoints ?? item.facultyPoints,
      );
      return approved < item.facultyPoints;
    });

    if (hasDeduction) {
      const missingRemark = detail.items.some((item) => {
        const approved = Number(
          itemState[item.id]?.approvedPoints ?? item.facultyPoints,
        );
        if (approved < item.facultyPoints) {
          return !(itemState[item.id]?.remark || "").trim();
        }
        return false;
      });

      if (missingRemark) {
        toast({
          title: "Error",
          description: "Remarks are required for each deducted criterion.",
          variant: "error",
        });
        return;
      }
    }

    if (!additionalPointsRemark.trim()) {
      setShowAdditionalPointsRemarkError(true);
      toast({
        title: "Error",
        description: "Remarks for HOD's score is required.",
        variant: "error",
      });
      const el = document.getElementById("hod-remark-section");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!overallRemark.trim()) {
      setShowOverallRemarkError(true);
      toast({
        title: "Error",
        description: "Overall remark is required.",
        variant: "error",
      });
      const el = document.getElementById("overall-remark-section");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    try {
      setSaving(true);
      await api.hod.submitFacultyReview(appraisalId, {
        items: itemsPayload,
        additionalPoints,
        additionalPointsRemark: additionalPointsRemark.trim() || undefined,
        overallRemark: overallRemark.trim() || undefined,
        memoIssues,
      });
      toast({
        title: "Success",
        description: "HOD review submitted and forwarded successfully.",
        variant: "success",
      });
      setTimeout(() => {
        router.push("/hod-review");
      }, 1000);
    } catch (saveError: any) {
      toast({
        title: "Error",
        description:
          saveError?.response?.data?.message ||
          saveError?.message ||
          "Failed to submit HOD review",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function rejectAppraisal() {
    if (!rejectReason.trim()) return;
    try {
      setRejecting(true);
      await api.hod.rejectAppraisal(appraisalId, rejectReason.trim());
      setRejectDialogOpen(false);
      toast({ title: "Success", description: "Appraisal rejected.", variant: "success" });
      setTimeout(() => router.push("/hod-review"), 1000);
    } catch (err: any) {
      toast({
        title: "Error",
        description:
          err?.response?.data?.message || err?.message || "Failed to reject",
        variant: "error",
      });
    } finally {
      setRejecting(false);
    }
  }

  async function returnAppraisal() {
    if (!returnReason.trim()) return;
    try {
      setReturning(true);
      await api.hod.returnToFaculty(appraisalId, returnReason.trim());
      setReturnDialogOpen(false);
      toast({ title: "Returned", description: "Appraisal sent back to faculty as draft.", variant: "success" });
      setTimeout(() => router.push("/hod-review"), 1000);
    } catch (err: any) {
      toast({
        title: "Error",
        description:
          err?.response?.data?.message || err?.message || "Failed to return",
        variant: "error",
      });
    } finally {
      setReturning(false);
    }
  }

  if (loading) {
    return (
      <AppShell role={role}>
        <PageHeader
          title="Review Request"
          subtitle="Loading request detail..."
        />
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-3 text-text-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading request...</span>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!detail) {
    return null;
  }

  return (
    <AppShell role={role}>
      <PageHeader
        title="Faculty Appraisal Review"
        subtitle={`${detail.user.firstName} ${detail.user.lastName} | ${detail.cycle.name}`}
        actions={
          <Link
            href="/hod-review"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text transition hover:bg-surface-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        }
      />

      {/* View-only banner */}
      {!canEdit && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-success/20 bg-success-bg p-4 text-sm text-success">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">HOD review submitted</p>
            <p className="mt-0.5 text-text-2">
              This appraisal has been forwarded to the next stage. You can view
              your submitted review below (read-only).
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {sortByOrder(detail.items).map((item) => {
          const approved = Number(
            itemState[item.id]?.approvedPoints ?? item.facultyPoints,
          );
          const isDeducted = approved < item.facultyPoints;

          return (
            <section
              key={item.id}
              className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              <h3 className="font-display text-lg font-semibold text-text">
                {item.heading}
              </h3>
              <p className="mt-1 text-sm text-text-2">
                Selected: {item.selectedLabel || item.selectedValue}
              </p>
              <p className="mt-1 text-sm text-text-2">
                Faculty points: {item.facultyPoints}
              </p>
              {item.facultyRemarks ? (
                <div className="mt-2 rounded-lg border border-border bg-bg px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-3">
                    Faculty Remarks / Author Position
                  </p>
                  <p className="mt-0.5 text-sm text-text-2">
                    {item.facultyRemarks}
                  </p>
                </div>
              ) : null}

              {canEdit ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-text">
                      Approved points
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={item.facultyPoints}
                      value={approved}
                      title={`Approved points for ${item.heading}`}
                      onChange={(event) =>
                        updateItem(item.id, {
                          approvedPoints: Math.max(
                            0,
                            Math.min(
                              item.facultyPoints,
                              Number(event.target.value || 0),
                            ),
                          ),
                        })
                      }
                      className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-text">
                      HOD Remarks {isDeducted ? "(Required)" : "(Optional)"}
                    </label>
                    <textarea
                      value={itemState[item.id]?.remark || ""}
                      rows={2}
                      onChange={(event) =>
                        updateItem(item.id, { remark: event.target.value })
                      }
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
                      placeholder={
                        isDeducted
                          ? "Reason for deduction (required)"
                          : "Optional remark for this criterion"
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 rounded-lg bg-bg p-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                      HOD Approved Points
                    </p>
                    <p className="mt-1 text-sm font-medium text-text">
                      {approved}
                      {isDeducted && (
                        <span className="ml-2 text-xs text-warning">
                          (deducted from {item.facultyPoints})
                        </span>
                      )}
                    </p>
                  </div>
                  {(itemState[item.id]?.remark || item.hodRemark) && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                        Remark
                      </p>
                      <p className="mt-1 text-sm text-text-2">
                        {itemState[item.id]?.remark || item.hodRemark}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {Array.isArray(item.evidence) && item.evidence.length > 0 ? (
                <div className="mt-4 space-y-1">
                  {(item.evidence as unknown as any[]).map((e: any, idx: number) => (
                    <a
                      key={idx}
                      href={fullEvidenceUrl(e.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brand-dark"
                    >
                      View uploaded evidence
                      {(item.evidence as unknown as any[]).length > 1 ? ` (${idx + 1})` : ""}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}

        {/* XIII. HOD's Remarks — rendered as a criterion item */}
        <section
          id="hod-remark-section"
          className="rounded-2xl border border-brand/20 bg-surface p-5 shadow-sm"
        >
          <h3 className="font-display text-lg font-semibold text-text">
            XIII. HOD&apos;s Remarks
          </h3>
          <p className="mt-1 text-sm text-text-2">
            Additional score awarded by HOD based on overall faculty performance (max 4 marks)
          </p>
          {canEdit ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text">
                  HOD&apos;s Remarks Score (0 to 4 Marks)
                </label>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={additionalPoints}
                  title="HOD's Remarks Score (0 to 4 Marks)"
                  onChange={(event) =>
                    setAdditionalPoints(
                      Math.max(0, Math.min(4, Number(event.target.value || 0))),
                    )
                  }
                  className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text"
                />
              </div>
              <div>
                <label
                  className={`mb-1.5 block text-sm font-medium ${
                    showAdditionalPointsRemarkError ? "text-red-600" : "text-text"
                  }`}
                >
                  Remarks for HOD&apos;s Score (Required)
                </label>
                <textarea
                  value={additionalPointsRemark}
                  rows={2}
                  onChange={(event) => {
                    setAdditionalPointsRemark(event.target.value);
                    if (event.target.value.trim()) {
                      setShowAdditionalPointsRemarkError(false);
                    }
                  }}
                  className={`w-full rounded-lg border bg-surface px-3 py-2 text-sm text-text ${
                    showAdditionalPointsRemarkError
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-border"
                  }`}
                  placeholder="Reason for score (required)"
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 rounded-lg bg-bg p-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                  HOD Approved Points
                </p>
                <p className="mt-1 text-sm font-medium text-text">
                  {additionalPoints}
                </p>
              </div>
              {additionalPointsRemark && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                    Remark
                  </p>
                  <p className="mt-1 text-sm text-text-2">
                    {additionalPointsRemark}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Memo issues — reviewed by the Co-curricular committee, recorded here
            because the HOD holds the disciplinary record. Deducts from the
            appraisal total rather than from any single criterion. */}
        <section className="rounded-2xl border border-danger/20 bg-surface p-5 shadow-sm">
          <h3 className="font-display text-lg font-semibold text-text">
            Memo Issues
          </h3>
          <p className="mt-1 text-sm text-text-2">
            Number of memos issued to this faculty during the cycle. Reviewed by
            the Co-curricular committee.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="memo-issues"
                className="mb-1.5 block text-sm font-medium text-text"
              >
                Memos Issued
              </label>
              {canEdit ? (
                <input
                  id="memo-issues"
                  type="number"
                  min={0}
                  max={50}
                  value={memoIssues}
                  title="Number of memos issued during the cycle"
                  onChange={(event) =>
                    setMemoIssues(
                      Math.max(
                        0,
                        Math.min(50, Number(event.target.value || 0)),
                      ),
                    )
                  }
                  className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text"
                />
              ) : (
                <p className="mt-1 text-sm font-medium text-text">
                  {memoIssues}
                </p>
              )}
            </div>

            <div className="rounded-lg bg-bg p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                Penalty Applied
              </p>
              {memoPenalty.note ? (
                <>
                  <p
                    className={`mt-1 text-sm font-semibold ${
                      memoPenalty.noIncrement ? "text-danger" : "text-text"
                    }`}
                  >
                    {memoPenalty.noIncrement
                      ? "No increment for the year"
                      : `−${memoPenalty.deductionPoints} points`}
                  </p>
                  <p className="mt-0.5 text-xs text-text-2">
                    {memoPenalty.note}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-text-2">No penalty</p>
              )}
            </div>
          </div>

          <ul className="mt-4 grid gap-1 text-xs text-text-3 sm:grid-cols-2">
            <li>2 memos — 4 points deducted</li>
            <li>3–4 memos — 6 points deducted</li>
            <li>5 memos — 8 points deducted + 3 holidays</li>
            <li>More than 5 memos — no increment for the year</li>
          </ul>
        </section>
      </div>

      <section id="overall-remark-section" className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        {canEdit ? (
          <>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-text">
                Overall Remark (Required)
              </label>
              <textarea
                value={overallRemark}
                onChange={(event) => {
                  setOverallRemark(event.target.value);
                  if (showOverallRemarkError) setShowOverallRemarkError(false);
                }}
                className={`min-h-24 w-full rounded-lg border bg-surface px-3 py-2 text-sm text-text ${
                  showOverallRemarkError ? "border-danger focus:outline-none focus:ring-1 focus:ring-danger" : "border-border"
                }`}
                placeholder="Final review note"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-text-2">
                <p>
                  Total approved points (including HOD&apos;s remarks):{" "}
                  <span className="font-semibold text-text">
                    {totalApprovedPoints}
                  </span>
                  {memoPenalty.deductionPoints > 0 && (
                    <span className="ml-1 text-xs text-danger">
                      ({grossApprovedPoints} − {memoPenalty.deductionPoints}{" "}
                      memo penalty)
                    </span>
                  )}
                </p>
                {memoPenalty.noIncrement && (
                  <p className="mt-0.5 text-xs font-semibold text-danger">
                    {memoPenalty.memoIssues} memo issues — no increment will be
                    granted for this year.
                  </p>
                )}
                {memoPenalty.holidaysForfeited > 0 && (
                  <p className="mt-0.5 text-xs text-danger">
                    {memoPenalty.holidaysForfeited} holidays forfeited.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setReturnDialogOpen(true)}
                  disabled={saving || rejecting || returning}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 text-sm font-medium text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Faculty
                </button>
                <button
                  type="button"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={saving || rejecting || returning}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-danger/30 bg-danger-bg px-4 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => setSubmitDialogOpen(true)}
                  disabled={saving || rejecting || returning}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-medium text-text-inv shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving ? "Submitting..." : "Submit HOD Review"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {overallRemark && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                  Overall Remark
                </p>
                <p className="mt-1 text-sm text-text-2">{overallRemark}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                Total Approved Points
              </p>
              <p className="mt-1 text-sm font-bold text-text">
                {totalApprovedPoints}
              </p>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={returnDialogOpen}
        title="Send Back to Faculty"
        description={
          <div className="space-y-3">
            <p className="text-sm text-text-2">This will return the appraisal to the faculty for corrections. Please provide a reason.</p>
            <textarea
              rows={3}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Reason for returning (required)..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        }
        confirmLabel={returning ? "Sending..." : "Confirm Return"}
        onCancel={() => { setReturnDialogOpen(false); setReturnReason(""); }}
        onConfirm={() => void returnAppraisal()}
      />

      <ConfirmDialog
        open={rejectDialogOpen}
        title="Reject Appraisal"
        description={
          <div className="space-y-3">
            <p className="text-sm text-text-2">This will reject the appraisal. Please provide a reason.</p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        }
        confirmLabel={rejecting ? "Rejecting..." : "Confirm Reject"}
        onCancel={() => { setRejectDialogOpen(false); setRejectReason(""); }}
        onConfirm={() => void rejectAppraisal()}
      />

      <ConfirmDialog
        open={submitDialogOpen}
        title="Confirm Submission"
        description="Are you sure you want to submit your HOD review? You will not be able to change the scores after submitting."
        confirmLabel={saving ? "Submitting..." : "Submit HOD Review"}
        onCancel={() => setSubmitDialogOpen(false)}
        onConfirm={() => {
          setSubmitDialogOpen(false);
          void submitReview();
        }}
      />
    </AppShell>
  );
}

export default withAuth(HodReviewDetailPage, ["HOD"]);
