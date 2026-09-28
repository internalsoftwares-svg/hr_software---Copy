import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  for (const email of [
    "acad@svgoi.local",
    "research@svgoi.local",
    "other@svgoi.local",
  ]) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });
    if (!user) {
      console.log(`${email}  MISSING`);
      continue;
    }
    const match = await bcrypt.compare("Test@1234", user.passwordHash);
    console.log(
      `${email}  match=${match}  locked=${user.lockedUntil ?? "no"}  ` +
        `mustChange=${user.mustChangePassword}  deleted=${user.deletedAt ?? "no"}  ` +
        `roles=${user.roles.map((r) => r.role).join(",")}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
