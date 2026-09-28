// Client-side mirror of apps/api/src/lib/memoPolicy.ts. Used only to preview the
// penalty while the HOD is filling the review and to display it downstream — the
// API always recomputes it on submit, so this file must never be the sole source
// of a stored value. Keep the two ladders in sync.
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

export function memoPenaltyFor(
  memoIssues: number | null | undefined,
): MemoPenalty {
  const count =
    typeof memoIssues === "number" && Number.isFinite(memoIssues)
      ? Math.max(memoIssues, 0)
      : 0;

  if (count <= 1) {
    return {
      memoIssues: count,
      deductionPoints: 0,
      holidaysForfeited: 0,
      noIncrement: false,
      note: null,
    };
  }

  if (count === 2) {
    return {
      memoIssues: count,
      deductionPoints: 4,
      holidaysForfeited: 0,
      noIncrement: false,
      note: "2 memo issues — 4 points deducted",
    };
  }

  if (count <= 4) {
    return {
      memoIssues: count,
      deductionPoints: 6,
      holidaysForfeited: 0,
      noIncrement: false,
      note: `${count} memo issues — 6 points deducted`,
    };
  }

  if (count === 5) {
    return {
      memoIssues: count,
      deductionPoints: 8,
      holidaysForfeited: 3,
      noIncrement: false,
      note: "5 memo issues — 8 points deducted and 3 holidays forfeited",
    };
  }

  return {
    memoIssues: count,
    deductionPoints: 0,
    holidaysForfeited: 0,
    noIncrement: true,
    note: `${count} memo issues — no increment for the year`,
  };
}
