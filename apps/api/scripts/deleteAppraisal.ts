import { prisma } from "../src/lib/prisma";

// Match by first/last name fragments, case-insensitive.
const TARGET_NAMES = ["priyanka sood", "komalpreet"];

// Set to false to actually delete after reviewing the dry-run output.
const DRY_RUN = process.argv.includes("--dry-run");

async function deleteAppraisalsForNames() {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const matches = users.filter((u) => {
      const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
      return TARGET_NAMES.some((name) => fullName.includes(name));
    });

    if (matches.length === 0) {
      console.log("No matching users found for:", TARGET_NAMES.join(", "));
      return;
    }

    for (const user of matches) {
      console.log(
        `\nFound user: ${user.firstName} ${user.lastName} (${user.email}, ID: ${user.id})`,
      );

      const appraisals = await prisma.appraisal.findMany({
        where: { userId: user.id },
        include: { cycle: { select: { name: true } } },
      });

      console.log(`  ${appraisals.length} appraisal(s):`);
      appraisals.forEach((a) => {
        console.log(
          `    - ${a.cycle?.name || "Unknown Cycle"} (ID: ${a.id}, Status: ${a.status})`,
        );
      });

      if (appraisals.length === 0) continue;

      if (DRY_RUN) {
        console.log("  (dry run — nothing deleted)");
        continue;
      }

      for (const appraisal of appraisals) {
        await prisma.appraisalItem.deleteMany({
          where: { appraisalId: appraisal.id },
        });
        await prisma.committeeAssignment.deleteMany({
          where: { appraisalId: appraisal.id },
        });
        await prisma.appraisal.delete({ where: { id: appraisal.id } });
        console.log(`  Deleted appraisal ${appraisal.id}`);
      }

      console.log(
        `  ✅ Deleted ${appraisals.length} appraisal(s) for ${user.firstName} ${user.lastName}`,
      );
    }
  } catch (error) {
    console.error("Error deleting appraisals:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAppraisalsForNames();
