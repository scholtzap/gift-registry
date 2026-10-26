import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { applyPolicies } from '../../src/server/db/policies';

/**
 * Brings the *test* database to the state production will be in: migrations applied, then
 * the same policy SQL the deploy runs. Nothing here reads or writes the dev database.
 *
 * `LEAK_SKIP_POLICIES=1` stops before the policies. That is not a shortcut for lazy runs —
 * it is how the suite proves it can fail. A privacy test that was never seen red is
 * indistinguishable from a test that asserts nothing.
 */
export default async function globalSetup() {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) throw new Error('DATABASE_URL_TEST is not set (see .env.example)');

  const parsed = new URL(testUrl);
  const dbName = decodeURIComponent(parsed.pathname.slice(1));
  // Interpolated into DDL below, so it is validated rather than quoted-and-hoped.
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(dbName)) throw new Error(`unsafe test database name: ${dbName}`);

  parsed.pathname = '/postgres';
  const admin = new Pool({ connectionString: parsed.toString(), max: 1 });
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rows.length === 0) await admin.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await admin.end();
  }

  const prismaCli = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
  const env = { ...process.env, DATABASE_URL: testUrl };
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { env, cwd: process.cwd(), stdio: 'pipe' });

  if (process.env.LEAK_SKIP_POLICIES === '1') {
    // Dropping, not skipping: the test DB is persistent, and RLS enabled with no policies denies everything, which reads green.
    const pool = new Pool({ connectionString: testUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query(`
        DO $sweep$
        DECLARE r record;
        BEGIN
          FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
          END LOOP;
          FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity LOOP
            EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
          END LOOP;
        END $sweep$;
      `);
      console.log('leak suite: policies DROPPED (LEAK_SKIP_POLICIES=1) — expect red');
    } finally {
      client.release();
      await pool.end();
    }
    return;
  }

  const pool = new Pool({ connectionString: testUrl, max: 1 });
  const client = await pool.connect();
  try {
    await applyPolicies(client);
  } finally {
    client.release();
    await pool.end();
  }
}
