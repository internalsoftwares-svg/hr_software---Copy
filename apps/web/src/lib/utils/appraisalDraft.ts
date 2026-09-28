import type { FacultyEvidenceUpload } from "@svgoi/shared-types";

const DRAFT_PREFIX = "svgoi:appraisal-draft:";

export type AppraisalDraftCriterion = {
  selectedValue: string;
  remarks: string;
  evidence: FacultyEvidenceUpload[] | null;
};

export type AppraisalDraftData = Record<string, AppraisalDraftCriterion>;

export function appraisalDraftKey(userId: string | undefined, scope: string) {
  return `${DRAFT_PREFIX}${userId ?? "anon"}:${scope}`;
}

export function loadAppraisalDraft(key: string): AppraisalDraftData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as AppraisalDraftData;
  } catch {
    return null;
  }
}

export function saveAppraisalDraft(key: string, data: AppraisalDraftData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // storage unavailable or full — autosave is best-effort
  }
}

export function clearAppraisalDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function hasMeaningfulDraftData(data: AppraisalDraftData | null): boolean {
  if (!data) return false;
  return Object.values(data).some(
    (entry) =>
      entry.selectedValue ||
      entry.remarks?.trim() ||
      (entry.evidence && entry.evidence.length > 0),
  );
}
