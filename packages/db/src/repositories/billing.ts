import { and, asc, eq, sql } from "drizzle-orm";
import {
  folioBalance,
  Id,
  invoiceNumber,
  planDailyClose,
  type FolioLine,
  type FolioLineKind,
  type Payment,
  type PaymentMethod,
} from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

export interface FolioView {
  id: string;
  bookingId: string | null;
  propertyId: string;
  label: string;
  currency: string;
  state: string;
  lines: Array<FolioLine & { invoiceId: string | null }>;
  payments: Payment[];
  invoices: Array<{
    id: string;
    number: string;
    kind: string;
    totalMinor: number;
    issuedAt: string;
  }>;
  balance: ReturnType<typeof folioBalance>;
}

/** Folios, charges, payments, deposits, gapless invoices and the daily close (spec 08 §8.9). */
export class DrizzleBillingRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  async ensureFolio(bookingId: string): Promise<string> {
    const [existing] = await this.tx
      .select({ id: s.folio.id })
      .from(s.folio)
      .where(and(eq(s.folio.bookingId, bookingId), eq(s.folio.label, "Main")))
      .limit(1);
    if (existing) return existing.id;
    const [b] = await this.tx
      .select({ propertyId: s.booking.propertyId, currency: s.booking.currency })
      .from(s.booking)
      .where(eq(s.booking.id, bookingId))
      .limit(1);
    if (!b) throw new RangeError("booking not found");
    const id = Id.next();
    await this.tx
      .insert(s.folio)
      .values({ id, orgId: this.orgId, propertyId: b.propertyId, bookingId, currency: b.currency });
    return id;
  }
  async splitFolio(bookingId: string, label: string): Promise<string> {
    const main = await this.ensureFolio(bookingId);
    const [f] = await this.tx.select().from(s.folio).where(eq(s.folio.id, main)).limit(1);
    const id = Id.next();
    await this.tx.insert(s.folio).values({
      id,
      orgId: this.orgId,
      propertyId: f!.propertyId,
      bookingId,
      label,
      currency: f!.currency,
    });
    return id;
  }
  async folio(id: string): Promise<FolioView | null> {
    const [f] = await this.tx.select().from(s.folio).where(eq(s.folio.id, id)).limit(1);
    if (!f) return null;
    const lines = await this.tx
      .select()
      .from(s.folioLine)
      .where(eq(s.folioLine.folioId, id))
      .orderBy(asc(s.folioLine.date), asc(s.folioLine.createdAt));
    const payments = await this.tx
      .select()
      .from(s.payment)
      .where(eq(s.payment.folioId, id))
      .orderBy(asc(s.payment.receivedAt));
    const invoices = await this.tx
      .select()
      .from(s.invoice)
      .where(eq(s.invoice.folioId, id))
      .orderBy(asc(s.invoice.issuedAt));
    const l = lines.map((x) => ({
      id: x.id as Id,
      kind: x.kind as FolioLineKind,
      description: x.description,
      date: x.date,
      amountMinor: x.amountMinor,
      ...(x.postingKey ? { postingKey: x.postingKey } : {}),
      invoiceId: x.invoiceId,
    }));
    const p = payments.map((x) => ({
      id: x.id as Id,
      method: x.method as PaymentMethod,
      amountMinor: x.amountMinor,
      receivedAt: x.receivedAt,
      state: x.state as Payment["state"],
      ...(x.reason ? { reason: x.reason } : {}),
    }));
    return {
      id: f.id,
      bookingId: f.bookingId,
      propertyId: f.propertyId,
      label: f.label,
      currency: f.currency,
      state: f.state,
      lines: l,
      payments: p,
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        kind: i.kind,
        totalMinor: i.totalMinor,
        issuedAt: i.issuedAt,
      })),
      balance: folioBalance(l, p),
    };
  }
  async foliosForBooking(bookingId: string): Promise<FolioView[]> {
    await this.ensureFolio(bookingId);
    const rows = await this.tx
      .select({ id: s.folio.id })
      .from(s.folio)
      .where(eq(s.folio.bookingId, bookingId))
      .orderBy(asc(s.folio.createdAt));
    const out: FolioView[] = [];
    for (const r of rows) out.push((await this.folio(r.id))!);
    return out;
  }
  async addLine(
    folioId: string,
    line: Omit<FolioLine, "id"> & { id?: Id },
    createdBy?: string,
  ): Promise<string> {
    const id = line.id ?? Id.next();
    await this.tx
      .insert(s.folioLine)
      .values({
        id,
        orgId: this.orgId,
        folioId,
        kind: line.kind,
        description: line.description,
        date: line.date,
        amountMinor: line.amountMinor,
        postingKey: line.postingKey ?? null,
        createdBy: createdBy ?? null,
      })
      .onConflictDoNothing();
    return id;
  }
  async transferLine(lineId: string, toFolioId: string): Promise<void> {
    await this.tx.update(s.folioLine).set({ folioId: toFolioId }).where(eq(s.folioLine.id, lineId));
  }
  async addPayment(
    folioId: string,
    p: {
      method: PaymentMethod;
      amountMinor: number;
      state?: Payment["state"];
      reason?: string;
      providerRef?: string;
    },
    createdBy?: string,
  ): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.payment).values({
      id,
      orgId: this.orgId,
      folioId,
      method: p.method,
      amountMinor: p.amountMinor,
      state: p.state ?? "captured",
      reason: p.reason ?? null,
      providerRef: p.providerRef ?? null,
      createdBy: createdBy ?? null,
    });
    return id;
  }
  async setPaymentState(id: string, state: Payment["state"], reason: string): Promise<void> {
    await this.tx.update(s.payment).set({ state, reason }).where(eq(s.payment.id, id));
  }

  /** Gapless numbering: lock the sequence row for the property and year, then stamp the lines (spec 08 §8.9). */
  async issueInvoice(
    folioId: string,
    opts: {
      kind?: "invoice" | "credit_note";
      creditsInvoiceId?: string;
      issuedBy?: string;
      prefix?: string;
      year: number;
    },
  ): Promise<{ id: string; number: string; totalMinor: number }> {
    const f = await this.folio(folioId);
    if (!f) throw new RangeError("folio not found");
    const open = f.lines.filter((l) => !l.invoiceId);
    if (open.length === 0) throw new RangeError("nothing to invoice");
    const prefix = opts.prefix ?? "INV";
    await this.tx.execute(
      sql`insert into invoice_sequence (org_id, property_id, year, prefix, last_seq) values (${this.orgId}, ${f.propertyId}, ${opts.year}, ${prefix}, 0) on conflict (property_id, year) do nothing`,
    );
    const [seq] = await rawRows<{ last_seq: number; prefix: string }>(
      this.tx,
      sql`select last_seq, prefix from invoice_sequence where property_id = ${f.propertyId} and year = ${opts.year} for update`,
    );
    const next = (seq?.last_seq ?? 0) + 1;
    await this.tx.execute(
      sql`update invoice_sequence set last_seq = ${next} where property_id = ${f.propertyId} and year = ${opts.year}`,
    );
    const number = invoiceNumber(seq?.prefix ?? prefix, opts.year, next);
    const id = Id.next();
    const totalMinor = open.reduce((a, l) => a + l.amountMinor, 0);
    await this.tx.insert(s.invoice).values({
      id,
      orgId: this.orgId,
      propertyId: f.propertyId,
      folioId,
      number,
      kind: opts.kind ?? "invoice",
      currency: f.currency,
      totalMinor,
      issuedBy: opts.issuedBy ?? null,
      creditsInvoiceId: opts.creditsInvoiceId ?? null,
    });
    for (const l of open)
      await this.tx.update(s.folioLine).set({ invoiceId: id }).where(eq(s.folioLine.id, l.id));
    return { id, number, totalMinor };
  }

  /** Daily close for one property and business date; re-running posts nothing twice. */
  async closeDay(
    propertyId: string,
    businessDate: string,
  ): Promise<{
    postedLines: number;
    flagged: Array<{ bookingId: string; balanceMinor: number }>;
    runs: number;
  }> {
    const nights = await rawRows<{
      bookingRoomId: string;
      bookingId: string;
      date: string;
      amountMinor: number;
      description: string;
    }>(
      this.tx,
      sql`select d.booking_room_id as "bookingRoomId", br.booking_id as "bookingId", d.date::text, d.amount_minor as "amountMinor", coalesce(rt.title, 'Room') as description
        from booking_room_day d join booking_room br on br.id = d.booking_room_id left join room_type rt on rt.id = d.room_type_id
        where d.property_id = ${propertyId} and d.date = ${businessDate} and d.status = 'confirmed'`,
    );
    const existing = await rawRows<{ posting_key: string }>(
      this.tx,
      sql`select l.posting_key from folio_line l join folio f on f.id = l.folio_id where f.property_id = ${propertyId} and l.posting_key is not null and l.date = ${businessDate}`,
    );
    const departed = await rawRows<{ bookingId: string; balanceMinor: number }>(
      this.tx,
      sql`select b.id as "bookingId", (coalesce((select sum(l.amount_minor) from folio_line l join folio f on f.id = l.folio_id where f.booking_id = b.id), 0) - coalesce((select sum(case when p.state = 'captured' then p.amount_minor when p.state = 'refunded' then -p.amount_minor else 0 end) from payment p join folio f on f.id = p.folio_id where f.booking_id = b.id), 0))::bigint as "balanceMinor"
        from booking b where b.property_id = ${propertyId} and b.departure_date = ${businessDate} and b.status <> 'cancelled'`,
    );
    const plan = planDailyClose({
      businessDate,
      nights,
      existingPostingKeys: new Set(existing.map((e) => e.posting_key)),
      departedUnbalanced: departed.map((d) => ({
        bookingId: d.bookingId,
        balanceMinor: Number(d.balanceMinor),
      })),
    });
    for (const p of plan.postings)
      await this.addLine(await this.ensureFolio(p.bookingId), p.line, "daily_close");
    const [prev] = await this.tx
      .select({ runs: s.dailyClose.runs })
      .from(s.dailyClose)
      .where(
        and(eq(s.dailyClose.propertyId, propertyId), eq(s.dailyClose.businessDate, businessDate)),
      )
      .limit(1);
    const runs = (prev?.runs ?? 0) + 1;
    await this.tx
      .insert(s.dailyClose)
      .values({
        orgId: this.orgId,
        propertyId,
        businessDate,
        postedLines: plan.postings.length,
        flaggedFolios: plan.flags,
        runs,
      })
      .onConflictDoUpdate({
        target: [s.dailyClose.propertyId, s.dailyClose.businessDate],
        set: {
          postedLines: sql`daily_close.posted_lines + ${plan.postings.length}`,
          flaggedFolios: plan.flags,
          runs,
          closedAt: sql`now()`,
        },
      });
    return { postedLines: plan.postings.length, flagged: plan.flags, runs };
  }
  async lastClose(propertyId: string): Promise<string | null> {
    const [r] = await rawRows<{ d: string | null }>(
      this.tx,
      sql`select max(business_date)::text as d from daily_close where property_id = ${propertyId}`,
    );
    return r?.d ?? null;
  }
}
