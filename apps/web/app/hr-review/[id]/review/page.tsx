"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2, Save, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppraisalReviewLayer } from "@/components/ui/AppraisalReviewSection";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { API_ORIGIN } from "@/lib/api-client";
import { incrementForAppraisal } from "@/lib/utils/incrementPolicy";
import { getPrimaryRole } from "@/lib/utils/routing";
import { useAuthStore } from "@/store/auth";

function fullEvidenceUrl(url: string) {
  return url.startsWith("http") ? url : `${API_ORIGIN}${url}`;
}

type ItemState = Record<string, { approvedPoints: number; remark?: string }>;

function AccordionSection({
  isOpen,
  onToggle,
  title,
  description,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-surface-2"
      >
        <div>
          <h3 className="font-display text-base font-semibold text-text">{title}</h3>
          <p className="mt-0.5 text-xs text-text-2">{description}</p>
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5 shrink-0 text-text-3" /> : <ChevronDown className="h-5 w-5 shrink-0 text-text-3" />}
      </button>
      {isOpen && <div className="border-t border-border p-5">{children}</div>}
    </section>
  );
}

function HRReviewDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { session } = useAuthStore();
  const role = getPrimaryRole(session?.user.roles ?? []);

  useEffect(() => {
    if (!session) {
      router.push("/login");
    }
  }, [session, router]);

  const { toast } = useToast();
  const [appraisal, setAppraisal] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [itemState, setItemState] = useState<ItemState>({});

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const response = await api.hr.getById(id);
        if (!active) return;
        setAppraisal(response.data);

        const initial: Record<string, any> = {};
        (response.data.items || []).forEach((it: any) => {
          initial[it.id] = {
            approvedPoints:
              it.committeeApprovedPoints ??
              it.hodApprovedPoints ??
              it.facultyPoints,
            remark: it.committeeRemark ?? "",
          };
        });
        setItemState(initial);
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

  const hodAdditionalPoints: number = appraisal?.additionalPoints ?? 0;
  const hodAdditionalPointsRemark: string | null = appraisal?.additionalPointsRemark ?? null;

  const totalFacultyPoints = useMemo(
    () =>
      (appraisal?.items || []).reduce(
        (s: number, it: any) => s + it.facultyPoints,
        0,
      ),
    [appraisal],
  );

  const totalHodApproved = useMemo(
    () =>
      (appraisal?.items || []).reduce(
        (s: number, it: any) => s + (it.hodApprovedPoints ?? it.facultyPoints),
        0,
      ) + hodAdditionalPoints,
    [appraisal, hodAdditionalPoints],
  );

  const totalCommitteeApproved = useMemo(
    () =>
      (appraisal?.items || []).reduce(
        (s: number, it: any) =>
          s +
          (it.committeeApprovedPoints ??
            it.hodApprovedPoints ??
            it.facultyPoints),
        0,
      ) + hodAdditionalPoints,
    [appraisal, hodAdditionalPoints],
  );

  const totalApproved = useMemo(
    () =>
      Object.values(itemState).reduce(
        (s: number, it: any) => s + Number(it.approvedPoints || 0),
        0,
      ) + hodAdditionalPoints,
    [itemState, hodAdditionalPoints],
  );

  // Faculty vs HOD ladder is chosen by the appraisal's own criteria — see
  // lib/utils/incrementPolicy.ts (mirror of the API's lib/appraisalPolicy.ts).
  function hrIncrement(points: number) {
    return incrementForAppraisal(points, appraisal?.items);
  }

  const canEdit = appraisal?.status === "HR_FINALIZED";
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    faculty: true,
    hod: true,
    committee: true,
    hr: true,
  });

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function updateItem(
    id: string,
    patch: Partial<{ approvedPoints: number; remark?: string }>,
  ) {
    setItemState((curr) => ({
      ...curr,
      [id]: { ...(curr[id] || {}), ...patch },
    }));
  }

  async function reject() {
    if (!rejectReason.trim()) return;
    try {
      setRejecting(true);
      await api.hr.rejectAppraisal(id, rejectReason.trim());
      setRejectDialogOpen(false);
      toast({ title: "Success", description: "Appraisal rejected.", variant: "success" });
      setTimeout(() => router.push("/hr-review"), 1000);
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

  async function submit() {
    if (!appraisal) return;

    const items = appraisal.items.map((it: any) => ({
      itemId: it.id,
      approvedPoints: Number(itemState[it.id]?.approvedPoints || 0),
      remark: (itemState[it.id]?.remark || "").trim() || undefined,
    }));

    const hasDeduction = appraisal.items.some((it: any) => {
      const upper =
        it.committeeApprovedPoints ?? it.hodApprovedPoints ?? it.facultyPoints;
      return Number(itemState[it.id]?.approvedPoints || 0) < upper;
    });

    if (hasDeduction) {
      const missing = appraisal.items.some((it: any) => {
        const upper =
          it.committeeApprovedPoints ??
          it.hodApprovedPoints ??
          it.facultyPoints;
        if (Number(itemState[it.id]?.approvedPoints || 0) < upper) {
          return !(itemState[it.id]?.remark || "").trim();
        }
        return false;
      });
      if (missing) {
        toast({
          title: "Error",
          description: "Please provide remarks for all deductions",
          variant: "error",
        });
        return;
      }
    }

    try {
      setSaving(true);
      await api.hr.submitReview(id, { items });
      toast({
        title: "Success",
        description: "HR review submitted successfully",
        variant: "success",
      });
      setTimeout(() => router.push("/hr-review"), 1000);
    } catch (err: any) {
      toast({
        title: "Error",
        description:
          err?.response?.data?.message || err?.message || "Submit failed",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3 text-text-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading appraisal...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!appraisal) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <PageHeader
          title="HR Appraisal"
          subtitle="Not found"
          actions={
            <Link
              href="/hr-review"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm"
            >
              Back
            </Link>
          }
        />
        <div className="p-4">Not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <PageHeader
        title="HR Appraisal Review"
        subtitle={`${appraisal.user?.firstName} ${appraisal.user?.lastName}`}
        actions={
          <Link
            href="/hr-review"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm"
          >
            Back
          </Link>
        }
      />

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
            Status
          </p>
          <p className="mt-2 text-sm font-semibold text-text">
            {appraisal.status === "HR_FINALIZED"
              ? "HR Review"
              : appraisal.status}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
            Faculty Claimed
          </p>
          <p className="mt-2 text-2xl font-bold text-text">
            {totalFacultyPoints}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
            Committee Approved
          </p>
          <p className="mt-2 text-2xl font-bold text-text">
            {totalCommitteeApproved}
          </p>
          {hodAdditionalPoints > 0 && (
            <p className="mt-0.5 text-xs text-text-3">incl. {hodAdditionalPoints} HOD remarks</p>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
            HR Final
          </p>
          <p className="mt-2 text-2xl font-bold text-brand">{totalApproved}</p>
          <p className="mt-0.5 text-xs text-text-3">{hrIncrement(totalApproved)}% increment</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Sidebar - Employee Info */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h4 className="text-sm font-semibold text-text">Employee</h4>
            <div className="mt-3 space-y-2 text-sm">
              <div>
                <p className="font-medium text-text">
                  {appraisal.user?.firstName} {appraisal.user?.lastName}
                </p>
                <p className="text-xs text-text-2">{appraisal.user?.email}</p>
              </div>
              {appraisal.user?.department && (
                <div>
                  <p className="text-xs text-text-3">Department</p>
                  <p className="text-xs font-medium text-text">
                    {appraisal.user.department.name}
                  </p>
                </div>
              )}
            </div>
          </section>

          {appraisal.user?.facultyProfile ? (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h4 className="text-sm font-semibold text-text">Profile</h4>
              <div className="mt-3 space-y-2 text-xs">
                {appraisal.user.facultyProfile.dob && (
                  <div>
                    <p className="text-text-3">DOB</p>
                    <p className="font-medium text-text">
                      {String(appraisal.user.facultyProfile.dob).slice(0, 10)}
                    </p>
                  </div>
                )}
                {appraisal.user.facultyProfile.dateOfJoining && (
                  <div>
                    <p className="text-text-3">Joined</p>
                    <p className="font-medium text-text">
                      {String(
                        appraisal.user.facultyProfile.dateOfJoining,
                      ).slice(0, 10)}
                    </p>
                  </div>
                )}
                {typeof appraisal.user.facultyProfile.totalExperience ===
                  "number" && (
                  <div>
                    <p className="text-text-3">Experience</p>
                    <p className="font-medium text-text">
                      {appraisal.user.facultyProfile.totalExperience} years
                    </p>
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {(appraisal.user?.documents ?? []).length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h4 className="text-sm font-semibold text-text">Documents</h4>
              <div className="mt-3 flex flex-col gap-2">
                {appraisal.user.documents.map((doc: any) => (
                  <a
                    key={doc.id}
                    href={doc.directUrl ?? doc.viewUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs text-brand hover:underline"
                    title={doc.name}
                  >
                    {doc.name}
                  </a>
                ))}
              </div>
            </section>
          )}
        </aside>

        {/* Main Content - Review Layers */}
        <div className="space-y-4">
          {/* Faculty Claimed */}
          <AccordionSection isOpen={openSections["faculty"] ?? true} onToggle={() => toggleSection("faculty")} title="Faculty Claimed" description="Points selected by faculty member in their appraisal submission">
            <AppraisalReviewLayer
              title="Faculty Claimed"
              items={appraisal.items.map((it: any, idx: number) => ({
                itemId: it.id,
                heading: `${idx + 1}. ${it.heading ?? it.key}`,
                selectedLabel: it.selectedLabel || null,
                approvedPoints: it.facultyPoints,
                evidence:
                  Array.isArray(it.evidence) && it.evidence.length > 0
                    ? it.evidence.map((e: any) => ({
                        url: fullEvidenceUrl(e.url ?? e.viewUrl ?? e.directUrl ?? ""),
                        fileName: e.fileName,
                      }))
                    : undefined,
              }))}
            />
          </AccordionSection>

          {/* HOD Evaluation */}
          <AccordionSection isOpen={openSections["hod"] ?? true} onToggle={() => toggleSection("hod")} title="HOD Evaluation" description="Points approved by Head of Department with remarks">
            <AppraisalReviewLayer
              title="HOD Evaluation"
              items={[
                ...appraisal.items.map((it: any, idx: number) => ({
                  itemId: it.id,
                  heading: `${idx + 1}. ${it.heading ?? it.key}`,
                  approvedPoints: it.hodApprovedPoints ?? it.facultyPoints,
                  previousPoints: it.facultyPoints,
                  remark: it.hodRemark,
                  reviewer: "HOD",
                })),
                ...(hodAdditionalPoints > 0 ? [{
                  itemId: "hod-remarks-xiii",
                  heading: `${appraisal.items.length + 1}. XIII. HOD's Remarks`,
                  approvedPoints: hodAdditionalPoints,
                  remark: hodAdditionalPointsRemark,
                  reviewer: "HOD",
                }] : []),
              ]}
            />
          </AccordionSection>

          {/* Committee Evaluation */}
          <AccordionSection isOpen={openSections["committee"] ?? true} onToggle={() => toggleSection("committee")} title="Committee Evaluation" description="Points approved by committee members with remarks">
            <AppraisalReviewLayer
              title="Committee Evaluation"
              items={[
                ...appraisal.items.map((it: any, idx: number) => ({
                  itemId: it.id,
                  heading: `${idx + 1}. ${it.heading ?? it.key}`,
                  approvedPoints: it.committeeApprovedPoints ?? it.hodApprovedPoints ?? it.facultyPoints,
                  previousPoints: it.hodApprovedPoints ?? it.facultyPoints,
                  remark: it.committeeRemark,
                  reviewer: "Committee",
                })),
                ...(hodAdditionalPoints > 0 ? [{
                  itemId: "hod-remarks-xiii-committee",
                  heading: `${appraisal.items.length + 1}. XIII. HOD's Remarks`,
                  approvedPoints: hodAdditionalPoints,
                  remark: hodAdditionalPointsRemark,
                  reviewer: "HOD",
                }] : []),
              ]}
            />
          </AccordionSection>

          {/* HR Final Review */}
          <AccordionSection isOpen={openSections["hr"] ?? true} onToggle={() => toggleSection("hr")} title="HR Final Review" description={canEdit ? "Review and finalize points for this appraisal cycle" : "Points approved by HR"}>
            <AppraisalReviewLayer
              title="HR Final Review"
              isCurrentReview={canEdit}
              items={[
                ...appraisal.items.map((it: any, idx: number) => ({
                  itemId: it.id,
                  heading: `${idx + 1}. ${it.heading ?? it.key}`,
                  approvedPoints: canEdit
                    ? itemState[it.id]?.approvedPoints ?? 0
                    : it.hrApprovedPoints ?? it.committeeApprovedPoints ?? it.hodApprovedPoints ?? it.facultyPoints,
                  previousPoints: it.committeeApprovedPoints ?? it.hodApprovedPoints ?? it.facultyPoints,
                  remark: canEdit ? itemState[it.id]?.remark || "" : it.hrRemark || it.committeeRemark || "",
                  reviewer: "HR",
                })),
                ...(hodAdditionalPoints > 0 ? [{
                  itemId: "hod-remarks-xiii-hr",
                  heading: `${appraisal.items.length + 1}. XIII. HOD's Remarks`,
                  approvedPoints: hodAdditionalPoints,
                  remark: hodAdditionalPointsRemark,
                  reviewer: "HOD",
                }] : []),
              ]}
              itemInputs={
                canEdit
                  ? appraisal.items.reduce((acc: any, it: any) => {
                      acc[it.id] = {
                        approvedPointsValue: itemState[it.id]?.approvedPoints ?? 0,
                        remarkValue: itemState[it.id]?.remark || "",
                        onApprovedPointsChange: (value: number) => updateItem(it.id, { approvedPoints: value }),
                        onRemarkChange: (value: string) => updateItem(it.id, { remark: value }),
                      };
                      return acc;
                    }, {})
                  : undefined
              }
            />
          </AccordionSection>

          {/* Super Admin Approval — shown after FULLY_APPROVED */}
          {appraisal.superAdminApprovedPercent != null && (
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-text">
                Super Admin Approval
              </h3>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <p className="text-text-3">Approved Increment</p>
                  <p className="font-semibold text-success text-base">
                    {appraisal.superAdminApprovedPercent.toFixed(1)}%
                  </p>
                </div>
                {appraisal.superAdminRemark && (
                  <div>
                    <p className="text-text-3">Remark</p>
                    <p className="font-medium text-text">
                      {appraisal.superAdminRemark}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          {canEdit && (
            <p className="text-sm text-text-2">
              HR total: <span className="font-semibold text-text">{totalApproved}</span>
              {hodAdditionalPoints > 0 && <span className="ml-1 text-xs text-text-3">(incl. {hodAdditionalPoints} HOD remarks)</span>}
              {" · "}
              Increment: <span className="font-semibold text-brand">{hrIncrement(totalApproved)}%</span>
            </p>
          )}
          {!canEdit && (
            <div className="text-sm text-text-2">
              This appraisal is fully approved. HR can view it only.
            </div>
          )}
        </div>
        {canEdit ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRejectDialogOpen(true)}
              disabled={saving || rejecting}
              className="inline-flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-bg px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            <button
              type="button"
              onClick={() => setSubmitDialogOpen(true)}
              disabled={saving || rejecting}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-2 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Forward to Admin
            </button>
          </div>
        ) : null}
      </div>

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
        onConfirm={() => void reject()}
      />

      <ConfirmDialog
        open={submitDialogOpen}
        title="Confirm Submission"
        description="Are you sure you want to forward this appraisal to the Admin? You will not be able to change it after submitting."
        confirmLabel={saving ? "Forwarding..." : "Forward to Admin"}
        onCancel={() => setSubmitDialogOpen(false)}
        onConfirm={() => {
          setSubmitDialogOpen(false);
          void submit();
        }}
      />
    </div>
  );
}

export default HRReviewDetail;
