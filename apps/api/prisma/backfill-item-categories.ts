/**
 * Syncs AppraisalItem.category with the canonical criterion-key → category map
 * in src/lib/appraisalCategories.ts.
 *
 * Two modes, both safe to run repeatedly:
 *
 *   # Fill in rows created before the category column existed (default).
 *   cd apps/api && pnpm exec ts-node --transpile-only prisma/backfill-item-categories.ts
 *
 *   # Also re-point rows whose stored category no longer matches the map.
 *   # Needed whenever a criterion moves between committees, since the committee
 *   # routing reads the stored column rather than re-deriving it per request.
 *   cd apps/api && pnpm exec ts-node --transpile-only prisma/backfill-item-categories.ts --resync
 *
 * Add --dry-run to either mode to report what would change without writing.
 *
 * Run AFTER `prisma db push` has added the category column.
 */
import { AppraisalCategory, PrismaClient } from "@prisma/client";
import { ALL_CATEGORIES, categoryForKey } from "../src/lib/appraisalCategories";

const prisma = new PrismaClient();
const resync = process.argv.includes("--resync");
const dryRun = process.argv.includes("--dry-run");

async function main() {
  // Group the distinct keys actually present in the DB by their mapped
  // category, so the whole sync is three UPDATEs rather than one per row.
  const distinctKeys = await prisma.appraisalItem.findMany({
    distinct: ["key"],
    select: { key: true },
  });

  const keysByCategory = new Map<AppraisalCategory, string[]>(
    ALL_CATEGORIES.map((category) => [category, [] as string[]]),
  );
  const unmapped: string[] = [];

  for (const { key } of distinctKeys) {
    const category = categoryForKey(key);
    if (!category) {
      unmapped.push(key);
      continue;
    }
    keysByCategory.get(category)!.push(key);
  }

  if (unmapped.length > 0) {
    console.warn(
      `! no mapping for key(s): ${unmapped.join(", ")} — left untouched`,
    );
  }

  console.log(
    resync
      ? "Mode: --resync (re-points rows whose category disagrees with the map)"
      : "Mode: fill-only (rows where category IS NULL)",
  );
  if (dryRun) {
    console.log("Mode: --dry-run (no writes)");
  }

  let updated = 0;
  for (const category of ALL_CATEGORIES) {
    const keys = keysByCategory.get(category)!;
    if (keys.length === 0) {
      continue;
    }

    const where = {
      key: { in: keys },
      ...(resync ? { NOT: { category } } : { category: null }),
    };

    if (dryRun) {
      // Report the per-key breakdown so a mapping change is reviewable before
      // it is applied.
      const affected = await prisma.appraisalItem.groupBy({
        by: ["key", "category"],
        where,
        _count: { _all: true },
      });

      for (const row of affected) {
        console.log(
          `  ${row.key}: ${row._count._all} item(s) ${row.category ?? "NULL"} -> ${category}`,
        );
        updated += row._count._all;
      }
      continue;
    }

    const result = await prisma.appraisalItem.updateMany({ where, data: { category } });

    if (result.count > 0) {
      console.log(`  ${category}: ${result.count} item(s) updated`);
    }
    updated += result.count;
  }

  console.log(
    dryRun
      ? `Dry run: ${updated} item(s) would be updated, ${unmapped.length} key(s) skipped.`
      : `Sync complete: ${updated} item(s) updated, ${unmapped.length} key(s) skipped.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
