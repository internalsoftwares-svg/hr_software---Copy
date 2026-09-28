import { AppraisalCategory } from "@prisma/client";
import { prisma } from "./prisma";
import { ALL_CATEGORIES } from "./appraisalCategories";

// Idempotently ensures the three per-category approval rows exist for an
// appraisal (called lazily whenever the committee stage touches it). The unique
// [appraisalId, category] constraint + skipDuplicates makes this safe to call
// repeatedly and concurrently.
export async function ensureCategoryApprovals(appraisalId: string) {
  await prisma.categoryApproval.createMany({
    data: ALL_CATEGORIES.map((category) => ({ appraisalId, category })),
    skipDuplicates: true,
  });
}

export async function getCategoryApprovals(appraisalId: string) {
  return prisma.categoryApproval.findMany({
    where: { appraisalId },
    orderBy: { category: "asc" },
  });
}

// True only when all three categories are approved — the gate for advancing to
// HR.
export function allCategoriesApproved(
  approvals: { category: AppraisalCategory; approved: boolean }[],
): boolean {
  return ALL_CATEGORIES.every((category) =>
    approvals.some((a) => a.category === category && a.approved),
  );
}
