import { createHash } from "node:crypto";
import { SYSTEM_ROLES, type SystemRole } from "@pms/authz";
import { Id, IdentityService, SystemClock } from "@pms/core";
import { DrizzleIdentityRepository, schema, withTenant, type Db } from "@pms/db";
import { argon2Hasher, createCrypto, totpVerifier, DEV_MASTER_KEY } from "@pms/runtime";

/**
 * Demo seed (spec 15 M0): two organizations, a group graph with a property in
 * two groups, one user per system role in org A, and an owner. Every password is
 * the same so local development and end-to-end tests can sign in as anyone.
 */
export const DEMO_PASSWORD = "demo-password-change-me";

export interface DemoSeed {
  orgA: { id: Id; slug: string; users: Record<SystemRole, { id: Id; email: string }> };
  orgB: { id: Id; slug: string; owner: { id: Id; email: string } };
}

export async function seedDemo(
  db: Db,
  opts: { masterKeyHex?: string; stamp?: string } = {},
): Promise<DemoSeed> {
  const stamp = opts.stamp ?? "";
  const crypto = createCrypto(opts.masterKeyHex ?? DEV_MASTER_KEY);
  const clock = new SystemClock();
  const svcFor = (tx: ConstructorParameters<typeof DrizzleIdentityRepository>[0]) =>
    new IdentityService({
      repo: new DrizzleIdentityRepository(tx),
      hasher: argon2Hasher,
      totp: totpVerifier,
      crypto,
      mailer: { send: async () => {} },
      clock,
    });

  const orgA = Id.next();
  const orgB = Id.next();
  const users = {} as DemoSeed["orgA"]["users"];

  await withTenant(db, { orgId: orgA, actor: { type: "system", id: "seed" } }, async (tx) => {
    const svc = svcFor(tx);
    const owner = await svc.signUp({
      orgId: orgA,
      email: `org_owner${stamp}@coastal.example`,
      password: DEMO_PASSWORD,
      name: "Ana Owner",
      deviceFingerprint: "seed",
      organization: {
        name: "Coastal Stays",
        slug: `coastal${stamp}`,
        country: "PT",
        defaultCurrency: "EUR",
      },
    });
    if (!owner.ok) throw new Error(owner.error.message);
    users.org_owner = { id: owner.value.user.id, email: owner.value.user.email };

    const lisbon = Id.next();
    const algarve = Id.next();
    const silva = Id.next();
    await tx.insert(schema.propertyGroup).values([
      { id: lisbon, orgId: orgA, name: "Lisbon", kind: "city" },
      { id: algarve, orgId: orgA, name: "Algarve", kind: "city" },
      { id: silva, orgId: orgA, name: "Silva family", kind: "owner" },
    ]);
    const alfama = Id.next();
    const chiado = Id.next();
    const lagos = Id.next();
    await tx.insert(schema.property).values([
      {
        id: alfama,
        orgId: orgA,
        kind: "single_unit",
        title: "Alfama 2B",
        currency: "EUR",
        timezone: "Europe/Lisbon",
        state: "draft",
      },
      {
        id: chiado,
        orgId: orgA,
        kind: "single_unit",
        title: "Chiado Loft",
        currency: "EUR",
        timezone: "Europe/Lisbon",
        state: "draft",
      },
      {
        id: lagos,
        orgId: orgA,
        kind: "multi_unit",
        title: "Lagos Villa",
        currency: "EUR",
        timezone: "Europe/Lisbon",
        state: "draft",
      },
    ]);
    await tx.insert(schema.propertyGroupMembership).values([
      { orgId: orgA, groupId: lisbon, propertyId: alfama },
      { orgId: orgA, groupId: lisbon, propertyId: chiado },
      { orgId: orgA, groupId: algarve, propertyId: lagos },
      { orgId: orgA, groupId: silva, propertyId: alfama },
      { orgId: orgA, groupId: silva, propertyId: lagos },
    ]);

    for (const role of SYSTEM_ROLES) {
      if (role === "org_owner") continue;
      const scope =
        role === "owner"
          ? { scopeType: "group" as const, scopeId: silva }
          : role === "cleaner" || role === "property_manager"
            ? { scopeType: "group" as const, scopeId: lisbon }
            : { scopeType: "organization" as const, scopeId: orgA };
      const inv = await svc.invite({
        orgId: orgA,
        email: `${role}${stamp}@coastal.example`,
        invitedBy: users.org_owner.id,
        locale: "en",
        orgName: "Coastal Stays",
        grant: { roleKey: role, customRoleId: null, overrides: null, expiresAt: null, ...scope },
      });
      if (!inv.ok) throw new Error(inv.error.message);
      const acc = await svc.acceptInvitation(inv.value.token, {
        name: role.replace("_", " "),
        password: DEMO_PASSWORD,
        deviceFingerprint: "seed",
      });
      if (!acc.ok) throw new Error(acc.error.message);
      users[role] = { id: acc.value.user.id, email: acc.value.user.email };
    }
  });

  const b = await withTenant(
    db,
    { orgId: orgB, actor: { type: "system", id: "seed" } },
    async (tx) => {
      const r = await svcFor(tx).signUp({
        orgId: orgB,
        email: `owner${stamp}@medina.example`,
        password: DEMO_PASSWORD,
        name: "Youssef",
        deviceFingerprint: "seed",
        organization: {
          name: "Medina Hosts",
          slug: `medina${stamp}`,
          country: "TN",
          defaultCurrency: "TND",
        },
      });
      if (!r.ok) throw new Error(r.error.message);
      return { id: r.value.user.id, email: r.value.user.email };
    },
  );

  return {
    orgA: { id: orgA, slug: `coastal${stamp}`, users },
    orgB: { id: orgB, slug: `medina${stamp}`, owner: b },
  };
}

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
