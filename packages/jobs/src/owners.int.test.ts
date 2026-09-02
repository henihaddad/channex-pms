import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  createProperty,
  FakeClock,
  FakePayoutProvider,
  Id,
  ingestProperty,
  type AgreementTerms,
  type Crypto,
} from "@pms/core";
import { FakeProvider } from "@pms/connectivity";
import { createTestDb } from "@pms/db/testing";
import {
  asSystem,
  BookingRepositoryPerCall,
  DrizzleOperationsRepository,
  DrizzleOwnerRepository,
  DrizzlePropertyRepository,
  rawRows,
  schema,
  sql,
  withoutTenant,
  withTenant,
  type DbHandle,
} from "@pms/db";
import { createLogger } from "@pms/runtime";
import {
  executePayout,
  generateDueStatements,
  generateStatement,
  initiatePayout,
  pollPayouts,
  sendStatement,
} from "./owners.js";
import { textPdf } from "./statement-pdf.js";

/**
 * M5 exit (spec 15, spec 17 §17.7): close a month. Agreement with a mid-month
 * version change, bookings across the month boundary, an approved expense with
 * markup, an owner stay; the draft regenerates byte-identical; approve → send
 * freezes it (INV-13); a cancellation after send restates on the next statement
 * (STMT-4); a payout above the threshold needs a second person (PAY-1) and the
 * fake provider settles it (PAY-2); no night is ever billed twice; RBAC-9: a
 * second owner cannot see the first owner's statement through the portal reads.
 */
let handle: DbHandle;
const ORG = Id.next();
const FINANCE = Id.next();
const FINANCE2 = Id.next();
const log = createLogger({ level: "silent", service: "test" });
const clock = new FakeClock("2026-05-03T09:00:00Z");
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const fake = new FakeProvider({ seed: 5, rules: [] });
fake.nowSource = () => clock.now().toString();
const payouts = new FakePayoutProvider();
const mails: Array<{ to: string; template: string }> = [];
const deps = {
  clock,
  crypto,
  log,
  payouts,
  mailer: {
    send: async (m: { to: string; template: string }) => {
      mails.push(m);
    },
  },
};
let propertyId: string;
let roomTypeId: string;
let ratePlanId: string;
let unitId: string;
let ownerId: string;
let otherOwnerId: string;
let agreementKey: string;
const repo = <T>(fn: (r: DrizzleOwnerRepository) => Promise<T>) =>
  asSystem(handle.db, ORG, (tx) => fn(new DrizzleOwnerRepository(tx, ORG, crypto)));
const terms = (
  over: Partial<Omit<AgreementTerms, "id" | "version">> = {},
): Omit<AgreementTerms, "id" | "version"> & { createdBy: string } => ({
  ownerId,
  propertyId,
  unitIds: null,
  model: { kind: "commission_pct", rateBps: 2000 },
  commissionBasis: "net_of_ota_commission",
  deductibles: {
    maintenance: { kind: "marked_up", markupBps: 1000 },
    consumables: { kind: "absorbed" },
  },
  cleaningFees: { kind: "kept" },
  ownerStays: { kind: "rate", nightlyMinor: 3000 },
  ownerStayAllowanceNights: 1,
  payout: { frequency: "monthly", dayOfMonth: 5, minimumMinor: 0, holdBackBps: 0 },
  vat: { onFee: false, rateBps: 0 },
  currency: "EUR",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  createdBy: FINANCE,
  ...over,
});
async function ingest(): Promise<void> {
  const r = new BookingRepositoryPerCall(handle.db, ORG, crypto);
  await ingestProperty({ provider: fake, repo: r, clock, orgId: ORG, log }, propertyId, {
    dedupeKey: `t:${String(clock.now().epochMilliseconds)}`,
    requestId: "t",
  });
}
const APRIL = { from: "2026-04-01", to: "2026-05-01" };
const MAY = { from: "2026-05-01", to: "2026-06-01" };

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, async (tx) => {
    await tx
      .insert(schema.organization)
      .values({ id: ORG, name: "O", slug: "o-own", country: "PT", defaultCurrency: "EUR" });
    await tx.insert(schema.user).values([
      { id: FINANCE, email: "fin@example.com", name: "Fin", passwordHash: "x", locale: "en" },
      { id: FINANCE2, email: "fin2@example.com", name: "Fin Two", passwordHash: "x", locale: "en" },
    ]);
  });
  const created = await withTenant(
    handle.db,
    { orgId: ORG, actor: { type: "system", id: "t" } },
    (tx) =>
      createProperty(
        {
          repo: new DrizzlePropertyRepository(tx, ORG),
          clock,
          orgId: ORG,
          horizonDays: 120,
          webhookCredentials: async () => ({ token: "tok-own", secretSealed: "s:x" }),
        },
        { title: "Douro Flat", kind: "single_unit", currency: "EUR", timezone: "Europe/Lisbon" },
      ),
  );
  if (!created.ok) throw created.error;
  propertyId = created.value.property.id;
  roomTypeId = created.value.roomTypes[0]!.id;
  ratePlanId = created.value.ratePlans[0]!.id;
  unitId = created.value.units[0]!.id;
  await asSystem(handle.db, ORG, (tx) =>
    tx.update(schema.property).set({ state: "live", channexPropertyId: propertyId }),
  );
  ownerId = (
    await repo((r) =>
      r.createOwner({
        type: "individual",
        name: "Rui Owner",
        email: "rui@example.com",
        phone: null,
        address: {},
        taxId: "PT123",
        locale: "pt",
        notes: null,
      }),
    )
  ).id;
  otherOwnerId = (
    await repo((r) =>
      r.createOwner({
        type: "company",
        name: "Other Co",
        email: null,
        phone: null,
        address: {},
        taxId: null,
        locale: "en",
        notes: null,
      }),
    )
  ).id;
});
afterAll(() => handle.close());

describe("closing April for one owner", () => {
  it("agreements version without overlapping (AGR-1, INV-12); bank details are sealed and masked (PAY-1)", async () => {
    const v1 = await repo((r) => r.saveAgreement(terms()));
    agreementKey = v1.agreementKey;
    // v2 from mid-April: 25 % on gross
    const v2 = await repo((r) =>
      r.saveAgreement({
        ...terms({
          model: { kind: "commission_pct", rateBps: 2500 },
          commissionBasis: "gross",
          effectiveFrom: "2026-04-16",
        }),
        agreementKey,
      }),
    );
    expect(v2.version).toBe(2);
    const versions = await repo((r) => r.segmentsFor(agreementKey, APRIL));
    expect(versions.map((v) => [v.version, v.effectiveFrom, v.effectiveTo])).toEqual([
      [1, "2026-01-01", "2026-04-16"],
      [2, "2026-04-16", null],
    ]);
    const chain = (e: unknown): string => {
      let out = "";
      let cur: unknown = e;
      for (let i = 0; i < 5 && cur instanceof Error; i++) {
        out += ` ${cur.message}`;
        cur = cur.cause;
      }
      return out;
    };
    const overlap = await repo((r) =>
      r.saveAgreement(terms({ ownerId: otherOwnerId, effectiveFrom: "2026-03-01" })),
    ).catch((e: unknown) => e);
    expect(chain(overlap)).toMatch(/INV-12|overlaps/);
    await repo((r) => r.setPayoutDetails(ownerId, "PT50 0002 0123 1234 5678 9015 4"));
    const o = (await repo((r) => r.owner(ownerId)))!;
    expect(o.payoutDetailsMasked).toBe("••••0154");
    expect(o.payoutDetailsMasked).not.toContain("0002");
  });

  it("bookings across the boundary, an expense with markup, an owner stay: the draft is explained line by line and regenerates byte-identical (STMT-1..3, OWN-1)", async () => {
    // 3 nights spanning March→April, 2 nights mid-April, 2 nights at the end of April
    fake.emitBooking({
      propertyId,
      roomTypeId,
      ratePlanId,
      arrivalDate: "2026-03-30",
      departureDate: "2026-04-02",
      days: { "2026-03-30": 10000, "2026-03-31": 10000, "2026-04-01": 12000 },
    });
    fake.emitBooking({
      propertyId,
      roomTypeId,
      ratePlanId,
      arrivalDate: "2026-04-10",
      departureDate: "2026-04-12",
      days: { "2026-04-10": 15000, "2026-04-11": 15000 },
    });
    fake.emitBooking({
      propertyId,
      roomTypeId,
      ratePlanId,
      arrivalDate: "2026-04-28",
      departureDate: "2026-04-30",
      days: { "2026-04-28": 20000, "2026-04-29": 20000 },
    });
    await ingest();
    await asSystem(handle.db, ORG, (tx) =>
      tx.execute(sql`update booking set ota_commission_minor = round(total_amount_minor * 0.15)`),
    );
    const expenseId = await repo((r) =>
      r.createExpense({
        propertyId,
        unitId: null,
        date: "2026-04-15",
        category: "maintenance",
        vendor: "Gas Co",
        description: "Boiler service",
        amountMinor: 8000,
        currency: "EUR",
        receiptRef: "data:image/jpeg;name=r.jpg",
        rebillable: true,
        rebillReason: null,
        submittedBy: FINANCE,
      }),
    );
    await repo((r) =>
      r.createExpense({
        propertyId,
        unitId: null,
        date: "2026-04-16",
        category: "consumables",
        vendor: null,
        description: "Soap",
        amountMinor: 900,
        currency: "EUR",
        receiptRef: null,
        rebillable: true,
        rebillReason: null,
        submittedBy: FINANCE,
      }),
    );
    // EXP-1: not on a statement until approved; four-eyes refuses the submitter
    await expect(repo((r) => r.approveExpense(expenseId, FINANCE, true))).rejects.toThrow(
      /four-eyes/,
    );
    await repo((r) => r.approveExpense(expenseId, FINANCE2, true));
    await asSystem(handle.db, ORG, (tx) =>
      new DrizzleOperationsRepository(tx, ORG).insertBlock({
        id: Id.next(),
        propertyId,
        roomTypeId,
        unitId,
        dateFrom: "2026-04-20",
        dateTo: "2026-04-22",
        reason: "owner_stay",
        reducesAvailability: true,
        ownerId,
        createdBy: FINANCE,
      }),
    );
    const first = await generateStatement({ db: handle.db, ...deps }, ORG, agreementKey, APRIL);
    const st = (await repo((r) => r.statement(first!.id)))!;
    const revenue = st.lines.filter((l) => l.kind === "booking_revenue");
    expect(revenue.map((l) => l.date)).toEqual([
      "2026-04-01",
      "2026-04-10",
      "2026-04-11",
      "2026-04-28",
      "2026-04-29",
    ]);
    expect(st.totals.grossRevenue).toBe(12000 + 30000 + 40000);
    // v1 governs 04-01..04-15 (net of commission, 20 %), v2 governs 04-16..04-30 (gross, 25 %)
    const fees = st.lines.filter((l) => l.kind === "management_fee");
    expect(fees.map((f) => f.agreementVersion)).toEqual([1, 2]);
    expect(fees[1]!.amountMinor).toBe(-10000);
    expect(st.lines.filter((l) => l.kind === "expense").map((l) => l.amountMinor)).toEqual([-8000]);
    expect(st.lines.filter((l) => l.kind === "expense_markup").map((l) => l.amountMinor)).toEqual([
      -800,
    ]);
    expect(st.lines.filter((l) => l.kind === "owner_stay").map((l) => l.amountMinor)).toEqual([
      0, -3000,
    ]);
    expect(
      st.lines.every(
        (l) =>
          l.bookingId || l.expenseId || l.blockId || l.adjustmentId || l.kind === "management_fee",
      ),
    ).toBe(true);
    expect(st.anomalies.some((a) => a.includes("receipt") || a.includes("estimated"))).toBe(false);
    // byte-identical regeneration
    const second = await generateStatement({ db: handle.db, ...deps }, ORG, agreementKey, APRIL);
    expect(second!.id).toBe(first!.id);
    expect(second!.changed).toBe(false);
    const again = (await repo((r) => r.statement(first!.id)))!;
    expect(JSON.stringify(again.lines.map((l) => [l.seq, l.kind, l.date, l.amountMinor]))).toBe(
      JSON.stringify(st.lines.map((l) => [l.seq, l.kind, l.date, l.amountMinor])),
    );
    expect(again.inputHash).toBe(st.inputHash);
    // the PDF is deterministic too
    const a = textPdf(["a", "b"], { title: "t" });
    const b = textPdf(["a", "b"], { title: "t" });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).toString("latin1")).toMatch(/^%PDF-1\.4/);
  });

  it("approve → send freezes the statement (INV-13) and mails the owner; the sweep drafts the same period once", async () => {
    const [st] = await repo((r) => r.statements({ agreementKey }));
    await repo((r) => r.approve(st!.id, FINANCE));
    const sent = await sendStatement({ db: handle.db, ...deps }, ORG, st!.id);
    expect(sent.mailedTo).toBe("rui@example.com");
    expect(sent.pdfBytes).toBeGreaterThan(500);
    const frozen = (await repo((r) => r.statement(st!.id)))!;
    expect(frozen.state).toBe("sent");
    expect(frozen.pdfRef).toMatch(/^data:application\/pdf;base64,/);
    await expect(
      asSystem(handle.db, ORG, (tx) =>
        tx.execute(
          sql`update owner_statement_line set amount_minor = 1 where statement_id = ${st!.id}`,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asSystem(handle.db, ORG, (tx) =>
        tx.execute(sql`update owner_statement set totals = '{}'::jsonb where id = ${st!.id}`),
      ),
    ).rejects.toThrow();
    await expect(
      generateStatement({ db: handle.db, ...deps }, ORG, agreementKey, APRIL),
    ).rejects.toThrow(/INV-13/);
    // the daily sweep (today 2026-05-03 → April) leaves the sent statement alone
    const sweep = await generateDueStatements({ db: handle.db, ...deps }, ORG);
    expect(sweep).toEqual({ generated: 0, refreshed: 0 });
  });

  it("a cancellation after send restates on the next statement with a link to the origin (STMT-4, OWN-2); nights are never billed twice", async () => {
    const cancelled = fake.ledger.emitted[1]!; // the 04-10..04-12 booking
    fake.cancelBooking(cancelled.bookingId);
    clock.set("2026-06-02T09:00:00Z");
    await ingest();
    const may = await generateStatement({ db: handle.db, ...deps }, ORG, agreementKey, MAY);
    const st = (await repo((r) => r.statement(may!.id)))!;
    const adj = st.lines.filter((l) => l.kind === "adjustment");
    expect(adj.map((l) => l.amountMinor)).toEqual([-15000, -15000]);
    expect(adj[0]!.basis.originStatementId).toBeDefined();
    expect(adj[0]!.bookingId).toBe(
      (
        await asSystem(handle.db, ORG, (tx) =>
          rawRows<{ id: string }>(
            tx,
            sql`select id from booking where channex_booking_id = ${cancelled.bookingId}`,
          ),
        )
      )[0]!.id,
    );
    expect(st.lines.filter((l) => l.kind === "booking_revenue")).toHaveLength(0);
    // the same night can never land on two live statements
    const [aprilSt] = await repo((r) => r.statements({ agreementKey, before: "2026-05-01" }));
    await expect(
      asSystem(handle.db, ORG, (tx) =>
        tx.execute(sql`insert into owner_statement_night (org_id, statement_id, booking_room_id, booking_id, date, amount_minor)
          select org_id, ${may!.id}, booking_room_id, booking_id, date, amount_minor from owner_statement_night where statement_id = ${aprilSt!.id} limit 1`),
      ),
    ).rejects.toThrow();
    // regenerating May applies the restatement once
    const again = await generateStatement({ db: handle.db, ...deps }, ORG, agreementKey, MAY);
    expect(
      (await repo((r) => r.statement(again!.id)))!.lines.filter((l) => l.kind === "adjustment"),
    ).toHaveLength(2);
  });

  it("payouts: four-eyes above the threshold, provider execution and settlement (PAY-1..3)", async () => {
    const [april] = await repo((r) => r.statements({ agreementKey, before: "2026-05-01" }));
    expect(april!.state).toBe("sent");
    await asSystem(handle.db, ORG, (tx) =>
      tx.execute(
        sql`update organization set settings = settings || '{"payout_four_eyes_minor": 10000}'::jsonb where id = ${ORG}`,
      ),
    );
    const p = await asSystem(handle.db, ORG, (tx) =>
      initiatePayout(tx, ORG, crypto, {
        statementId: april!.id,
        method: "provider",
        initiatedBy: FINANCE,
        reference: null,
        providerKind: "fake",
      }),
    );
    expect(p.awaitingApproval).toBe(true);
    expect(p.amountMinor).toBe(Number(april!.totals.payable));
    await expect(repo((r) => r.approvePayout(p.payoutId, FINANCE))).rejects.toThrow(/four-eyes/);
    await repo((r) => r.approvePayout(p.payoutId, FINANCE2));
    const r1 = await executePayout({ db: handle.db, ...deps }, ORG, p.payoutId);
    expect(r1.state).toBe("in_transit");
    expect(payouts.transfers.get(r1.providerRef!)!.req.destinationRef).toContain("PT50");
    payouts.settle();
    expect(await pollPayouts({ db: handle.db, ...deps }, ORG)).toEqual({ paid: 1, failed: 0 });
    const paid = (await repo((r) => r.statement(april!.id)))!;
    expect(paid.state).toBe("paid");
    expect(paid.payouts[0]!.state).toBe("paid");
    // executing twice is idempotent at the provider
    expect(
      await executePayout({ db: handle.db, ...deps }, ORG, p.payoutId).catch(
        (e: Error) => e.message,
      ),
    ).toMatch(/payout is paid/);
  });

  it("RBAC-9 / OWN-3: portal reads are scoped to the owner; another owner sees nothing of theirs", async () => {
    const mine = await repo((r) => r.statements({ ownerId }));
    const theirs = await repo((r) => r.statements({ ownerId: otherOwnerId }));
    expect(mine.length).toBeGreaterThan(0);
    expect(theirs).toHaveLength(0);
    expect(
      await repo((r) => r.portalBookings(otherOwnerId, "2026-04-01", "2026-06-01")),
    ).toHaveLength(0);
    const bookings = await repo((r) => r.portalBookings(ownerId, "2026-04-01", "2026-06-01"));
    expect(bookings.length).toBeGreaterThan(0);
    // PORT-1: first name only, no email, no totals
    expect(Object.keys(bookings[0]!)).not.toContain("email");
    expect(Object.keys(bookings[0]!)).not.toContain("totalMinor");
    const dash = await repo((r) => r.portalDashboard(ownerId, "2026-04-01", "2026-05-01"));
    expect(dash.nightsSold).toBe(3);
  });
});
