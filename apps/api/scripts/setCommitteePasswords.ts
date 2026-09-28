import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleName } from "@prisma/client";

const prisma = new PrismaClient();

const PASSWORD = process.env.COMMITTEE_PASS || "Test@1234";

const ACCOUNTS: Array<{
  email: string;
  role: RoleName;
  firstName: string;
  lastName: string;
}> = [
  {
    email: "acad@svgoi.local",
    role: "COMMITTEE_ACADEMIC",
    firstName: "Academic",
    lastName: "Committee",
  },
  {
    email: "research@svgoi.local",
    role: "COMMITTEE_RESEARCH",
    firstName: "Research",
    lastName: "Committee",
  },
  {
    email: "other@svgoi.local",
    role: "COMMITTEE_OTHER",
    firstName: "Others",
    lastName: "Committee",
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (const account of ACCOUNTS) {
    const email = account.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });

    const user = await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        mustChangePassword: false,
        deletedAt: null,
      },
    }).catch(async () => {
      return prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: account.firstName,
          lastName: account.lastName,
          passwordChangedAt: new Date(),
        },
      });
    });

    // Role is idempotent — only add it when the user isn't already carrying it.
    const hasRole = await prisma.userRole.findFirst({
      where: { userId: user.id, role: account.role },
    });
    if (!hasRole) {
      await prisma.userRole.create({
        data: { userId: user.id, role: account.role },
      });
    }

    // A password change invalidates live sessions, same as auth's reset flow.
    const revoked = await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    console.log(
      `${existing ? "updated" : "created"}  ${email}  role=${account.role}` +
        `${hasRole ? "" : " (role added)"}` +
        `${revoked.count ? `  sessions revoked=${revoked.count}` : ""}`,
    );
  }

  console.log(`\nPassword set to: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
