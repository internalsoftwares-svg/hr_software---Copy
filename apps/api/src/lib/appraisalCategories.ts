import { AppraisalCategory } from "@prisma/client";

// Canonical criterion-key → category mapping. MUST stay in sync with the
// criteria catalog in routes/faculty.ts (each criterion carries a `category`).
// Used to derive/backfill AppraisalItem.category when only the key is known
// (e.g. self-submitted draft items in routes/appraisals.ts).
const KEY_TO_CATEGORY: Record<string, AppraisalCategory> = {
  // Academics — criteria I, VI, VII, XI, XVI, XVIII
  academics_average_result: "ACADEMICS",
  conference_seminar_workshop: "ACADEMICS",
  fdp_stp: "ACADEMICS",
  attendance: "ACADEMICS",
  overall_university_result: "ACADEMICS",
  department_university_positions: "ACADEMICS",
  // Research — criteria II, III, IV, V, VIII, IX
  research_publications: "RESEARCH",
  impact_factor: "RESEARCH",
  books_published: "RESEARCH",
  patents: "RESEARCH",
  research_project_consultancy: "RESEARCH",
  research_guidance: "RESEARCH",
  // Co-curricular — criteria X, XII, XIII, XIV, XV, XVII (+ memo penalties)
  co_curricular_activities: "OTHERS",
  awards_recognition: "OTHERS",
  fee_recovery: "OTHERS",
  awards_outside_svgoi: "OTHERS",
  placement: "OTHERS",
  // Legacy criterion-key aliases found in older appraisal data.
  scopus_papers: "RESEARCH",
  book_chapter_book_patent: "RESEARCH",
  conference_seminar_symposia: "ACADEMICS",
  hod_remarks_score: "OTHERS",
};

// Criterion XIII "HOD Remarks" is not a faculty-filled AppraisalItem — it is the
// 0–4 `additionalPoints` the HOD grants while approving the appraisal. It still
// belongs to a category for review purposes, and that category is Co-curricular.
export const HOD_REMARKS_CATEGORY: AppraisalCategory = "OTHERS";

export const ALL_CATEGORIES: AppraisalCategory[] = [
  "ACADEMICS",
  "RESEARCH",
  "OTHERS",
];

// Which committee role governs which category.
export const ROLE_TO_CATEGORY: Record<string, AppraisalCategory> = {
  COMMITTEE_ACADEMIC: "ACADEMICS",
  COMMITTEE_RESEARCH: "RESEARCH",
  COMMITTEE_OTHER: "OTHERS",
};

export function categoryForKey(key: string): AppraisalCategory | null {
  return KEY_TO_CATEGORY[key] ?? null;
}

// Maps the catalog's human category label ("Academics"/"Research"/"Co-curricular")
// to the DB enum. The OTHERS enum value is retained — only its label changed.
export function categoryFromLabel(
  label?: string | null,
): AppraisalCategory | null {
  switch (label) {
    case "Academics":
      return "ACADEMICS";
    case "Research":
      return "RESEARCH";
    case "Co-curricular":
    // Pre-rename label, still present in older stored payloads.
    case "Others":
      return "OTHERS";
    default:
      return null;
  }
}

export function labelForCategory(category: AppraisalCategory): string {
  switch (category) {
    case "ACADEMICS":
      return "Academics";
    case "RESEARCH":
      return "Research";
    case "OTHERS":
      return "Co-curricular";
    default:
      return category;
  }
}

// Returns the single category a caller governs based on their committee role,
// or null if they hold no category-specific committee role.
export function categoryForRoles(
  roles: string[] | undefined,
): AppraisalCategory | null {
  for (const role of roles ?? []) {
    if (ROLE_TO_CATEGORY[role]) return ROLE_TO_CATEGORY[role];
  }
  return null;
}
