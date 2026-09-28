import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getDbUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !process.env.VERCEL) return url;
  try {
    const parsed = new URL(url);
    // On Vercel serverless, Supabase requires the TRANSACTION-mode pooler
    // (port 6543). The session-mode pooler (5432) holds a connection for the
    // whole function lifetime and saturates under many ephemeral invocations —
    // the prime suspect for the ~20s stalls. Warn loudly if misconfigured.
    if (
      parsed.hostname.includes("pooler.supabase.com") &&
      parsed.port === "5432"
    ) {
      console.warn(
        "[db-config] WARNING: DATABASE_URL uses the Supabase SESSION pooler (port 5432) on serverless. " +
          "Switch to the TRANSACTION pooler (port 6543, ?pgbouncer=true&connection_limit=1) and keep DIRECT_URL on 5432 for migrations.",
      );
    }
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '1');
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '10');
    }
    if (!parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ['error', 'warn'], datasourceUrl: getDbUrl() });

// DB timing instrumentation (Task 3 profiling). A query's measured duration
// INCLUDES time spent waiting to check out a connection from the pool, so a
// slow query here with a fast SQL statement is the fingerprint of pool/pooler
// saturation (the prime suspect for the ~20s prod stall). Slow queries are
// logged with model+action so the bottleneck is attributable. Set
// REQUEST_TIMING=off to silence.
if (!globalForPrisma.prisma) {
  const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS || 1000);
  prisma.$use(async (params, next) => {
    if (process.env.REQUEST_TIMING === 'off') return next(params);
    const startedAt = Date.now();
    try {
      return await next(params);
    } finally {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= SLOW_QUERY_MS) {
        console.log(
          `[db-timing] SLOW ${params.model ?? 'raw'}.${params.action} ${elapsedMs}ms`,
        );
      }
    }
  });
}

globalForPrisma.prisma = prisma;
