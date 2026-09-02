import { and, eq, isNull, sql } from "drizzle-orm";
import {
  allocateOverNights,
  Id,
  providerCode,
  type AgreementTerms,
  type Crypto,
  type OwnerStayNight,
  type StatementExpense,
  type StatementNight,
  type StatementResult,
} from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

export interface OwnerRow {
  id: string;
  type: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: Record<string, string>;
  payoutDetailsMasked: string | null;
  userId: string | null;
  groupId: string | null;
  locale: string;
  notes: string | null;
  agreements: number;
  properties: string[];
}

export interface AgreementRow extends AgreementTerms {
  agreementKey: string;
  propertyTitle: string;
  ownerName: string;
  documentRef: string | null;
  createdAt: string;
}

export interface ExpenseRow {
  id: string;
  propertyId: string;
  propertyTitle: string;
  unitId: string | null;
  date: string;
  category: StatementExpense["category"];
  vendor: string | null;
  description: string;
  amountMinor: number;
  currency: string;
  receiptRef: string | null;
  rebillable: boolean;
  rebillReason: string | null;
  state: string;
  submittedBy: string | null;
  approvedBy: string | null;
  statementId: string | null;
  maintenanceIssueId: string | null;
}

export interface StatementRow {
  id: string;
  ownerId: string;
  ownerName: string;
  agreementKey: string;
  propertyId: string;
  propertyTitle: string;
  periodFrom: string;
  periodTo: string;
  state: string;
  disputeState: string;
  disputeThreadId: string | null;
  currency: string;
  totals: Record<string, number>;
  segments: unknown[];
  warnings: string[];
  anomalies: string[];
  inputHash: string;
  generatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  pdfRef: string | null;
  previousStatementId: string | null;
}

export interface StatementLineRow {
  id: string;
  seq: number;
  kind: string;
  date: string;
  description: string;
  amountMinor: number;
  agreementVersion: number;
  bookingId: string | null;
  expenseId: string | null;
  blockId: string | null;
  adjustmentId: string | null;
  basis: Record<string, unknown>;
}

export interface PayoutRow {
  id: string;
  statementId: string;
  ownerId: string;
  ownerName: string;
  amountMinor: number;
  currency: string;
  method: string;
  providerRef: string | null;
  state: string;
  initiatedBy: string | null;
  approvedBy: string | null;
  reference: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** A uuid[] literal: drivers do not encode JS arrays as Postgres arrays. */
const uuids = (ids: readonly string[]) =>
  ids.length === 0
    ? sql`array[]::uuid[]`
    : sql`array[${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]`;
const mask = (v: string): string => (v.length <= 4 ? "••••" : `••••${v.slice(-4)}`);
const num = (v: unknown): number => Number(v ?? 0);

/** Owners, agreements, expenses, statements and payouts (spec 17). Portal reads are scoped by the owner linked to the user (OWN-3). */
export class DrizzleOwnerRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
    private readonly crypto: Crypto,
  ) {}

  // ---- owners ---------------------------------------------------------------------------------

  async listOwners(): Promise<OwnerRow[]> {
    const rows = await rawRows<{
      id: string;
      type: string;
      name: string;
      email: string | null;
      phone: string | null;
      address: Record<string, string>;
      payout_details_masked: string | null;
      user_id: string | null;
      group_id: string | null;
      locale: string;
      notes: string | null;
      agreements: number;
      properties: string[] | null;
    }>(
      this.tx,
      sql`select o.id, o.type, o.name, o.email, o.phone, o.address, o.payout_details_masked, o.user_id, o.group_id, o.locale, o.notes,
            (select count(distinct a.agreement_key)::int from owner_agreement a where a.owner_id = o.id) as agreements,
            (select array_agg(distinct p.title) from owner_agreement a join property p on p.id = a.property_id where a.owner_id = o.id) as properties
          from owner o where o.org_id = ${this.orgId} and o.archived_at is null order by o.name`,
    );
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      email: r.email,
      phone: r.phone,
      address: r.address,
      payoutDetailsMasked: r.payout_details_masked,
      userId: r.user_id,
      groupId: r.group_id,
      locale: r.locale,
      notes: r.notes,
      agreements: r.agreements,
      properties: r.properties ?? [],
    }));
  }

  async owner(id: string): Promise<OwnerRow | null> {
    return (await this.listOwners()).find((o) => o.id === id) ?? null;
  }

  /** An owner and the owner-kind group that will scope their portal grant (spec 02 §2.1). */
  async createOwner(o: {
    type: "individual" | "company";
    name: string;
    email: string | null;
    phone: string | null;
    address: Record<string, string>;
    taxId: string | null;
    locale: string;
    notes: string | null;
  }): Promise<{ id: string; groupId: string }> {
    const id = Id.next();
    const groupId = Id.next();
    await this.tx
      .insert(s.propertyGroup)
      .values({ id: groupId, orgId: this.orgId, name: `Owner: ${o.name}`, kind: "owner" });
    await this.tx.insert(s.owner).values({
      id,
      orgId: this.orgId,
      type: o.type,
      name: o.name,
      email: o.email,
      phone: o.phone,
      address: o.address,
      taxIdEnc: o.taxId ? await this.crypto.seal(o.taxId) : null,
      groupId,
      locale: o.locale,
      notes: o.notes,
    });
    return { id, groupId };
  }

  async updateOwner(
    id: string,
    patch: Partial<{
      name: string;
      email: string | null;
      phone: string | null;
      locale: string;
      notes: string | null;
    }>,
  ): Promise<void> {
    await this.tx
      .update(s.owner)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(and(eq(s.owner.id, id), eq(s.owner.orgId, this.orgId)));
  }

  /** PAY-1: bank details are sealed and shown masked ever after. */
  async setPayoutDetails(id: string, plain: string): Promise<void> {
    await this.tx
      .update(s.owner)
      .set({
        payoutDetailsRef: await this.crypto.seal(plain),
        payoutDetailsMasked: mask(plain.replace(/\s+/g, "")),
        updatedAt: sql`now()`,
      })
      .where(and(eq(s.owner.id, id), eq(s.owner.orgId, this.orgId)));
  }

  async payoutDestination(ownerId: string): Promise<string | null> {
    const [r] = await this.tx
      .select({ ref: s.owner.payoutDetailsRef })
      .from(s.owner)
      .where(and(eq(s.owner.id, ownerId), eq(s.owner.orgId, this.orgId)));
    return r?.ref ? this.crypto.open(r.ref) : null;
  }

  async linkPortalUser(ownerId: string, userId: string): Promise<void> {
    await this.tx
      .update(s.owner)
      .set({ userId, updatedAt: sql`now()` })
      .where(and(eq(s.owner.id, ownerId), eq(s.owner.orgId, this.orgId)));
  }

  /** OWN-3: the portal sees the owner whose login this is, and nothing else. */
  async ownerForUser(userId: string): Promise<OwnerRow | null> {
    const [r] = await this.tx
      .select({ id: s.owner.id })
      .from(s.owner)
      .where(
        and(eq(s.owner.userId, userId), eq(s.owner.orgId, this.orgId), isNull(s.owner.archivedAt)),
      );
    return r ? this.owner(r.id) : null;
  }

  async addDocument(d: {
    ownerId: string;
    kind: string;
    filename: string;
    storageRef: string;
    expiresAt: string | null;
  }): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.ownerDocument).values({ id, orgId: this.orgId, ...d });
    return id;
  }

  async documents(ownerId: string): Promise<
    Array<{
      id: string;
      kind: string;
      filename: string;
      storageRef: string;
      expiresAt: string | null;
      expiringSoon: boolean;
    }>
  > {
    const rows = await this.tx
      .select()
      .from(s.ownerDocument)
      .where(and(eq(s.ownerDocument.ownerId, ownerId), eq(s.ownerDocument.orgId, this.orgId)))
      .orderBy(s.ownerDocument.createdAt);
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      filename: r.filename,
      storageRef: r.storageRef,
      expiresAt: r.expiresAt,
      expiringSoon: r.expiresAt !== null && r.expiresAt <= soon,
    }));
  }

  // ---- agreements (AGR-1..3, INV-12) ---------------------------------------------------------

  private toTerms(r: typeof s.ownerAgreement.$inferSelect): AgreementTerms {
    return {
      id: r.id,
      version: r.version,
      ownerId: r.ownerId,
      propertyId: r.propertyId,
      unitIds: r.unitIds ?? null,
      model: r.model as AgreementTerms["model"],
      commissionBasis: r.commissionBasis as AgreementTerms["commissionBasis"],
      deductibles: r.deductibles,
      cleaningFees: r.cleaningFees as AgreementTerms["cleaningFees"],
      ownerStays: r.ownerStays as AgreementTerms["ownerStays"],
      ownerStayAllowanceNights: r.ownerStayAllowanceNights,
      payout: r.payout as unknown as AgreementTerms["payout"],
      vat: r.vat as unknown as AgreementTerms["vat"],
      currency: r.currency,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    };
  }

  async listAgreements(
    filter: { ownerId?: string | null; propertyId?: string | null } = {},
  ): Promise<AgreementRow[]> {
    const conds = [eq(s.ownerAgreement.orgId, this.orgId)];
    if (filter.ownerId) conds.push(eq(s.ownerAgreement.ownerId, filter.ownerId));
    if (filter.propertyId) conds.push(eq(s.ownerAgreement.propertyId, filter.propertyId));
    const rows = await this.tx
      .select({ a: s.ownerAgreement, propertyTitle: s.property.title, ownerName: s.owner.name })
      .from(s.ownerAgreement)
      .innerJoin(s.property, eq(s.property.id, s.ownerAgreement.propertyId))
      .innerJoin(s.owner, eq(s.owner.id, s.ownerAgreement.ownerId))
      .where(and(...conds))
      .orderBy(s.ownerAgreement.propertyId, s.ownerAgreement.effectiveFrom);
    return rows.map((r) => ({
      ...this.toTerms(r.a),
      agreementKey: r.a.agreementKey,
      propertyTitle: r.propertyTitle,
      ownerName: r.ownerName,
      documentRef: r.a.documentRef,
      createdAt: r.a.createdAt,
    }));
  }

  /** The versions that touch a period, for one agreement key. */
  async segmentsFor(
    agreementKey: string,
    period: { from: string; to: string },
  ): Promise<AgreementTerms[]> {
    const rows = await this.tx
      .select()
      .from(s.ownerAgreement)
      .where(
        and(
          eq(s.ownerAgreement.orgId, this.orgId),
          eq(s.ownerAgreement.agreementKey, agreementKey),
        ),
      )
      .orderBy(s.ownerAgreement.version);
    return rows
      .filter(
        (r) =>
          r.effectiveFrom < period.to && (r.effectiveTo === null || r.effectiveTo > period.from),
      )
      .map((r) => this.toTerms(r));
  }

  /** Agreement keys with a version in force somewhere inside the period. */
  async agreementKeysActive(period: { from: string; to: string }): Promise<
    Array<{
      agreementKey: string;
      ownerId: string;
      propertyId: string;
      currency: string;
      frequency: "monthly" | "fortnightly";
    }>
  > {
    const rows = await rawRows<{
      agreement_key: string;
      owner_id: string;
      property_id: string;
      currency: string;
      payout: { frequency?: string };
    }>(
      this.tx,
      sql`select distinct on (agreement_key) agreement_key, owner_id, property_id, currency, payout from owner_agreement
          where org_id = ${this.orgId} and effective_from < ${period.to} and (effective_to is null or effective_to > ${period.from})
          order by agreement_key, version desc`,
    );
    return rows.map((r) => ({
      agreementKey: r.agreement_key,
      ownerId: r.owner_id,
      propertyId: r.property_id,
      currency: r.currency,
      frequency: r.payout.frequency === "fortnightly" ? "fortnightly" : "monthly",
    }));
  }

  /**
   * A new agreement (version 1) or a new version of an existing key: the previous
   * version closes on the new one's start (AGR-1). The trigger refuses overlaps (INV-12).
   */
  async saveAgreement(
    t: Omit<AgreementTerms, "id" | "version"> & {
      agreementKey?: string | null;
      documentRef?: string | null;
      createdBy: string;
    },
  ): Promise<{ id: string; agreementKey: string; version: number }> {
    const id = Id.next();
    let version = 1;
    const agreementKey = t.agreementKey ?? Id.next();
    if (t.agreementKey) {
      const [prev] = await rawRows<{ id: string; version: number }>(
        this.tx,
        sql`select id, version from owner_agreement where agreement_key = ${t.agreementKey} order by version desc limit 1`,
      );
      if (prev) {
        version = prev.version + 1;
        await this.tx.execute(
          sql`update owner_agreement set effective_to = ${t.effectiveFrom} where id = ${prev.id}`,
        );
      }
    }
    await this.tx.insert(s.ownerAgreement).values({
      id,
      orgId: this.orgId,
      agreementKey,
      version,
      ownerId: t.ownerId,
      propertyId: t.propertyId,
      unitIds: t.unitIds,
      model: t.model,
      commissionBasis: t.commissionBasis,
      deductibles: t.deductibles as Record<string, unknown>,
      cleaningFees: t.cleaningFees,
      ownerStays: t.ownerStays,
      ownerStayAllowanceNights: t.ownerStayAllowanceNights,
      payout: t.payout as unknown as Record<string, unknown>,
      vat: t.vat,
      currency: t.currency,
      effectiveFrom: t.effectiveFrom,
      effectiveTo: t.effectiveTo,
      documentRef: t.documentRef ?? null,
      createdBy: t.createdBy,
    });
    // the owner's group scopes the portal grant; units remember their agreement
    const [o] = await this.tx
      .select({ groupId: s.owner.groupId })
      .from(s.owner)
      .where(eq(s.owner.id, t.ownerId));
    if (o?.groupId)
      await this.tx
        .insert(s.propertyGroupMembership)
        .values({ orgId: this.orgId, groupId: o.groupId, propertyId: t.propertyId })
        .onConflictDoNothing();
    if (t.unitIds && t.unitIds.length)
      await this.tx.execute(
        sql`update unit set owner_agreement_id = ${agreementKey} where id = any(${uuids(t.unitIds)})`,
      );
    else
      await this.tx.execute(
        sql`update unit set owner_agreement_id = ${agreementKey} where property_id = ${t.propertyId}`,
      );
    return { id, agreementKey, version };
  }

  // ---- expenses (EXP-1, EXP-2) ---------------------------------------------------------------

  async createExpense(e: {
    propertyId: string;
    unitId: string | null;
    date: string;
    category: StatementExpense["category"];
    vendor: string | null;
    description: string;
    amountMinor: number;
    currency: string;
    receiptRef: string | null;
    rebillable: boolean;
    rebillReason: string | null;
    submittedBy: string | null;
    maintenanceIssueId?: string | null;
  }): Promise<string> {
    const id = Id.next();
    await this.tx
      .insert(s.ownerExpense)
      .values({ id, orgId: this.orgId, ...e, maintenanceIssueId: e.maintenanceIssueId ?? null });
    if (e.maintenanceIssueId)
      await this.tx.execute(
        sql`update maintenance_issue set owner_expense_id = ${id} where id = ${e.maintenanceIssueId}`,
      );
    return id;
  }

  /** The agreement's deductible rule suggests `rebillable`; an override needs a reason. */
  async suggestRebillable(propertyId: string, category: string, date: string): Promise<boolean> {
    const [a] = await rawRows<{ deductibles: Record<string, { kind?: string }> }>(
      this.tx,
      sql`select deductibles from owner_agreement where property_id = ${propertyId} and effective_from <= ${date} and (effective_to is null or effective_to > ${date}) limit 1`,
    );
    const rule = a?.deductibles[category];
    return rule ? rule.kind !== "absorbed" : true;
  }

  async approveExpense(id: string, approverId: string, fourEyes: boolean): Promise<void> {
    const [e] = await this.tx
      .select()
      .from(s.ownerExpense)
      .where(and(eq(s.ownerExpense.id, id), eq(s.ownerExpense.orgId, this.orgId)));
    if (!e) throw new Error("expense not found");
    if (e.state !== "submitted") throw new Error(`expense is ${e.state}`);
    if (fourEyes && e.submittedBy === approverId)
      throw new Error("four-eyes: the approver cannot be the submitter (EXP-1)");
    await this.tx
      .update(s.ownerExpense)
      .set({ state: "approved", approvedBy: approverId, approvedAt: sql`now()` })
      .where(eq(s.ownerExpense.id, id));
  }

  async rejectExpense(id: string, approverId: string, reason: string): Promise<void> {
    await this.tx
      .update(s.ownerExpense)
      .set({
        state: "rejected",
        approvedBy: approverId,
        approvedAt: sql`now()`,
        rejectReason: reason,
      })
      .where(
        and(
          eq(s.ownerExpense.id, id),
          eq(s.ownerExpense.orgId, this.orgId),
          eq(s.ownerExpense.state, "submitted"),
        ),
      );
  }

  async listExpenses(
    f: { propertyId?: string | null; state?: string | null; ownerId?: string | null } = {},
  ): Promise<ExpenseRow[]> {
    const conds = [sql`e.org_id = ${this.orgId}`];
    if (f.propertyId) conds.push(sql`e.property_id = ${f.propertyId}`);
    if (f.state) conds.push(sql`e.state = ${f.state}`);
    if (f.ownerId)
      conds.push(
        sql`e.property_id in (select property_id from owner_agreement where owner_id = ${f.ownerId}) and e.rebillable`,
      );
    const rows = await rawRows<{
      id: string;
      property_id: string;
      property_title: string;
      unit_id: string | null;
      date: string;
      category: StatementExpense["category"];
      vendor: string | null;
      description: string;
      amount_minor: number;
      currency: string;
      receipt_ref: string | null;
      rebillable: boolean;
      rebill_reason: string | null;
      state: string;
      submitted_by: string | null;
      approved_by: string | null;
      statement_id: string | null;
      maintenance_issue_id: string | null;
    }>(
      this.tx,
      sql`select e.id, e.property_id, p.title as property_title, e.unit_id, e.date::text, e.category, e.vendor, e.description, e.amount_minor, e.currency,
            e.receipt_ref, e.rebillable, e.rebill_reason, e.state, e.submitted_by, e.approved_by, e.statement_id, e.maintenance_issue_id
          from owner_expense e join property p on p.id = e.property_id where ${sql.join(conds, sql` and `)} order by e.date desc, e.created_at desc limit 500`,
    );
    return rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      propertyTitle: r.property_title,
      unitId: r.unit_id,
      date: r.date,
      category: r.category,
      vendor: r.vendor,
      description: r.description,
      amountMinor: num(r.amount_minor),
      currency: r.currency,
      receiptRef: r.receipt_ref,
      rebillable: r.rebillable,
      rebillReason: r.rebill_reason,
      state: r.state,
      submittedBy: r.submitted_by,
      approvedBy: r.approved_by,
      statementId: r.statement_id,
      maintenanceIssueId: r.maintenance_issue_id,
    }));
  }

  // ---- statement inputs (STMT-1, STMT-3) -----------------------------------------------------

  /**
   * Every confirmed night of every booking touching the property (or the
   * agreement's units) whose stay overlaps the period. Booking-level amounts
   * (OTA commission, withheld tax) are allocated over the booking's nights so a
   * night's share is the same whichever period bills it; the cleaning fee sits on
   * the first night. The engine then keeps only nights inside the period.
   */
  async nightsFor(
    terms: AgreementTerms,
    period: { from: string; to: string },
  ): Promise<StatementNight[]> {
    const unitFilter =
      terms.unitIds && terms.unitIds.length
        ? sql`and br.assigned_unit_id = any(${uuids(terms.unitIds)})`
        : sql``;
    const rows = await rawRows<{
      booking_id: string;
      unit_id: string | null;
      date: string;
      amount_minor: number;
      ota_name: string | null;
      ota_commission_minor: number | null;
      arrival_date: string;
      departure_date: string;
      guest_label: string;
      normalised: {
        taxes?: Array<{ amount: number; withheldByOta?: boolean; name: string }>;
        services?: Array<{ amount: number; name: string }>;
      } | null;
    }>(
      this.tx,
      sql`select b.id as booking_id, min(br.assigned_unit_id::text)::uuid as unit_id, d.date::text, sum(d.amount_minor)::bigint as amount_minor,
            b.ota_name, b.ota_commission_minor, b.arrival_date::text, b.departure_date::text,
            coalesce(min(br.guest_names->0->>'name'), 'Guest') || ' ' || left(coalesce(min(br.guest_names->0->>'surname'), ''), 1) || '.' as guest_label,
            r.normalised
          from booking_room_day d
          join booking_room br on br.id = d.booking_room_id
          join booking b on b.id = br.booking_id
          left join booking_revision r on r.id = b.last_revision_id
          where b.property_id = ${terms.propertyId} and b.mapping_state = 'mapped' and b.status <> 'cancelled' and d.status = 'confirmed'
            and b.departure_date > ${period.from} and b.arrival_date < ${period.to} ${unitFilter}
          group by b.id, d.date, r.normalised
          order by b.id, d.date`,
    );
    const byBooking = new Map<string, typeof rows>();
    for (const r of rows) byBooking.set(r.booking_id, [...(byBooking.get(r.booking_id) ?? []), r]);
    const out: StatementNight[] = [];
    for (const nights of byBooking.values()) {
      const first = nights[0]!;
      const amounts = nights.map((n) => num(n.amount_minor));
      const commissionTotal =
        first.ota_commission_minor === null ? null : num(first.ota_commission_minor);
      const channel = providerCode(first.ota_name);
      const gross = amounts.reduce((a, b) => a + b, 0);
      // no reported commission on an OTA booking: label an estimate at the channel's usual rate (spec 17 §17.2)
      const estimateBps =
        channel === "booking_com"
          ? 1500
          : channel === "airbnb"
            ? 300
            : channel === "expedia"
              ? 1800
              : 0;
      const kind: StatementNight["otaCommissionKind"] =
        commissionTotal !== null && commissionTotal > 0
          ? "actual"
          : channel === "direct" || estimateBps === 0
            ? "none"
            : "estimate";
      const commission =
        kind === "actual"
          ? commissionTotal!
          : kind === "estimate"
            ? Math.round((gross * estimateBps) / 10_000)
            : 0;
      const withheld = (first.normalised?.taxes ?? [])
        .filter((t) => t.withheldByOta)
        .reduce((a, t) => a + Math.round(t.amount * 100), 0);
      const cleaning = (first.normalised?.services ?? [])
        .filter((x) => /clean/i.test(x.name))
        .reduce((a, x) => a + Math.round(x.amount * 100), 0);
      const commissionShares = allocateOverNights(commission, amounts, terms.currency);
      const withheldShares = allocateOverNights(withheld, amounts, terms.currency);
      nights.forEach((n, i) =>
        out.push({
          bookingId: n.booking_id,
          roomKey: n.booking_id,
          date: n.date,
          unitId: n.unit_id,
          amountMinor: amounts[i]!,
          otaCommissionMinor: commissionShares[i] ?? 0,
          otaCommissionKind: kind,
          withheldTaxMinor: withheldShares[i] ?? 0,
          cleaningFeeMinor: i === 0 ? cleaning : 0,
          channel,
          guestLabel: n.guest_label,
          arrivalDate: n.arrival_date,
          departureDate: n.departure_date,
        }),
      );
    }
    return out;
  }

  async approvedExpensesFor(
    terms: AgreementTerms,
    period: { from: string; to: string },
    excludeStatementId: string | null,
  ): Promise<StatementExpense[]> {
    const unitFilter =
      terms.unitIds && terms.unitIds.length
        ? sql`and (unit_id is null or unit_id = any(${uuids(terms.unitIds)}))`
        : sql``;
    const rows = await rawRows<{
      id: string;
      date: string;
      category: StatementExpense["category"];
      description: string;
      amount_minor: number;
      vendor: string | null;
      receipt_ref: string | null;
    }>(
      this.tx,
      sql`select id, date::text, category, description, amount_minor, vendor, receipt_ref from owner_expense
          where property_id = ${terms.propertyId} and state = 'approved' and rebillable and date >= ${period.from} and date < ${period.to}
            and (statement_id is null ${excludeStatementId ? sql`or statement_id = ${excludeStatementId}` : sql``}) ${unitFilter} order by date, id`,
    );
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      category: r.category,
      description: r.description,
      amountMinor: num(r.amount_minor),
      vendor: r.vendor,
      hasReceipt: r.receipt_ref !== null,
    }));
  }

  async ownerStayNightsFor(
    terms: AgreementTerms,
    period: { from: string; to: string },
  ): Promise<OwnerStayNight[]> {
    const rows = await rawRows<{
      id: string;
      unit_id: string | null;
      date_from: string;
      date_to: string;
    }>(
      this.tx,
      sql`select id, unit_id, date_from::text, date_to::text from unit_block where property_id = ${terms.propertyId} and reason = 'owner_stay' and cancelled_at is null
            and owner_id = ${terms.ownerId} and date_from < ${period.to} and date_to > ${period.from} order by date_from, id`,
    );
    const out: OwnerStayNight[] = [];
    for (const b of rows) {
      const d = new Date(`${b.date_from}T00:00:00Z`);
      while (d.toISOString().slice(0, 10) < b.date_to) {
        const date = d.toISOString().slice(0, 10);
        if (date >= period.from && date < period.to)
          out.push({ blockId: b.id, date, unitId: b.unit_id });
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    return out;
  }

  async ownerStayNightsUsedBefore(
    ownerId: string,
    propertyId: string,
    periodFrom: string,
  ): Promise<number> {
    const yearStart = `${periodFrom.slice(0, 4)}-01-01`;
    const [r] = await rawRows<{ n: number }>(
      this.tx,
      sql`select coalesce(sum(least(date_to, ${periodFrom}::date) - greatest(date_from, ${yearStart}::date)), 0)::int as n from unit_block
          where property_id = ${propertyId} and owner_id = ${ownerId} and reason = 'owner_stay' and cancelled_at is null and date_from < ${periodFrom} and date_to > ${yearStart}`,
    );
    return r?.n ?? 0;
  }

  /** Nights already billed on sent/paid statements of this agreement: the restatement basis (STMT-4). */
  async billedNights(agreementKey: string): Promise<
    Array<{
      statementId: string;
      bookingId: string;
      roomKey: string;
      date: string;
      amountMinor: number;
    }>
  > {
    const rows = await rawRows<{
      statement_id: string;
      booking_id: string;
      room_key: string;
      date: string;
      amount_minor: number;
    }>(
      this.tx,
      sql`select n.statement_id, n.booking_id, n.room_key, n.date::text, n.amount_minor from owner_statement_night n
          join owner_statement st on st.id = n.statement_id where st.agreement_key = ${agreementKey} and st.state in ('sent', 'paid')`,
    );
    return rows.map((r) => ({
      statementId: r.statement_id,
      bookingId: r.booking_id,
      roomKey: r.room_key,
      date: r.date,
      amountMinor: num(r.amount_minor),
    }));
  }

  /** What the bookings say now for billed nights: confirmed amount per booking-date, or cancelled. */
  async currentNightStates(
    bookingIds: string[],
  ): Promise<
    Array<{ roomKey: string; date: string; amountMinor: number; status: "confirmed" | "cancelled" }>
  > {
    if (bookingIds.length === 0) return [];
    const rows = await rawRows<{
      booking_id: string;
      date: string;
      amount_minor: number;
      live: boolean;
    }>(
      this.tx,
      sql`select b.id as booking_id, d.date::text, coalesce(sum(d.amount_minor) filter (where d.status = 'confirmed'), 0)::bigint as amount_minor,
            (bool_or(d.status = 'confirmed') and b.status <> 'cancelled') as live
          from booking b join booking_room br on br.booking_id = b.id join booking_room_day d on d.booking_room_id = br.id
          where b.id = any(${uuids(bookingIds)}) group by b.id, d.date`,
    );
    return rows.map((r) => ({
      roomKey: r.booking_id,
      date: r.date,
      amountMinor: num(r.amount_minor),
      status: r.live ? "confirmed" : "cancelled",
    }));
  }

  /** Adjustments already billed on another live statement of this key (so a restatement is applied once). */
  async billedAdjustmentIds(
    agreementKey: string,
    excludeStatementId: string | null,
  ): Promise<Set<string>> {
    const rows = await rawRows<{ adjustment_id: string }>(
      this.tx,
      sql`select l.adjustment_id from owner_statement_line l join owner_statement st on st.id = l.statement_id
          where st.agreement_key = ${agreementKey} and st.state <> 'void' and l.adjustment_id is not null
            and st.id <> ${excludeStatementId ?? "00000000-0000-0000-0000-000000000000"}`,
    );
    return new Set(rows.map((r) => r.adjustment_id));
  }

  async previousStatement(agreementKey: string, periodFrom: string): Promise<StatementRow | null> {
    const rows = await this.statements({ agreementKey, before: periodFrom });
    return rows[0] ?? null;
  }

  // ---- statements (STMT-5, INV-13, OWN-1) ----------------------------------------------------

  /** Replace the draft for (key, period): lines and the night ledger are rewritten; sent statements never reach here (trigger). */
  async saveDraft(input: {
    ownerId: string;
    agreementKey: string;
    propertyId: string;
    result: StatementResult;
    inputHash: string;
    nights: StatementNight[];
    anomalies: string[];
    previousStatementId: string | null;
  }): Promise<{ id: string; changed: boolean }> {
    const [existing] = await rawRows<{ id: string; state: string; input_hash: string }>(
      this.tx,
      sql`select id, state, input_hash from owner_statement where agreement_key = ${input.agreementKey} and period_from = ${input.result.period.from} and state <> 'void'`,
    );
    if (existing && existing.state !== "draft")
      throw new Error(
        `statement for ${input.result.period.from} is ${existing.state}; corrections go on the next statement (INV-13)`,
      );
    const id = existing?.id ?? Id.next();
    if (existing) {
      await this.tx.execute(sql`delete from owner_statement_line where statement_id = ${id}`);
      await this.tx.execute(sql`delete from owner_statement_night where statement_id = ${id}`);
      await this.tx.execute(
        sql`update owner_expense set statement_id = null where statement_id = ${id}`,
      );
    }
    const t = input.result.totals;
    const values = {
      ownerId: input.ownerId,
      agreementKey: input.agreementKey,
      propertyId: input.propertyId,
      periodFrom: input.result.period.from,
      periodTo: input.result.period.to,
      currency: input.result.currency,
      totals: t as unknown as Record<string, number>,
      segments: input.result.segments,
      warnings: input.result.warnings,
      anomalies: input.anomalies,
      inputHash: input.inputHash,
      generatedAt: sql`now()`,
      previousStatementId: input.previousStatementId,
      updatedAt: sql`now()`,
    };
    if (existing)
      await this.tx.update(s.ownerStatement).set(values).where(eq(s.ownerStatement.id, id));
    else
      await this.tx
        .insert(s.ownerStatement)
        .values({ id, orgId: this.orgId, ...values, state: "draft" });
    let seq = 0;
    for (const l of input.result.lines)
      await this.tx.insert(s.ownerStatementLine).values({
        id: Id.next(),
        orgId: this.orgId,
        statementId: id,
        seq: seq++,
        kind: l.kind,
        date: l.date,
        description: l.description,
        amountMinor: l.amountMinor,
        agreementVersion: l.agreementVersion,
        bookingId: l.bookingId,
        expenseId: l.expenseId,
        blockId: l.blockId,
        adjustmentId: l.adjustmentId,
        basis: l.basis,
      });
    const billed = input.result.lines.filter((l) => l.kind === "booking_revenue");
    for (const l of billed) {
      const n = input.nights.find(
        (x) =>
          x.bookingId === l.bookingId && x.date === l.date && x.roomKey === String(l.basis.roomKey),
      );
      if (!n) continue;
      await this.tx.insert(s.ownerStatementNight).values({
        orgId: this.orgId,
        statementId: id,
        bookingId: n.bookingId,
        roomKey: n.roomKey,
        date: n.date,
        amountMinor: n.amountMinor,
      });
    }
    const expenseIds = input.result.lines
      .filter((l) => l.kind === "expense" && l.expenseId)
      .map((l) => l.expenseId!);
    if (expenseIds.length)
      await this.tx.execute(
        sql`update owner_expense set statement_id = ${id} where id = any(${uuids(expenseIds)})`,
      );
    return { id, changed: existing?.input_hash !== input.inputHash };
  }

  async statements(
    f: {
      ownerId?: string | null;
      agreementKey?: string | null;
      state?: string | null;
      before?: string | null;
      propertyId?: string | null;
    } = {},
  ): Promise<StatementRow[]> {
    const conds = [sql`st.org_id = ${this.orgId}`, sql`st.state <> 'void'`];
    if (f.ownerId) conds.push(sql`st.owner_id = ${f.ownerId}`);
    if (f.agreementKey) conds.push(sql`st.agreement_key = ${f.agreementKey}`);
    if (f.state) conds.push(sql`st.state = ${f.state}`);
    if (f.before) conds.push(sql`st.period_to <= ${f.before}`);
    if (f.propertyId) conds.push(sql`st.property_id = ${f.propertyId}`);
    const rows = await rawRows<{
      id: string;
      owner_id: string;
      owner_name: string;
      agreement_key: string;
      property_id: string;
      property_title: string;
      period_from: string;
      period_to: string;
      state: string;
      dispute_state: string;
      dispute_thread_id: string | null;
      currency: string;
      totals: Record<string, number>;
      segments: unknown[];
      warnings: string[];
      anomalies: string[];
      input_hash: string;
      generated_at: string;
      approved_at: string | null;
      sent_at: string | null;
      paid_at: string | null;
      pdf_ref: string | null;
      previous_statement_id: string | null;
    }>(
      this.tx,
      sql`select st.id, st.owner_id, o.name as owner_name, st.agreement_key, st.property_id, p.title as property_title, st.period_from::text, st.period_to::text, st.state, st.dispute_state,
            st.dispute_thread_id, st.currency, st.totals, st.segments, st.warnings, st.anomalies, st.input_hash, st.generated_at::text, st.approved_at::text, st.sent_at::text, st.paid_at::text, st.pdf_ref, st.previous_statement_id
          from owner_statement st join owner o on o.id = st.owner_id join property p on p.id = st.property_id
          where ${sql.join(conds, sql` and `)} order by st.period_from desc, o.name limit 500`,
    );
    return rows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      agreementKey: r.agreement_key,
      propertyId: r.property_id,
      propertyTitle: r.property_title,
      periodFrom: r.period_from,
      periodTo: r.period_to,
      state: r.state,
      disputeState: r.dispute_state,
      disputeThreadId: r.dispute_thread_id,
      currency: r.currency,
      totals: r.totals,
      segments: r.segments,
      warnings: r.warnings,
      anomalies: r.anomalies,
      inputHash: r.input_hash,
      generatedAt: r.generated_at,
      approvedAt: r.approved_at,
      sentAt: r.sent_at,
      paidAt: r.paid_at,
      pdfRef: r.pdf_ref,
      previousStatementId: r.previous_statement_id,
    }));
  }

  async statement(
    id: string,
  ): Promise<(StatementRow & { lines: StatementLineRow[]; payouts: PayoutRow[] }) | null> {
    const [row] = await rawRows<{ id: string }>(
      this.tx,
      sql`select id from owner_statement where id = ${id} and org_id = ${this.orgId}`,
    );
    if (!row) return null;
    const [st] = (await this.statements({})).filter((x) => x.id === id);
    if (!st) {
      const [v] = await rawRows<{ state: string }>(
        this.tx,
        sql`select state from owner_statement where id = ${id}`,
      );
      if (v?.state === "void") return null;
    }
    const lines = await this.tx
      .select()
      .from(s.ownerStatementLine)
      .where(eq(s.ownerStatementLine.statementId, id))
      .orderBy(s.ownerStatementLine.seq);
    const payouts = await this.payouts({ statementId: id });
    return {
      ...st!,
      lines: lines.map((l) => ({
        id: l.id,
        seq: l.seq,
        kind: l.kind,
        date: l.date,
        description: l.description,
        amountMinor: num(l.amountMinor),
        agreementVersion: l.agreementVersion,
        bookingId: l.bookingId,
        expenseId: l.expenseId,
        blockId: l.blockId,
        adjustmentId: l.adjustmentId,
        basis: l.basis,
      })),
      payouts,
    };
  }

  async approve(id: string, userId: string): Promise<void> {
    await this.expectState(id, "draft", "only a draft can be approved");
    await this.tx.execute(
      sql`update owner_statement set state = 'approved', approved_by = ${userId}, approved_at = now(), updated_at = now() where id = ${id}`,
    );
  }

  private async expectState(id: string, state: string, message: string): Promise<void> {
    const [r] = await rawRows<{ state: string }>(
      this.tx,
      sql`select state from owner_statement where id = ${id} and org_id = ${this.orgId}`,
    );
    if (r?.state !== state) throw new Error(message);
  }

  async markSent(id: string, pdfRef: string): Promise<void> {
    await this.expectState(id, "approved", "only an approved statement can be sent");
    await this.tx.execute(
      sql`update owner_statement set state = 'sent', sent_at = now(), pdf_ref = ${pdfRef}, updated_at = now() where id = ${id}`,
    );
  }

  async markPaid(id: string): Promise<void> {
    await this.tx.execute(
      sql`update owner_statement set state = 'paid', paid_at = now(), updated_at = now() where id = ${id} and org_id = ${this.orgId} and state = 'sent'`,
    );
  }

  async voidDraft(id: string): Promise<void> {
    await this.tx.execute(
      sql`delete from owner_statement_night where statement_id = ${id} and statement_id in (select id from owner_statement where state = 'draft')`,
    );
    await this.tx.execute(
      sql`update owner_expense set statement_id = null where statement_id = ${id} and statement_id in (select id from owner_statement where state = 'draft')`,
    );
    await this.tx.execute(
      sql`update owner_statement set state = 'void', updated_at = now() where id = ${id} and org_id = ${this.orgId} and state = 'draft'`,
    );
  }

  /** Statements approved for longer than `days` and not yet sent (STMT-5 auto-send). */
  async approvedOlderThan(days: number): Promise<string[]> {
    const rows = await rawRows<{ id: string }>(
      this.tx,
      sql`select id from owner_statement where org_id = ${this.orgId} and state = 'approved' and approved_at < now() - (${days}::text || ' days')::interval`,
    );
    return rows.map((r) => r.id);
  }

  async setDispute(
    id: string,
    state: "none" | "open" | "resolved",
    threadId: string | null,
  ): Promise<void> {
    await this.tx.execute(
      sql`update owner_statement set dispute_state = ${state}, dispute_thread_id = coalesce(${threadId}, dispute_thread_id), updated_at = now() where id = ${id} and org_id = ${this.orgId}`,
    );
  }

  // ---- payouts (PAY-1..3) --------------------------------------------------------------------

  async createPayout(p: {
    statementId: string;
    ownerId: string;
    amountMinor: number;
    currency: string;
    method: string;
    initiatedBy: string;
    awaitingApproval: boolean;
    reference: string | null;
  }): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.ownerPayout).values({
      id,
      orgId: this.orgId,
      statementId: p.statementId,
      ownerId: p.ownerId,
      amountMinor: p.amountMinor,
      currency: p.currency,
      method: p.method,
      initiatedBy: p.initiatedBy,
      reference: p.reference,
      state: p.awaitingApproval ? "awaiting_approval" : "pending",
    });
    return id;
  }

  async approvePayout(id: string, approverId: string): Promise<void> {
    const [p] = await this.tx
      .select()
      .from(s.ownerPayout)
      .where(and(eq(s.ownerPayout.id, id), eq(s.ownerPayout.orgId, this.orgId)));
    if (!p) throw new Error("payout not found");
    if (p.state !== "awaiting_approval") throw new Error(`payout is ${p.state}`);
    if (p.initiatedBy === approverId)
      throw new Error("four-eyes: a second person must approve this payout (PAY-1)");
    await this.tx
      .update(s.ownerPayout)
      .set({ state: "pending", approvedBy: approverId, updatedAt: sql`now()` })
      .where(eq(s.ownerPayout.id, id));
  }

  async updatePayout(
    id: string,
    patch: { state: string; providerRef?: string | null; failureReason?: string | null },
  ): Promise<void> {
    await this.tx
      .execute(sql`update owner_payout set state = ${patch.state}, provider_ref = coalesce(${patch.providerRef ?? null}, provider_ref), failure_reason = ${patch.failureReason ?? null},
      paid_at = case when ${patch.state === "paid"} then now() else paid_at end, updated_at = now() where id = ${id} and org_id = ${this.orgId}`);
    if (patch.state === "paid")
      await this.tx.execute(
        sql`update owner_statement set state = 'paid', paid_at = now(), updated_at = now() where id = (select statement_id from owner_payout where id = ${id}) and state = 'sent'`,
      );
  }

  async payouts(
    f: { statementId?: string | null; state?: string | null; ownerId?: string | null } = {},
  ): Promise<PayoutRow[]> {
    const conds = [sql`p.org_id = ${this.orgId}`];
    if (f.statementId) conds.push(sql`p.statement_id = ${f.statementId}`);
    if (f.state) conds.push(sql`p.state = ${f.state}`);
    if (f.ownerId) conds.push(sql`p.owner_id = ${f.ownerId}`);
    const rows = await rawRows<{
      id: string;
      statement_id: string;
      owner_id: string;
      owner_name: string;
      amount_minor: number;
      currency: string;
      method: string;
      provider_ref: string | null;
      state: string;
      initiated_by: string | null;
      approved_by: string | null;
      reference: string | null;
      failure_reason: string | null;
      paid_at: string | null;
      created_at: string;
    }>(
      this.tx,
      sql`select p.id, p.statement_id, p.owner_id, o.name as owner_name, p.amount_minor, p.currency, p.method, p.provider_ref, p.state, p.initiated_by, p.approved_by, p.reference, p.failure_reason, p.paid_at::text, p.created_at::text
          from owner_payout p join owner o on o.id = p.owner_id where ${sql.join(conds, sql` and `)} order by p.created_at desc limit 500`,
    );
    return rows.map((r) => ({
      id: r.id,
      statementId: r.statement_id,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      amountMinor: num(r.amount_minor),
      currency: r.currency,
      method: r.method,
      providerRef: r.provider_ref,
      state: r.state,
      initiatedBy: r.initiated_by,
      approvedBy: r.approved_by,
      reference: r.reference,
      failureReason: r.failure_reason,
      paidAt: r.paid_at,
      createdAt: r.created_at,
    }));
  }

  /** PAY-1: four-eyes threshold in org currency minor units (default 5,000.00; Q from the plan). */
  async fourEyesThreshold(): Promise<number> {
    const [r] = await rawRows<{ v: number | null }>(
      this.tx,
      sql`select (settings->>'payout_four_eyes_minor')::bigint as v from organization where id = ${this.orgId}`,
    );
    return r?.v !== null && r?.v !== undefined ? num(r.v) : 500_000;
  }

  async orgSetting(key: string): Promise<string | null> {
    const [r] = await rawRows<{ v: string | null }>(
      this.tx,
      sql`select settings->>${key} as v from organization where id = ${this.orgId}`,
    );
    return r?.v ?? null;
  }

  // ---- portal reads (spec 17 §17.5, PORT-1) ----------------------------------------------------

  /** The properties and units an owner may see: everything an agreement of theirs has ever covered. */
  async portalScope(ownerId: string): Promise<{
    properties: Array<{ id: string; title: string; timezone: string; currency: string }>;
    unitIds: string[] | null;
  }> {
    const props = await rawRows<{ id: string; title: string; timezone: string; currency: string }>(
      this.tx,
      sql`select distinct p.id, p.title, p.timezone, p.currency from owner_agreement a join property p on p.id = a.property_id where a.owner_id = ${ownerId} and a.org_id = ${this.orgId} order by p.title`,
    );
    const units = await rawRows<{ unit_ids: string[] | null }>(
      this.tx,
      sql`select unit_ids from owner_agreement where owner_id = ${ownerId}`,
    );
    const all = units.some((u) => u.unit_ids === null);
    return { properties: props, unitIds: all ? null : units.flatMap((u) => u.unit_ids ?? []) };
  }

  /** Limited booking rows: first name, dates, channel, unit. No contact details, no totals beyond the owner's basis. */
  async portalBookings(
    ownerId: string,
    from: string,
    to: string,
  ): Promise<
    Array<{
      id: string;
      propertyId: string;
      propertyTitle: string;
      unit: string | null;
      guestFirstName: string;
      arrivalDate: string;
      departureDate: string;
      channel: string;
      status: string;
      nights: number;
    }>
  > {
    const scope = await this.portalScope(ownerId);
    if (scope.properties.length === 0) return [];
    const ids = scope.properties.map((p) => p.id);
    const unitFilter = scope.unitIds
      ? sql`and br.assigned_unit_id = any(${uuids(scope.unitIds)})`
      : sql``;
    const rows = await rawRows<{
      id: string;
      property_id: string;
      property_title: string;
      unit: string | null;
      first: string;
      arrival_date: string;
      departure_date: string;
      ota_name: string | null;
      status: string;
    }>(
      this.tx,
      sql`select b.id, b.property_id, p.title as property_title, u.name as unit, coalesce(br.guest_names->0->>'name', 'Guest') as first, b.arrival_date::text, b.departure_date::text, b.ota_name, b.status
          from booking b join property p on p.id = b.property_id join booking_room br on br.booking_id = b.id left join unit u on u.id = br.assigned_unit_id
          where b.property_id = any(${uuids(ids)}) and b.departure_date > ${from} and b.arrival_date < ${to} ${unitFilter} order by b.arrival_date`,
    );
    return rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      propertyTitle: r.property_title,
      unit: r.unit,
      guestFirstName: r.first,
      arrivalDate: r.arrival_date,
      departureDate: r.departure_date,
      channel: providerCode(r.ota_name),
      status: r.status,
      nights: Math.round((Date.parse(r.departure_date) - Date.parse(r.arrival_date)) / 86_400_000),
    }));
  }

  async portalBlocks(
    ownerId: string,
    from: string,
    to: string,
  ): Promise<
    Array<{
      id: string;
      propertyTitle: string;
      dateFrom: string;
      dateTo: string;
      reason: string;
      note: string | null;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      property_title: string;
      date_from: string;
      date_to: string;
      reason: string;
      note: string | null;
    }>(
      this.tx,
      sql`select b.id, p.title as property_title, b.date_from::text, b.date_to::text, b.reason, b.note from unit_block b join property p on p.id = b.property_id
          where b.cancelled_at is null and b.date_from < ${to} and b.date_to > ${from} and b.property_id in (select property_id from owner_agreement where owner_id = ${ownerId}) order by b.date_from`,
    );
    return rows.map((r) => ({
      id: r.id,
      propertyTitle: r.property_title,
      dateFrom: r.date_from,
      dateTo: r.date_to,
      reason: r.reason,
      note: r.note,
    }));
  }

  async portalIssues(ownerId: string): Promise<
    Array<{
      id: string;
      propertyTitle: string;
      description: string;
      severity: string;
      state: string;
      photos: string[];
      createdAt: string;
      rebilled: boolean;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      property_title: string;
      description: string;
      severity: string;
      state: string;
      photos: string[];
      created_at: string;
      rebill_to_owner: boolean;
    }>(
      this.tx,
      sql`select m.id, p.title as property_title, m.description, m.severity, m.state, m.photos, m.created_at::text, m.rebill_to_owner from maintenance_issue m join property p on p.id = m.property_id
          where m.property_id in (select property_id from owner_agreement where owner_id = ${ownerId}) order by m.created_at desc limit 200`,
    );
    return rows.map((r) => ({
      id: r.id,
      propertyTitle: r.property_title,
      description: r.description,
      severity: r.severity,
      state: r.state,
      photos: r.photos,
      createdAt: r.created_at,
      rebilled: r.rebill_to_owner,
    }));
  }

  async portalReviews(ownerId: string): Promise<
    Array<{
      id: string;
      propertyTitle: string;
      rating: number;
      body: string;
      ota: string;
      insertedAt: string;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      property_title: string;
      rating: number;
      body: string;
      ota: string;
      inserted_at: string;
    }>(
      this.tx,
      sql`select r.id, p.title as property_title, r.rating, r.body, r.ota, r.inserted_at::text from review r join property p on p.id = r.property_id
          where r.property_id in (select property_id from owner_agreement where owner_id = ${ownerId}) order by r.inserted_at desc limit 100`,
    );
    return rows.map((r) => ({
      id: r.id,
      propertyTitle: r.property_title,
      rating: r.rating,
      body: r.body,
      ota: r.ota,
      insertedAt: r.inserted_at,
    }));
  }

  /** Dashboard numbers for the portal: this month's nights, occupancy, gross and projected net from the draft. */
  async portalDashboard(
    ownerId: string,
    monthFrom: string,
    monthTo: string,
  ): Promise<{
    nightsSold: number;
    unitNights: number;
    grossMinor: number;
    projectedNetMinor: number | null;
    currency: string;
    nextArrivals: Array<{ guestFirstName: string; arrivalDate: string; propertyTitle: string }>;
  }> {
    const scope = await this.portalScope(ownerId);
    const ids = scope.properties.map((p) => p.id);
    if (ids.length === 0)
      return {
        nightsSold: 0,
        unitNights: 0,
        grossMinor: 0,
        projectedNetMinor: null,
        currency: "EUR",
        nextArrivals: [],
      };
    const [agg] = await rawRows<{ nights: number; gross: number }>(
      this.tx,
      sql`select count(*)::int as nights, coalesce(sum(d.amount_minor), 0)::bigint as gross from booking_room_day d join booking b on b.id = (select booking_id from booking_room where id = d.booking_room_id)
          where d.property_id = any(${uuids(ids)}) and d.status = 'confirmed' and b.status <> 'cancelled' and d.date >= ${monthFrom} and d.date < ${monthTo}`,
    );
    const [units] = await rawRows<{ n: number }>(
      this.tx,
      sql`select count(*)::int as n from unit where property_id = any(${uuids(ids)}) ${scope.unitIds ? sql`and id = any(${uuids(scope.unitIds)})` : sql``}`,
    );
    const days = Math.round((Date.parse(monthTo) - Date.parse(monthFrom)) / 86_400_000);
    const drafts = await this.statements({ ownerId, state: "draft" });
    const current = drafts.filter((d) => d.periodFrom === monthFrom);
    const next = await rawRows<{ first: string; arrival_date: string; property_title: string }>(
      this.tx,
      sql`select coalesce(br.guest_names->0->>'name', 'Guest') as first, b.arrival_date::text, p.title as property_title from booking b join property p on p.id = b.property_id join booking_room br on br.booking_id = b.id
          where b.property_id = any(${uuids(ids)}) and b.status <> 'cancelled' and b.arrival_date >= current_date order by b.arrival_date limit 5`,
    );
    return {
      nightsSold: agg?.nights ?? 0,
      unitNights: (units?.n ?? 0) * days,
      grossMinor: num(agg?.gross),
      projectedNetMinor: current.length
        ? current.reduce((a, d) => a + num(d.totals.netDue), 0)
        : null,
      currency: scope.properties[0]?.currency ?? "EUR",
      nextArrivals: next.map((n) => ({
        guestFirstName: n.first,
        arrivalDate: n.arrival_date,
        propertyTitle: n.property_title,
      })),
    };
  }
}
