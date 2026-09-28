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
import { isHodAppraisalItems } from "@/lib/utils/incrementPolicy";
import { useAuthStore } from "@/store/auth";

type ReviewItem = {
  id: string;
  criterionKey: string;
  heading: string;
  selectedValue: string;
  selectedLabel: string;
  facultyPoints: number;
  hodApprovedPoints: number;
  hodRemark: string;
  committeeApprovedPoints: number | null;
  committeeRemark: string;
  evidence: {
    url: string;
    fileName?: string;
    mime?: string;
    size?: number;
  } | null;
};

type CommitteeAppraisalDetail = {
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
  finalScore?: number | null;
  committeeNotes?: string | null;
  hodRemarks?: string | null;
  categoryApprovals?: CategoryApprovalRow[];
};

type CategoryApprovalRow = {
  category: string;
  approved: boolean;
  approvedBy?: { firstName: string; lastName: string } | null;
  approvedAt?: string | null;
};

type CommitteeAppraisalDetailResponse = Omit<
  CommitteeAppraisalDetail,
  "items"
> & {
  items: Array<{
    id: string;
    key: string;
    points: number;
    notes?: string | null;
  }>;
  hodRemarks?: string | null;
  categoryApprovals?: CategoryApprovalRow[];
};

type ItemState = {
  approvedPoints: number;
  remark: string;
};

type ReviewCategory = "Academics" | "Research" | "Co-curricular";

type ReviewSection = {
  category: ReviewCategory;
  items: ReviewItem[];
};

const CATEGORY_ORDER: ReviewCategory[] = [
  "Academics",
  "Research",
  "Co-curricular",
];

const CATEGORY_DETAILS: Record<
  ReviewCategory,
  { title: string; description: string }
> = {
  Academics: {
    title: "Academics",
    description:
      "Average result, conferences and seminars, FDPs/STPs, attendance, overall university result, and student positions in university academics.",
  },
  Research: {
    title: "Research",
    description:
      "Papers published, journal impact factor, books and book chapters, patents, funded projects and consultancy, and PG thesis guidance.",
  },
  "Co-curricular": {
    title: "Co-curricular",
    description:
      "Co-curricular activities, awards and recognition, HOD remarks, fee recovery, awards won outside SVGOI, placement, and memo-issue penalties.",
  },
};

// Maps a category committee role to the single category it governs.
const ROLE_TO_CATEGORY: Record<string, ReviewCategory> = {
  COMMITTEE_ACADEMIC: "Academics",
  COMMITTEE_RESEARCH: "Research",
  COMMITTEE_OTHER: "Co-curricular",
};

const CATEGORY_TO_ENUM: Record<
  ReviewCategory,
  "ACADEMICS" | "RESEARCH" | "OTHERS"
> = {
  Academics: "ACADEMICS",
  Research: "RESEARCH",
  "Co-curricular": "OTHERS",
};

const ENUM_TO_CATEGORY: Record<string, ReviewCategory> = {
  ACADEMICS: "Academics",
  RESEARCH: "Research",
  OTHERS: "Co-curricular",
};

const CATEGORY_BY_KEY: Record<string, ReviewCategory> = {
  // Academics — criteria I, VI, VII, XI, XVI, XVIII
  academics_average_result: "Academics",
  conference_seminar_workshop: "Academics",
  fdp_stp: "Academics",
  attendance: "Academics",
  overall_university_result: "Academics",
  department_university_positions: "Academics",
  // Research — criteria II, III, IV, V, VIII, IX
  research_publications: "Research",
  impact_factor: "Research",
  books_published: "Research",
  patents: "Research",
  research_project_consultancy: "Research",
  research_guidance: "Research",
  // Co-curricular — criteria X, XII, XIII, XIV, XV, XVII (+ memo penalties)
  co_curricular_activities: "Co-curricular",
  awards_recognition: "Co-curricular",
  fee_recovery: "Co-curricular",
  awards_outside_svgoi: "Co-curricular",
  placement: "Co-curricular",
  // Legacy criterion-key aliases (must match apps/api lib/appraisalCategories.ts).
  scopus_papers: "Research",
  book_chapter_book_patent: "Research",
  conference_seminar_symposia: "Academics",
  hod_remarks_score: "Co-curricular",
};

const CRITERION_ORDER = [
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

const HEADING_ROMAN_TO_CATEGORY: Record<string, ReviewCategory> = {
  I: "Academics",
  II: "Research",
  III: "Research",
  IV: "Research",
  V: "Research",
  VI: "Academics",
  VII: "Academics",
  VIII: "Research",
  IX: "Research",
  X: "Co-curricular",
  XI: "Academics",
  XII: "Co-curricular",
  XIII: "Co-curricular",
  XIV: "Co-curricular",
  XV: "Co-curricular",
  XVI: "Academics",
  XVII: "Co-curricular",
  XVIII: "Academics",
};

function fullEvidenceUrl(url: string) {
  return url.startsWith("http") ? url : `${API_ORIGIN}${url}`;
}

function parseItemNotes(notes: string | null | undefined) {
  if (!notes) {
    return {};
  }

  try {
    return JSON.parse(notes) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getReviewCategory(item: ReviewItem): ReviewCategory {
  const fromKey = CATEGORY_BY_KEY[item.criterionKey];
  if (fromKey) return fromKey;

  const romanMatch = item.heading.match(
    /^(X?I{1,3}|X?IV|X?V?I{0,3}|XIV|XV|XVI|XVII|XVIII)\./,
  );
  if (romanMatch) {
    const roman = romanMatch[1].toUpperCase();
    const fromRoman = HEADING_ROMAN_TO_CATEGORY[roman];
    if (fromRoman) return fromRoman;
  }

  return "Co-curricular";
}

function buildItemPayload(
  item: ReviewItem,
  itemState: Record<string, ItemState>,
) {
  return {
    itemId: item.id,
    approvedPoints: Number(
      itemState[item.id]?.approvedPoints ?? item.hodApprovedPoints,
    ),
    remark: itemState[item.id]?.remark?.trim() || undefined,
  };
}

const EDITABLE_STATUSES = ["HOD_REVIEW", "COMMITTEE_REVIEW"];

function CommitteeReviewPage() {
  const params = useParams();
  const router = useRouter();
  const appraisalId = params.id as string;
  const { session } = useAuthStore();
  const role = getPrimaryRole(session?.user.roles ?? []);
  const { toast } = useToast();

  // The single category this reviewer governs (null for legacy COMMITTEE / HR /
  // super-admin who see and finalize every category at once).
  const callerCategory = useMemo<ReviewCategory | null>(() => {
    for (const r of session?.user.roles ?? []) {
      if (ROLE_TO_CATEGORY[r]) return ROLE_TO_CATEGORY[r];
    }
    return null;
  }, [session]);

  const [appraisal, setAppraisal] = useState<CommitteeAppraisalDetail | null>(
    null,
  );
  const [itemState, setItemState] = useState<Record<string, ItemState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [savingCategory, setSavingCategory] = useState<ReviewCategory | null>(
    null,
  );
  const [activeCategory, setActiveCategory] = useState<ReviewCategory>(
    CATEGORY_ORDER[0],
  );
  const [savedSections, setSavedSections] = useState<
    Partial<Record<ReviewCategory, boolean>>
  >({});
  const [remarksScore, setRemarksScore] = useState(0);
  const [remarksScoreRemark, setRemarksScoreRemark] = useState("");
  const [hodAdditionalPoints, setHodAdditionalPoints] = useState(0);
  const [hodAdditionalPointsRemark, setHodAdditionalPointsRemark] = useState("");
  const [hodOverallRemark, setHodOverallRemark] = useState("");
  const [memoIssues, setMemoIssues] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadAppraisal() {
      try {
        setLoading(true);
        const response = await api.appraisals.getById(appraisalId);
        const payload =
          response.data as unknown as CommitteeAppraisalDetailResponse;

        const nextItems = payload.items.map((item) => {
          const parsed = parseItemNotes(item.notes);
          const hodReview =
            typeof parsed.hodReview === "object" && parsed.hodReview
              ? (parsed.hodReview as Record<string, unknown>)
              : null;
          const committeeReview =
            typeof parsed.committeeReview === "object" && parsed.committeeReview
              ? (parsed.committeeReview as Record<string, unknown>)
              : null;

          return {
            id: item.id,
            criterionKey: item.key,
            heading:
              typeof parsed.heading === "string" ? parsed.heading : item.key,
            selectedValue:
              typeof parsed.selectedValue === "string"
                ? parsed.selectedValue
                : "",
            selectedLabel:
              typeof parsed.selectedLabel === "string"
                ? parsed.selectedLabel
                : "",
            facultyPoints:
              typeof hodReview?.originalPoints === "number"
                ? Number(hodReview.originalPoints)
                : typeof parsed.originalSubmittedPoints === "number"
                  ? Number(parsed.originalSubmittedPoints)
                  : item.points,
            hodApprovedPoints:
              typeof hodReview?.approvedPoints === "number"
                ? Number(hodReview.approvedPoints)
                : typeof parsed.originalSubmittedPoints === "number"
                  ? Number(parsed.originalSubmittedPoints)
                  : item.points,
            hodRemark:
              typeof hodReview?.remark === "string"
                ? String(hodReview.remark)
                : "",
            committeeApprovedPoints:
              typeof committeeReview?.approvedPoints === "number"
                ? Number(committeeReview.approvedPoints)
                : null,
            committeeRemark:
              typeof committeeReview?.remark === "string"
                ? String(committeeReview.remark)
                : "",
            evidence:
              typeof parsed.evidence === "object" && parsed.evidence
                ? (parsed.evidence as ReviewItem["evidence"])
                : null,
          };
        });

        if (!active) {
          return;
        }

        try {
          const savedNotes = payload.committeeNotes
            ? (JSON.parse(payload.committeeNotes) as Record<string, unknown>)
            : null;
          if (typeof savedNotes?.additionalPoints === "number") {
            setRemarksScore(savedNotes.additionalPoints);
          }
          if (typeof savedNotes?.additionalPointsRemark === "string") {
            setRemarksScoreRemark(savedNotes.additionalPointsRemark);
          }
        } catch {
          // non-fatal
        }

        try {
          const hodRemarksData = payload.hodRemarks
            ? (JSON.parse(payload.hodRemarks) as Record<string, unknown>)
            : null;
          if (typeof hodRemarksData?.additionalPoints === "number") {
            setHodAdditionalPoints(hodRemarksData.additionalPoints);
          }
          if (typeof hodRemarksData?.additionalPointsRemark === "string") {
            setHodAdditionalPointsRemark(hodRemarksData.additionalPointsRemark);
          }
          if (typeof hodRemarksData?.overallRemark === "string") {
            setHodOverallRemark(hodRemarksData.overallRemark);
          }
          if (typeof hodRemarksData?.memoIssues === "number") {
            setMemoIssues(hodRemarksData.memoIssues);
          }
        } catch {
          // non-fatal
        }

        setAppraisal({
          id: payload.id,
          status: payload.status,
          submittedAt: payload.submittedAt,
          user: payload.user,
          cycle: payload.cycle,
          items: nextItems,
          finalScore: payload.finalScore,
          committeeNotes: payload.committeeNotes,
          hodRemarks: payload.hodRemarks,
          categoryApprovals: payload.categoryApprovals ?? [],
        });

        setSavedSections({});

        const initialState: Record<string, ItemState> = {};
        nextItems.forEach((item) => {
          initialState[item.id] = {
            // In edit mode: start from HOD approved; in view mode we show committeeApprovedPoints separately
            approvedPoints: item.hodApprovedPoints,
            remark: "",
          };
        });
        setItemState(initialState);
      } catch (loadError: any) {
        if (active) {
          toast({
            title: "Error",
            description:
              loadError?.response?.data?.message ||
              loadError?.message ||
              "Failed to load appraisal review",
            variant: "error",
          });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (appraisalId) {
      void loadAppraisal();
    }

    return () => {
      active = false;
    };
  }, [appraisalId]);

  const canEdit = EDITABLE_STATUSES.includes(appraisal?.status ?? "");

  const isHodAppraisal = useMemo(
    () => isHodAppraisalItems(appraisal?.items),
    [appraisal],
  );

  const totalApprovedPoints = useMemo(() => {
    const itemSum = Object.values(itemState).reduce(
      (sum, item) => sum + Number(item.approvedPoints || 0),
      0,
    );
    return itemSum + (isHodAppraisal ? remarksScore : hodAdditionalPoints);
  }, [itemState, remarksScore, hodAdditionalPoints, isHodAppraisal]);

  const totalCommitteeApproved = useMemo(
    () =>
      (appraisal?.items ?? []).reduce(
        (sum, item) =>
          sum + (item.committeeApprovedPoints ?? item.hodApprovedPoints),
        0,
      ) + (isHodAppraisal ? remarksScore : hodAdditionalPoints),
    [appraisal, isHodAppraisal, remarksScore, hodAdditionalPoints],
  );

  const reviewSections = useMemo(() => {
    if (!appraisal) {
      return [];
    }

    const grouped = CATEGORY_ORDER.reduce((accumulator, category) => {
      accumulator[category] = [];
      return accumulator;
    }, {} as Record<ReviewCategory, ReviewItem[]>);

    sortByOrder(appraisal.items).forEach((item) => {
      grouped[getReviewCategory(item)].push(item);
    });

    return CATEGORY_ORDER.map((category) => ({
      category,
      items: grouped[category],
    }))
      .filter((section) => section.items.length > 0)
      // Category committees only ever see/act on their own category.
      .filter(
        (section) => !callerCategory || section.category === callerCategory,
      );
  }, [appraisal, callerCategory]);

  // Items in scope for this reviewer (their category only, or all for legacy).
  const scopedItems = useMemo(() => {
    const items = appraisal?.items ?? [];
    return callerCategory
      ? items.filter((item) => getReviewCategory(item) === callerCategory)
      : items;
  }, [appraisal, callerCategory]);

  // Criterion XIII (HOD's Remarks) has no AppraisalItem of its own — it is the
  // HOD's 0–4 additionalPoints and belongs to the Co-curricular category, so
  // only that committee counts it toward its own total. Memo penalties are
  // likewise reviewed by Co-curricular but deduct from the appraisal total.
  const ownsHodRemarks = !callerCategory || callerCategory === "Co-curricular";
  const hodRemarksPoints = isHodAppraisal ? remarksScore : hodAdditionalPoints;
  const memoPenalty = useMemo(() => memoPenaltyFor(memoIssues), [memoIssues]);

  const scopedApprovedPoints = useMemo(
    () =>
      scopedItems.reduce(
        (sum, item) =>
          sum +
          Number(itemState[item.id]?.approvedPoints ?? item.hodApprovedPoints),
        0,
      ) + (ownsHodRemarks ? hodRemarksPoints : 0),
    [scopedItems, itemState, ownsHodRemarks, hodRemarksPoints],
  );

  const myCategoryApproved = useMemo(
    () =>
      !!callerCategory &&
      (appraisal?.categoryApprovals ?? []).some(
        (a) => ENUM_TO_CATEGORY[a.category] === callerCategory && a.approved,
      ),
    [appraisal, callerCategory],
  );

  const activeSection =
    reviewSections.find((section) => section.category === activeCategory) ??
    reviewSections[0] ??
    null;

  useEffect(() => {
    if (reviewSections.length === 0) {
      return;
    }

    if (
      !reviewSections.some((section) => section.category === activeCategory)
    ) {
      setActiveCategory(reviewSections[0].category);
    }
  }, [activeCategory, reviewSections]);

  function validateItemRemarks(items: ReviewItem[]) {
    return items.some((item) => {
      const approved = Number(
        itemState[item.id]?.approvedPoints ?? item.hodApprovedPoints,
      );

      if (approved < item.hodApprovedPoints) {
        return !(itemState[item.id]?.remark || "").trim();
      }

      return false;
    });
  }

  function updateItem(id: string, patch: Partial<ItemState>) {
    setItemState((current) => ({
      ...current,
      [id]: {
        approvedPoints: current[id]?.approvedPoints ?? 0,
        remark: current[id]?.remark ?? "",
        ...patch,
      },
    }));

    if (!appraisal) {
      return;
    }

    const matchedItem = appraisal.items.find((item) => item.id === id);
    if (!matchedItem) {
      return;
    }

    const category = getReviewCategory(matchedItem);
    setSavedSections((current) => ({
      ...current,
      [category]: false,
    }));
  }

  async function saveSection(category: ReviewCategory) {
    if (!appraisal) {
      return;
    }

    const section = reviewSections.find((entry) => entry.category === category);
    if (!section) {
      return;
    }

    if (validateItemRemarks(section.items)) {
      toast({
        title: "Error",
        description: "Remarks are required for each deducted criterion.",
        variant: "error",
      });
      return;
    }

    try {
      setSavingCategory(category);
      await api.committee.submitReview(appraisalId, {
        items: section.items.map((item) => buildItemPayload(item, itemState)),
        finalize: false,
      });
      setSavedSections((current) => ({
        ...current,
        [category]: true,
      }));
      toast({
        title: "Success",
        description: `${category} section saved successfully.`,
        variant: "success",
      });
    } catch (submitError: any) {
      toast({
        title: "Error",
        description:
          submitError?.response?.data?.message ||
          submitError?.message ||
          "Failed to save committee section",
        variant: "error",
      });
    } finally {
      setSavingCategory(null);
    }
  }

  async function submitReview() {
    if (!appraisal) {
      return;
    }

    const itemsPayload = appraisal.items.map((item) =>
      buildItemPayload(item, itemState),
    );

    const unsavedCategories = reviewSections
      .filter((section) => !savedSections[section.category])
      .map((section) => section.category);

    if (unsavedCategories.length > 0) {
      toast({
        title: "Error",
        description: `Please save all categories before finalizing: ${unsavedCategories.join(", ")}`,
        variant: "error",
      });
      return;
    }

    if (validateItemRemarks(appraisal.items)) {
      toast({
        title: "Error",
        description: "Remarks are required for each deducted criterion.",
        variant: "error",
      });
      return;
    }

    try {
      setSaving(true);
      await api.committee.submitReview(appraisalId, {
        items: itemsPayload,
        finalize: true,
        additionalPoints: isHodAppraisal ? remarksScore : hodAdditionalPoints,
        additionalPointsRemark: isHodAppraisal ? (remarksScoreRemark.trim() || undefined) : undefined,
      });
      toast({
        title: "Success",
        description: "Committee review submitted successfully.",
        variant: "success",
      });
      setTimeout(() => {
        router.push("/committee-review");
      }, 1000);
    } catch (submitError: any) {
      toast({
        title: "Error",
        description:
          submitError?.response?.data?.message ||
          submitError?.message ||
          "Failed to submit committee review",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  // Category committee approves only its own category. Backend auto-forwards to
  // HR once all three categories are approved.
  async function approveCategory() {
    if (!appraisal || !callerCategory) {
      return;
    }

    const section = reviewSections.find(
      (entry) => entry.category === callerCategory,
    );
    if (!section) {
      return;
    }

    if (validateItemRemarks(section.items)) {
      toast({
        title: "Error",
        description: "Remarks are required for each deducted criterion.",
        variant: "error",
      });
      return;
    }

    try {
      setSaving(true);
      const result = await api.committee.approveCategory(appraisalId, {
        items: section.items.map((item) => buildItemPayload(item, itemState)),
        category: CATEGORY_TO_ENUM[callerCategory],
      });
      toast({
        title: "Success",
        description: result.data.combined
          ? "All categories approved — appraisal forwarded to HR."
          : `${callerCategory} category approved.`,
        variant: "success",
      });
      setTimeout(() => {
        router.push("/committee-review");
      }, 1000);
    } catch (submitError: any) {
      toast({
        title: "Error",
        description:
          submitError?.response?.data?.message ||
          submitError?.message ||
          "Failed to approve category",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell role={role}>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-3 text-text-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading appraisal review...</span>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!appraisal) {
    return null;
  }

  return (
    <AppShell role={role}>
      <PageHeader
        title="Committee Appraisal Review"
        subtitle={`${appraisal.user?.firstName ?? ""} ${
          appraisal.user?.lastName ?? ""
        } | ${appraisal.cycle?.name ?? "Cycle"}`.trim()}
        actions={
          <Link
            href="/committee-review"
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
            <p className="font-semibold">Committee review submitted</p>
            <p className="mt-0.5 text-text-2">
              This appraisal has been forwarded to HR. You can view the
              submitted review below (read-only).
            </p>
          </div>
        </div>
      )}

      {/* Summary metrics */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
            Review Status
          </p>
          <p className="mt-2 font-semibold text-text">
            {appraisal.status.replace(/_/g, " ")}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
            {callerCategory ? `${callerCategory} Claimed` : "Faculty Claimed"}
          </p>
          <p className="mt-2 text-2xl font-bold text-text">
            {scopedItems.reduce((sum, item) => sum + item.facultyPoints, 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
            HOD Approved
          </p>
          <p className="mt-2 text-2xl font-bold text-text">
            {scopedItems.reduce((sum, item) => sum + item.hodApprovedPoints, 0) +
              (ownsHodRemarks && !isHodAppraisal ? hodAdditionalPoints : 0)}
          </p>
          {ownsHodRemarks && !isHodAppraisal && hodAdditionalPoints > 0 && (
            <p className="mt-0.5 text-xs text-text-3">
              incl. {hodAdditionalPoints} remarks score (XIII)
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-brand/10 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">
            {callerCategory ? `${callerCategory} Approved` : "Committee Approved"}
          </p>
          <p className="mt-2 text-2xl font-bold text-brand">
            {callerCategory
              ? scopedApprovedPoints
              : canEdit
              ? totalApprovedPoints
              : totalCommitteeApproved}
          </p>
        </div>
      </div>

      {/* Category tabs */}
      {reviewSections.length > 0 ? (
        <div className="mb-6 rounded-2xl border border-border bg-surface p-3 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {reviewSections.map((section) => {
              const isActive = activeCategory === section.category;

              return (
                <button
                  key={section.category}
                  type="button"
                  onClick={() => setActiveCategory(section.category)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "border-brand bg-brand text-white"
                      : "border-border bg-bg text-text hover:bg-surface-2"
                  }`}
                >
                  <span>{section.category}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-surface text-text-2"
                    }`}
                  >
                    {section.items.length}
                  </span>
                  {canEdit && savedSections[section.category] ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Saved
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Active section items */}
      {activeSection ? (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-semibold text-text">
                  {CATEGORY_DETAILS[activeSection.category].title}
                </h3>
                {canEdit && savedSections[activeSection.category] ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Saved
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-text-2">
                {CATEGORY_DETAILS[activeSection.category].description}
              </p>
            </div>
            {canEdit && !callerCategory && (
              <button
                type="button"
                onClick={() => void saveSection(activeSection.category)}
                disabled={savingCategory === activeSection.category || saving}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-text-inv shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingCategory === activeSection.category ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {savingCategory === activeSection.category
                  ? `Saving ${activeSection.category}...`
                  : `Save ${activeSection.category} section`}
              </button>
            )}
          </div>

          <div className="mt-5 space-y-4">
            {activeSection.items.map((item) => {
              const editApproved = Number(
                itemState[item.id]?.approvedPoints ?? item.hodApprovedPoints,
              );
              const viewApproved =
                item.committeeApprovedPoints ?? item.hodApprovedPoints;
              const approved = canEdit ? editApproved : viewApproved;
              const isDeducted = approved < item.hodApprovedPoints;
              const deductionAmount = item.hodApprovedPoints - approved;

              return (
                <section
                  key={item.id}
                  className="rounded-2xl border border-border bg-bg p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-text">
                        {item.heading}
                      </h3>
                      <p className="mt-1 text-xs text-text-3">
                        {CATEGORY_DETAILS[activeSection.category].title} •
                        Criterion: {item.criterionKey}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <div className="flex items-baseline gap-2">
                        {isDeducted && (
                          <span className="inline-flex items-center rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
                            -{deductionAmount}
                          </span>
                        )}
                        <span className="text-lg font-bold text-text">
                          {approved}
                        </span>
                        {item.hodApprovedPoints !== approved && (
                          <span className="text-xs text-text-3">
                            from {item.hodApprovedPoints}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Faculty + HOD info */}
                  <div className="mt-4 grid gap-3 rounded-lg bg-surface p-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                        Faculty Claimed
                      </p>
                      <p className="mt-1 text-sm font-medium text-text">
                        {item.selectedLabel || item.selectedValue || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                        HOD Evaluated Points
                      </p>
                      <p className="mt-1 text-sm font-medium text-text">
                        {item.hodApprovedPoints}
                        {item.hodRemark && (
                          <span className="ml-2 text-xs text-text-2">
                            ({item.hodRemark})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {canEdit ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-text">
                          Committee Approved Points
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={item.hodApprovedPoints}
                          value={editApproved}
                          aria-label={`Committee approved points for ${item.heading}`}
                          title={`Committee approved points for ${item.heading}`}
                          onChange={(event) =>
                            updateItem(item.id, {
                              approvedPoints: Math.max(
                                0,
                                Math.min(
                                  item.hodApprovedPoints,
                                  Number(event.target.value || 0),
                                ),
                              ),
                            })
                          }
                          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-text">
                          Committee Remark{" "}
                          {isDeducted ? "(Required)" : "(Optional)"}
                        </label>
                        <input
                          value={itemState[item.id]?.remark || ""}
                          aria-label={`Committee remark for ${item.heading}`}
                          title={`Committee remark for ${item.heading}`}
                          onChange={(event) =>
                            updateItem(item.id, { remark: event.target.value })
                          }
                          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text"
                          placeholder={
                            isDeducted
                              ? "Reason for deduction..."
                              : "Optional remark..."
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    /* View-only: show submitted committee values */
                    <div className="mt-4 grid gap-3 rounded-lg bg-surface p-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                          Committee Approved Points
                        </p>
                        <p className="mt-1 text-sm font-bold text-brand">
                          {viewApproved}
                          {isDeducted && (
                            <span className="ml-2 text-xs font-normal text-warning">
                              (deducted {deductionAmount} from HOD)
                            </span>
                          )}
                        </p>
                      </div>
                      {item.committeeRemark && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                            Committee Remark
                          </p>
                          <p className="mt-1 text-sm text-text-2">
                            {item.committeeRemark}
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
          </div>
        </section>
      ) : null}

      {/* HOD remarks info panel — faculty appraisals only. The score itself is
          criterion XIII and counts toward the Co-curricular category. */}
      {!isHodAppraisal && (hodAdditionalPoints > 0 || hodOverallRemark) && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="font-display text-base font-semibold text-text">
            XIII. HOD&apos;s Remarks
          </h3>
          {ownsHodRemarks && (
            <p className="mt-1 text-sm text-text-2">
              Counts toward the Co-curricular category total.
            </p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-bg p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-text-3">HOD&apos;s Remarks Score</p>
              <p className="mt-1 text-lg font-bold text-text">{hodAdditionalPoints} / 4</p>
              {hodAdditionalPointsRemark && (
                <p className="mt-1 text-sm text-text-2">{hodAdditionalPointsRemark}</p>
              )}
            </div>
            {hodOverallRemark && (
              <div className="rounded-lg bg-bg p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-text-3">Overall Remark</p>
                <p className="mt-1 text-sm text-text-2">{hodOverallRemark}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Memo issues — recorded by the HOD, reviewed by the Co-curricular
          committee. Deducts from the appraisal total, not from any criterion. */}
      {ownsHodRemarks && (
        <div
          className={`mt-6 rounded-2xl border p-5 shadow-sm ${
            memoPenalty.note
              ? "border-danger/30 bg-danger-bg"
              : "border-border bg-surface"
          }`}
        >
          <h3 className="font-display text-base font-semibold text-text">
            Memo Issues
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-bg p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                Memos Issued
              </p>
              <p className="mt-1 text-lg font-bold text-text">{memoIssues}</p>
            </div>
            <div className="rounded-lg bg-bg p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
                Penalty Applied
              </p>
              {memoPenalty.note ? (
                <>
                  <p
                    className={`mt-1 text-lg font-bold ${
                      memoPenalty.noIncrement ? "text-danger" : "text-text"
                    }`}
                  >
                    {memoPenalty.noIncrement
                      ? "No increment"
                      : `−${memoPenalty.deductionPoints} points`}
                  </p>
                  <p className="mt-1 text-sm text-text-2">{memoPenalty.note}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-text-2">No penalty</p>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-text-3">
            Recorded by the HOD during review. The deduction is applied to the
            appraisal total when the final increment is calculated, not to any
            individual criterion.
          </p>
        </div>
      )}

      {/* Per-category approval status board */}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-3">
          Category Approval Status
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {CATEGORY_ORDER.map((category) => {
            const row = (appraisal.categoryApprovals ?? []).find(
              (a) => ENUM_TO_CATEGORY[a.category] === category,
            );
            const approved = !!row?.approved;
            const saved = savedSections[category];

            return (
              <div
                key={category}
                className={`rounded-xl border p-3 ${
                  approved
                    ? "border-emerald-200 bg-emerald-50"
                    : saved
                    ? "border-blue-200 bg-blue-50"
                    : "border-border bg-bg"
                }`}
              >
                <div className="flex items-center gap-2">
                  {approved ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : saved ? (
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border-2 border-border" />
                  )}
                  <span className="text-sm font-semibold text-text">
                    {category}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-3">
                  {approved
                    ? row?.approvedBy
                      ? `Approved by ${row.approvedBy.firstName} ${row.approvedBy.lastName}`
                      : "Approved"
                    : saved
                    ? "Saved (Draft)"
                    : "Pending"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      {canEdit ? (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${isHodAppraisal ? "mt-5" : ""}`}>
            <p className="text-sm text-text-2">
              {callerCategory
                ? `${callerCategory} approved points: ${scopedApprovedPoints}`
                : `Total approved points${isHodAppraisal ? " (including HOD’s Remarks)" : ""}: ${totalApprovedPoints}`}
            </p>
            {callerCategory ? (
              <button
                type="button"
                onClick={() => setConfirmDialogOpen(true)}
                disabled={saving || myCategoryApproved}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-medium text-text-inv shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {myCategoryApproved
                  ? `${callerCategory} Approved`
                  : saving
                  ? "Approving..."
                  : `Approve ${callerCategory}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDialogOpen(true)}
                disabled={saving || savingCategory !== null}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-medium text-text-inv shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Submitting..." : "Submit Final Review"}
              </button>
            )}
          </div>
        </section>
      ) : (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <p className="text-sm font-semibold text-text">
                Committee review complete
              </p>
              <p className="mt-0.5 text-sm text-text-2">
                Total committee approved points:{" "}
                <span className="font-bold text-brand">
                  {totalCommitteeApproved}
                </span>
                {isHodAppraisal && remarksScore > 0 && (
                  <span className="ml-2 text-xs text-text-3">
                    (includes HOD&apos;s Remarks Score: {remarksScore})
                  </span>
                )}
                {!isHodAppraisal && hodAdditionalPoints > 0 && (
                  <span className="ml-2 text-xs text-text-3">
                    (includes HOD&apos;s Remarks Score: {hodAdditionalPoints})
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialogOpen}
        title="Confirm Submission"
        description="Are you sure you want to submit your review? You cannot change the scores after this action."
        confirmLabel={saving ? "Submitting..." : "Submit Review"}
        onCancel={() => setConfirmDialogOpen(false)}
        onConfirm={() => {
          setConfirmDialogOpen(false);
          if (callerCategory) {
            void approveCategory();
          } else {
            void submitReview();
          }
        }}
      />
    </AppShell>
  );
}

export default withAuth(CommitteeReviewPage, [
  "COMMITTEE",
  "COMMITTEE_ACADEMIC",
  "COMMITTEE_RESEARCH",
  "COMMITTEE_OTHER",
]);
