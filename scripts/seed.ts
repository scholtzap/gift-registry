import "dotenv/config";
import { createDb } from "../src/server/db/client";
import { keyedHash } from "../src/server/auth/phone-hash";
import { env } from "../src/lib/env";

/**
 * The demo cast. Names are invented and there are **no phone numbers**: this repo is public,
 * the seed file is the one thing a judge will run, and a fixture number is one keystroke from
 * a real subscriber. Identity comes from BSUID, which the schema accepts on its own.
 *
 * Mirrors the beats in `docs/operations/demo-script-and-recording-checklist.md`, so the
 * recording shows data the same script produced. Money is ZAR cents — R2 400 is 240000.
 */

const PEPPER = env.SESSION_SECRET;

const CAST = {
  nadia: { name: "Nadia Petersen", bsuid: "AAseednadia000000000000000000001" },
  thabo: { name: "Thabo Mokoena", bsuid: "AAseedthabo0000000000000000000001" },
  lerato: { name: "Lerato Dube", bsuid: "AAseedlerato0000000000000000000001" },
  sibusiso: { name: "Sibusiso Khumalo", bsuid: "AAseedsibusiso00000000000000000001" },
} as const;

async function main() {
  const db = createDb(env.DATABASE_URL);
  try {
    // `plan: "internal"` on both verbs: the demo cast and the recording must never hit a tier
    // wall, and a dev database seeded before the entitlements table existed still needs it.
    const upsert = (p: { name: string; bsuid: string }) =>
      db.prisma.user.upsert({
        where: { bsuid: p.bsuid },
        create: { bsuid: p.bsuid, displayName: p.name, plan: "internal" },
        update: { plan: "internal" },
      });

    const nadia = await upsert(CAST.nadia);
    const thabo = await upsert(CAST.thabo);
    const lerato = await upsert(CAST.lerato);
    const sibusiso = await upsert(CAST.sibusiso);

    const slug = "nadia-30th";
    const existing = await db.prisma.circle.findUnique({ where: { shareSlug: slug } });
    if (existing) {
      console.log(`circle ${slug} already seeded (${existing.id}) — nothing changed`);
      return;
    }

    const circle = await db.prisma.circle.create({
      data: {
        name: "Nadia's 30th",
        occasion: "birthday",
        eventDate: new Date("2026-12-05T00:00:00.000Z"),
        ownerUserId: nadia.id,
        shareSlug: slug,
        memberships: {
          create: [
            { userId: nadia.id, role: "owner" },
            { userId: thabo.id, role: "friend" },
            { userId: lerato.id, role: "friend" },
            { userId: sibusiso.id, role: "friend" },
          ],
        },
        allowlist: {
          create: [CAST.thabo, CAST.lerato, CAST.sibusiso].map((p) => ({
            // The real gate hashes a normalised E.164; this seed has no phone numbers, so the
            // keyed value is the BSUID. Same column shape, nothing that could be a subscriber.
            phoneE164Hash: keyedHash(p.bsuid, PEPPER),
            addedBy: nadia.id,
            status: "accepted" as const,
          })),
        },
      },
    });

    await db.prisma.attribute.createMany({
      data: [
        { userId: nadia.id, kind: "shoe_size", valueText: "UK 6", unit: "shoe", visibility: "friends" },
        { userId: nadia.id, kind: "ring_size", valueText: "N58", unit: "ring", visibility: "friends" },
        { userId: nadia.id, kind: "top", valueText: "M", unit: "clothing", visibility: "friends" },
        { userId: nadia.id, kind: "colour", valueText: "burnt orange", visibility: "friends" },
        { userId: nadia.id, kind: "other", valueText: "copper-pan curry, medium chilli", visibility: "private" },
      ],
    });

    const trailRunners = await db.prisma.item.create({
      data: {
        circle: { connect: { id: circle.id } },
        addedBy: { connect: { id: nadia.id } },
        title: "trail runners, burnt orange",
        retailer: "SuperSport",
        priceMinor: 189900,
        visibility: "owner_visible",
        confirmed: true,
      },
    });

    await db.prisma.item.create({
      data: {
        circle: { connect: { id: circle.id } },
        addedBy: { connect: { id: thabo.id } },
        title: "same shoe, R3 400 cheaper in sale",
        retailer: "Webfarms",
        priceMinor: 155900,
        visibility: "friend_only",
      },
    });

    // The pooled item: R2 400 behind Thabo as the single buyer, Lerato and Sibusiso contributing.
    const grinder = await db.prisma.item.create({
      data: {
        circle: { connect: { id: circle.id } },
        addedBy: { connect: { id: nadia.id } },
        title: "burr grinder",
        retailer: "Liqui-Glide",
        priceMinor: 240000,
        visibility: "owner_visible",
        confirmed: true,
      },
    });

    // The pool's status is derived from its contributions, not asserted next to them. A demo
    // pool that reads "funded" while the money behind it does not add up is exactly the false
    // success SPEC.md warns about, and this seed is the state the video is recorded from.
    const grinderTargetMinor = 240000;
    const grinderShares = [
      { userId: thabo.id, amountMinor: 90000 },
      { userId: lerato.id, amountMinor: 75000 },
      { userId: sibusiso.id, amountMinor: 75000 },
    ];
    const grinderSettled = grinderShares.reduce((sum, share) => sum + share.amountMinor, 0);

    await db.prisma.pool.create({
      data: {
        item: { connect: { id: grinder.id } },
        buyer: { connect: { id: thabo.id } },
        targetMinor: grinderTargetMinor,
        status: grinderSettled >= grinderTargetMinor ? "funded" : "open",
        claims: {
          create: grinderShares.map((share) => ({
            user: { connect: { id: share.userId } },
            item: { connect: { id: grinder.id } },
            kind: "pool_member" as const,
          })),
        },
        contributions: {
          create: grinderShares.map((share) => ({
            user: { connect: { id: share.userId } },
            amountMinor: share.amountMinor,
            status: "marked_paid" as const,
            paidAt: new Date(),
          })),
        },
      },
    });

    await db.prisma.claim.create({
      data: {
        item: { connect: { id: trailRunners.id } },
        user: { connect: { id: lerato.id } },
        kind: "solo",
      },
    });

    console.log(`seeded circle ${circle.id} slug ${slug} with 4 users, 3 items, 1 funded pool`);
    console.log("OK");
  } finally {
    await db.disconnect();
  }
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exitCode = 1;
});
