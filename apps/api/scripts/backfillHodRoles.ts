/**
 * One-time backfill for departments whose HOD was assigned through the
 * "Assign Existing User as HOD" / edit-department flows before those routes
 * synced the HOD UserRole row. Those users sit in Department.hodId but have no
 * HOD role, so every requireRoles("HOD") gate rejects them.
 *
 * Safe to re-run: it only adds the role where it is missing.
 *
 * Usage: npx tsx scripts/backfillHodRoles.ts [--apply]
 * Without --apply it prints what it would change and exits.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const departments = await prisma.department.findMany({
    where: { deletedAt: null, hodId: { not: null } },
    select: {
      id: true,
      name: true,
      hodId: true,
      hod: { select: { email: true, roles: { select: { role: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const missing = departments.filter(
    (d) => d.hod && !d.hod.roles.some((r) => r.role === "HOD"),
  );

  if (missing.length === 0) {
    console.log("All department HODs already hold the HOD role. Nothing to do.");
    return;
  }

  console.log(`${missing.length} department HOD(s) missing the HOD role:\n`);
  for (const d of missing) {
    const roles = d.hod!.roles.map((r) => r.role).join(",") || "NONE";
    console.log(`  ${d.name} -> ${d.hod!.email}  (current roles: ${roles})`);
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to grant the missing HOD roles.");
    return;
  }

  await prisma.$transaction(
    missing.map((d) =>
      prisma.userRole.create({ data: { userId: d.hodId!, role: "HOD" } }),
    ),
  );

  console.log(`\nGranted the HOD role to ${missing.length} user(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
