// Increment ladders and point ceilings from the institution's Appraisal Policy
// (approved 10/09/2026). Every place that turns a point total into an
// increment percent — self-submission, HOD review, committee review, HR review,
// admin review — must go through this module so the ladders never drift apart.
//
// Teaching staff (max 52 = 12 self-assessed criteria × 4 + HOD assessment 0–4):
//   0–8   → 0%      9–20  → 5%     21–26 → 8%     27–34 → 10%    35+ → 15%
//
// HOD (max 68 = 12 base + 5 HOD-only criteria, each 0–4; no self HOD assessment):
//   0–10  → 0%      11–22 → 5%     23–35 → 8%     36–48 → 10%    49+ → 15%
//
// Memo penalties are applied to the point total *before* the ladder — see
// lib/memoPolicy.ts.

export type IncrementBracket = {
  min: number;
  max?: number;
  incrementPercent: number;
};

export const FACULTY_MAX_POINTS = 52;
export const HOD_MAX_POINTS = 68;

// Criterion XIII — the HOD may award 1–4 additional points on a faculty appraisal.
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

// Criteria XIV–XVIII exist only on an HOD's own appraisal, so their presence
// among an appraisal's items is what tells reviewers which ladder applies.
// Keep in sync with `hodOnlyCriteria` in routes/faculty.ts.
export const HOD_ONLY_CRITERION_KEYS = [
  "fee_recovery",
  "awards_outside_svgoi",
  "overall_university_result",
  "placement",
  "department_university_positions",
] as const;

export function isHodAppraisalItems(
  items: ReadonlyArray<{ key: string }>,
): boolean {
  return items.some((item) =>
    (HOD_ONLY_CRITERION_KEYS as readonly string[]).includes(item.key),
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

export function facultyIncrement(totalPoints: number): number {
  return incrementFromBrackets(totalPoints, FACULTY_INCREMENT_BRACKETS);
}

export function hodIncrement(totalPoints: number): number {
  return incrementFromBrackets(totalPoints, HOD_INCREMENT_BRACKETS);
}

// Returns a `(points) => percent` function for the given appraisal, suitable
// for passing straight into applyMemoPenalty().
export function incrementFnForItems(
  items: ReadonlyArray<{ key: string }>,
): (totalPoints: number) => number {
  return isHodAppraisalItems(items) ? hodIncrement : facultyIncrement;
}
