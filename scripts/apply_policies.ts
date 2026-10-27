import "dotenv/config";
import { Pool } from "pg";
import { applyPolicies, rlsState } from "../src/server/db/policies";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    for (const file of await applyPolicies(client)) console.log(`applied ${file}`);

    const state = await rlsState(client);
    for (const r of state) console.log(`${r.table}: rls=${r.rlsOn} policies=${r.policies}`);

    const unprotected = state.filter((r) => !r.rlsOn || r.policies === 0).map((r) => r.table);
    if (unprotected.length > 0) {
      throw new Error(`tables without RLS or without a policy: ${unprotected.join(", ")}`);
    }
    console.log("OK");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exitCode = 1;
});
