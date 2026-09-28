// Client-side mirror of apps/api/src/lib/appraisalPolicy.ts. Used only to
// preview the increment while a reviewer is editing approved points — the API
// always recomputes it on submit, so this file must never be the sole source of
// a stored value. Keep the two ladders in sync.
//
// Teaching staff (max 52):
//   0–8 → 0%   9–20 → 5%   21–26 → 8%   27–34 → 10%   35+ → 15%
// HOD (max 68):
//   0–10 → 0%  11–22 → 5%  23–35 → 8%   36–48 → 10%   49+ → 15%

export type IncrementBracket = {
  min: number;
  max?: number;
  incrementPercent: number;
};

export const FACULTY_MAX_POINTS = 52;
export const HOD_MAX_POINTS = 68;
export const HOD_ASSESSMENT_MAX_POINTS = 4;

export const FACULTY_INCREMENT_BRACKETS: IncrementBracket[] = [
  { min: 0, max: 8, incrementPercent: 0 },
  { min: 9, max: 20, incrementPercent: 5 },
  { min: 21, max: 26, incrementPercent: 8 },
  { min: 27, max: 34, incrementPercent: 10 },
  { min: 35, incrementPercent: 15 },
];

export const HOD_INCREMENT_BRACKETS: IncrementBracket[] = [
  { min: 0, max: 10, incrementPercent: 0 },
  { min: 11, max: 22, incrementPercent: 5 },
  { min: 23, max: 35, incrementPercent: 8 },
  { min: 36, max: 48, incrementPercent: 10 },
  { min: 49, incrementPercent: 15 },
];

// Criteria XIV–XVIII only appear on an HOD's own appraisal.
export const HOD_ONLY_CRITERION_KEYS = [
  "fee_recovery",
  "awards_outside_svgoi",
  "overall_university_result",
  "placement",
  "department_university_positions",
];

export function isHodAppraisalItems(
  items: ReadonlyArray<{ criterionKey: string }> | null | undefined,
): boolean {
  return (items ?? []).some((item) =>
    HOD_ONLY_CRITERION_KEYS.includes(item.criterionKey),
  );
}

export function incrementFromBrackets(
  totalPoints: number,
  brackets: IncrementBracket[],
): number {
  const bracket = brackets.find((entry) => {
    const lower = totalPoints >= entry.min;
    const upper =
      typeof entry.max === "number" ? totalPoints <= entry.max : true;
    return lower && upper;
  });
  return bracket?.incrementPercent ?? 0;
}

export function incrementForAppraisal(
  totalPoints: number,
  items: ReadonlyArray<{ criterionKey: string }> | null | undefined,
): number {
  return incrementFromBrackets(
    totalPoints,
    isHodAppraisalItems(items) ? HOD_INCREMENT_BRACKETS : FACULTY_INCREMENT_BRACKETS,
  );
}
