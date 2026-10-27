import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";

export type ActorRole = "owner" | "friend";
export type Tx = Prisma.TransactionClient;

/** The two NOLOGIN roles created by `src/server/db/policies/001_roles.sql`. */
const ROLE_NAMES: Record<ActorRole, "app_owned" | "app_friend"> = {
  owner: "app_owned",
  friend: "app_friend",
};

export interface Actor {
  role: ActorRole;
  userId: string;
  /** Null only during flows that have not resolved a circle yet (create, gate check). */
  circleId: string | null;
  /** Hashed E.164 of the caller's own phone; the allowlist gate matches on this. */
  phoneHash?: string;
}

export interface Db {
  prisma: PrismaClient;
  pool: Pool;
  advisoryPool: Pool;
  withActor: <T>(actor: Actor, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  disconnect: () => Promise<void>;
}

/**
 * Every read of friend-scoped data goes through `withActor`, so the role switch is not a
 * convention callers remember — it is the only door. The transaction is what makes it safe:
 * `SET LOCAL` reverts at commit or rollback, so a pooled connection can never be handed to
 * the next request still wearing the previous request's role.
 *
 * The role assertion is part of the primitive rather than a test detail. If `SET LOCAL ROLE`
 * silently no-oped, an owner request would run its queries as the table owner — which bypasses
 * RLS entirely — and every leak assertion downstream would pass for the wrong reason.
 */
export function createDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5_000 });
  // Session locks must not consume connections needed by their actor-query callbacks.
  const advisoryPool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000 });
  // The adapter's first argument is `pg.Pool | PoolConfig | string`. Passing `{ pool }` is
  // silently read as a PoolConfig with one unknown key, and connects to localhost:5432
  // instead of the database named by the URL.
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  async function withActor<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const roleName = ROLE_NAMES[actor.role];
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${roleName}`);
        await tx.$executeRaw`SELECT set_config('app.user_id', ${actor.userId}, true)`;
        if (actor.circleId !== null) {
          await tx.$executeRaw`SELECT set_config('app.circle_id', ${actor.circleId}, true)`;
        }
        if (actor.phoneHash !== undefined) {
          await tx.$executeRaw`SELECT set_config('app.phone_hash', ${actor.phoneHash}, true)`;
        }

        const roleRows = await tx.$queryRaw<{ currentRole: string }[]>`
          SELECT current_user::text AS "currentRole"`;
        const currentRole = roleRows[0]?.currentRole;
        if (currentRole !== roleName) {
          throw new Error(`role_switch_failed: expected ${roleName}, connected as ${String(currentRole)}`);
        }
        return fn(tx);
      },
      { timeout: 10_000 },
    );
  }

  return {
    prisma,
    pool,
    advisoryPool,
    withActor,
    disconnect: async () => {
      await prisma.$disconnect();
      await Promise.all([pool.end(), advisoryPool.end()]);
    },
  };
}

let appDb: Db | undefined;

export function getAppDb(): Db {
  appDb ??= createDb(env.DATABASE_URL);
  return appDb;
}
