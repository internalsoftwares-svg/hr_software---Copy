// Memo-issue penalties. Memo counts are recorded by the HOD during review and
// govern the Co-curricular category, but they apply to the appraisal total (not
// to any single criterion), so every place that computes a final score or
// increment percent must run the result through this module.
//
// The ladder is banded, not cumulative — only the highest band that matches the
// memo count applies:
//
//   0–1 memos  → no penalty
//   2 memos    → 4 points deducted
//   3–4 memos  → 6 points deducted
//   5 memos    → 8 points deducted + 3 holidays forfeited
//   6+ memos   → no increment for the year (0%)

export type MemoPenalty = {
  memoIssues: number;
  deductionPoints: number;
  holidaysForfeited: number;
  noIncrement: boolean;
  note: string | null;
};

export const NO_MEMO_PENALTY: MemoPenalty = {
  memoIssues: 0,
  deductionPoints: 0,
  holidaysForfeited: 0,
  noIncrement: false,
  note: null,
};

export function memoPenaltyFor(memoIssues: number | null | undefined): MemoPenalty {
  if (typeof memoIssues !== "number" || !Number.isFinite(memoIssues) || memoIssues <= 1) {
    return { ...NO_MEMO_PENALTY, memoIssues: Math.max(memoIssues ?? 0, 0) };
  }

  if (memoIssues === 2) {
    return {
      memoIssues,
      deductionPoints: 4,
      holidaysForfeited: 0,
      noIncrement: false,
      note: "2 memo issues — 4 points deducted",
    };
  }

  if (memoIssues <= 4) {
    return {
      memoIssues,
      deductionPoints: 6,
      holidaysForfeited: 0,
      noIncrement: false,
      note: `${memoIssues} memo issues — 6 points deducted`,
    };
  }

  if (memoIssues === 5) {
    return {
      memoIssues,
      deductionPoints: 8,
      holidaysForfeited: 3,
      noIncrement: false,
      note: "5 memo issues — 8 points deducted and 3 holidays forfeited",
    };
  }

  return {
    memoIssues,
    deductionPoints: 0,
    holidaysForfeited: 0,
    noIncrement: true,
    note: `${memoIssues} memo issues — no increment for the year`,
  };
}

// Applies the penalty to a gross total and its increment bracket. `increment`
// is the percent the gross points would earn before any memo penalty; the
// deduction is applied to the points first, so callers pass a bracket function
// rather than a pre-computed percent.
export function applyMemoPenalty(
  grossPoints: number,
  memoIssues: number | null | undefined,
  incrementFor: (points: number) => number,
): {
  penalty: MemoPenalty;
  netPoints: number;
  incrementPercent: number;
} {
  const penalty = memoPenaltyFor(memoIssues);
  const netPoints = Math.max(grossPoints - penalty.deductionPoints, 0);

  return {
    penalty,
    netPoints,
    incrementPercent: penalty.noIncrement ? 0 : incrementFor(netPoints),
  };
}

// Memo count lives inside the Appraisal.hodRemarks JSON blob alongside the
// HOD's overall remark and additional points.
export function parseMemoIssues(hodRemarks: string | null | undefined): number {
  if (!hodRemarks) return 0;

  try {
    const parsed = JSON.parse(hodRemarks) as Record<string, unknown>;
    return typeof parsed.memoIssues === "number" ? parsed.memoIssues : 0;
  } catch {
    return 0;
  }
}
