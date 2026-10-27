import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function privateDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) {
    throw new Error('unsafe_output_directory');
  }
}

async function main(): Promise<void> {
  const [circleId, userId, ...extra] = process.argv.slice(2);
  if (!circleId || !userId || extra.length || !UUID.test(circleId) || !UUID.test(userId)) {
    throw new Error('usage: issue-owner-session.ts <circle-uuid> <owner-user-uuid>');
  }
  // POSIX modes do not enforce Windows ACLs. Refuse rather than create a readable credential.
  if (process.platform === 'win32' || !process.getuid || process.env.NODE_ENV !== 'production') {
    throw new Error('requires_posix_and_production_environment');
  }
  const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
  const scratch = join(root, '.scratch');
  const directory = join(scratch, 'owner-sessions');
  const output = join(directory, `${randomUUID()}.cookie`);
  execFileSync('git', ['-C', root, 'check-ignore', '--quiet', '--', output], { stdio: 'ignore' });
  await privateDirectory(scratch);
  await privateDirectory(directory);

  // Lazy imports keep environment/DB errors inside the redacted boundary.
  const { env } = await import('../../src/lib/env');
  const origin = new URL(env.CIRCLE_BASE_URL);
  if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('requires_https_origin');
  const { createDb } = await import('../../src/server/db/client');
  const { issueSession, readSession, sessionCookie } = await import('../../src/server/auth/session');
  const db = createDb(env.DATABASE_URL);
  try {
    const verified = await db.withActor({ role: 'owner', userId, circleId }, async (tx) => {
      const circle = await tx.circle.findUnique({ where: { id: circleId }, select: { id: true, ownerUserId: true } });
      const membership = await tx.membership.findUnique({
        where: { circleId_userId: { circleId, userId } },
        select: { role: true, status: true },
      });
      return circle?.ownerUserId.toLowerCase() === userId.toLowerCase()
        && membership?.role === 'owner' && membership.status === 'active';
    });
    if (!verified) throw new Error('owner_verification_failed');
    const token = issueSession({ userId, circleId, role: 'owner' });
    const session = readSession(token);
    if (!session) throw new Error('session_verification_failed');
    const file = await open(output, 'wx', 0o600);
    try {
      await file.writeFile(`Set-Cookie: ${sessionCookie(token, session.expiresAt)}\n`, 'utf8');
      await file.sync();
    } catch (error) {
      await unlink(output);
      throw error;
    } finally {
      await file.close();
    }
  } finally {
    await db.disconnect();
  }
  // Never print the cookie, signing key, phone, BSUID, user ID, or DB URL.
  process.stdout.write(`${output}\n`);
}

main().catch(() => {
  process.stderr.write('ERROR: Owner session not issued. Requires two UUIDs, POSIX private ignored output, production HTTPS configuration, and verified active ownership.\n');
  process.exitCode = 1;
});
