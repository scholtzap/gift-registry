import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";

const POLICIES_DIR = join(process.cwd(), "src", "server", "db", "policies");

export function policyFiles(): string[] {
  return readdirSync(POLICIES_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * RLS is applied, not migrated: Prisma cannot represent policies, and a policy that only
 * exists inside one machine's database is a privacy control that CI cannot check. Re-running
 * is safe — every file drops before it creates.
 *
 * The leak suite calls this too, which is the point: the same SQL the deploy runs is the SQL
 * the tests assert against.
 */
export async function applyPolicies(client: PoolClient): Promise<string[]> {
  const applied: string[] = [];
  for (const file of policyFiles()) {
    await client.query(readFileSync(join(POLICIES_DIR, file), "utf8"));
    applied.push(file);
  }
  return applied;
}

export interface RlsState {
  table: string;
  rlsOn: boolean;
  policies: number;
}

export async function rlsState(client: PoolClient): Promise<RlsState[]> {
  const { rows } = await client.query(`
    SELECT t.relname AS "table", t.relrowsecurity AS "rlsOn", COUNT(p.oid)::int AS policies
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_policy p ON p.polrelid = t.oid
    -- Prisma's own bookkeeping table is not app data and carries no rows a role may read.
    WHERE n.nspname = 'public' AND t.relkind = 'r' AND t.relname <> '_prisma_migrations'
    GROUP BY t.relname, t.relrowsecurity
    ORDER BY t.relname`);
  return rows as RlsState[];
}
