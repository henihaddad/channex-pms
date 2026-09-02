import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  ConnectionHealth,
  ConnectionState,
  DerivedOption,
  MappingRow,
  Readiness,
} from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

export interface ChannelAccountRow {
  id: string;
  adapterCode: string;
  label: string;
  state: string;
  oauthExpiresAt: string | null;
  hasCredentials: boolean;
  createdAt: string;
}

export interface ConnectionRow {
  id: string;
  propertyId: string;
  propertyTitle: string;
  channelAccountId: string | null;
  adapterCode: string;
  channexChannelId: string | null;
  settings: Record<string, unknown>;
  settingsEnc: string | null;
  state: ConnectionState;
  readiness: Readiness;
  lastError: string | null;
  lastPushAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ChannelEventRow {
  id: string;
  connectionId: string | null;
  propertyId: string;
  type: string;
  severity: string;
  message: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  acknowledgedAt: string | null;
}

/** Channel accounts, connections, mappings and events (spec 07). Credentials are stored sealed and never read back to the client (CH-2). */
export class DrizzleChannelRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  // ---- accounts (CH-5) --------------------------------------------------------------

  async insertAccount(a: {
    id: string;
    adapterCode: string;
    label: string;
    credentialsEnc?: string | null;
    oauthTokensEnc?: string | null;
    oauthExpiresAt?: string | null;
  }): Promise<void> {
    await this.tx.insert(s.channelAccount).values({
      id: a.id,
      orgId: this.orgId,
      adapterCode: a.adapterCode,
      label: a.label,
      credentialsEnc: a.credentialsEnc ?? null,
      oauthTokensEnc: a.oauthTokensEnc ?? null,
      oauthExpiresAt: a.oauthExpiresAt ?? null,
    });
  }
  async listAccounts(): Promise<ChannelAccountRow[]> {
    const rows = await this.tx
      .select()
      .from(s.channelAccount)
      .where(isNull(s.channelAccount.archivedAt))
      .orderBy(asc(s.channelAccount.label));
    return rows.map((r) => ({
      id: r.id,
      adapterCode: r.adapterCode,
      label: r.label,
      state: r.state,
      oauthExpiresAt: r.oauthExpiresAt,
      hasCredentials: Boolean(r.credentialsEnc ?? r.oauthTokensEnc),
      createdAt: r.createdAt,
    }));
  }
  async accountSecrets(
    id: string,
  ): Promise<{ credentialsEnc: string | null; oauthTokensEnc: string | null } | null> {
    const [r] = await this.tx
      .select({
        credentialsEnc: s.channelAccount.credentialsEnc,
        oauthTokensEnc: s.channelAccount.oauthTokensEnc,
      })
      .from(s.channelAccount)
      .where(eq(s.channelAccount.id, id))
      .limit(1);
    return r ?? null;
  }
  async setAccountState(id: string, state: "active" | "expired" | "revoked"): Promise<void> {
    await this.tx.update(s.channelAccount).set({ state }).where(eq(s.channelAccount.id, id));
  }

  // ---- connections (CH-1..CH-8) -----------------------------------------------------

  async insertConnection(c: {
    id: string;
    propertyId: string;
    adapterCode: string;
    channelAccountId?: string | null;
    settings: Record<string, unknown>;
    settingsEnc?: string | null;
  }): Promise<void> {
    await this.tx.insert(s.channelConnection).values({
      id: c.id,
      orgId: this.orgId,
      propertyId: c.propertyId,
      adapterCode: c.adapterCode,
      channelAccountId: c.channelAccountId ?? null,
      settings: c.settings,
      settingsEnc: c.settingsEnc ?? null,
      state: "draft",
    });
  }
  async getConnection(id: string): Promise<ConnectionRow | null> {
    const [r] = await rawRows<ConnectionRow>(
      this.tx,
      sql`${this.connectionSelect()} where c.id = ${id} and c.archived_at is null`,
    );
    return r ?? null;
  }
  async listConnections(propertyId?: string): Promise<ConnectionRow[]> {
    return rawRows<ConnectionRow>(
      this.tx,
      sql`${this.connectionSelect()} where c.archived_at is null ${propertyId ? sql`and c.property_id = ${propertyId}` : sql``} order by p.title, c.adapter_code`,
    );
  }
  private connectionSelect() {
    return sql`${this.connectionColumns()} ${this.connectionFrom()}`;
  }
  private connectionFrom() {
    return sql`from channel_connection c join property p on p.id = c.property_id`;
  }
  private connectionColumns() {
    return sql`select c.id, c.property_id as "propertyId", p.title as "propertyTitle", c.channel_account_id as "channelAccountId", c.adapter_code as "adapterCode",
      c.channex_channel_id as "channexChannelId", c.settings, c.settings_enc as "settingsEnc", c.state, c.readiness, c.last_error as "lastError",
      c.last_push_at as "lastPushAt", c.is_active as "isActive", c.created_at as "createdAt"`;
  }
  async updateConnection(
    id: string,
    patch: Partial<{
      state: ConnectionState;
      readiness: Readiness;
      lastError: string | null;
      channexChannelId: string;
      isActive: boolean;
      lastPushAt: string;
      settings: Record<string, unknown>;
      settingsEnc: string | null;
    }>,
  ): Promise<void> {
    await this.tx
      .update(s.channelConnection)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(eq(s.channelConnection.id, id));
  }
  async removeConnection(id: string): Promise<void> {
    await this.tx
      .update(s.channelConnection)
      .set({ state: "removed", isActive: false, archivedAt: sql`now()` })
      .where(eq(s.channelConnection.id, id));
  }

  // ---- mappings (MAP-1..6) -----------------------------------------------------------

  async listMappings(connectionId: string): Promise<MappingRow[]> {
    const rows = await this.tx
      .select()
      .from(s.channelMapping)
      .where(
        and(eq(s.channelMapping.connectionId, connectionId), eq(s.channelMapping.status, "active")),
      )
      .orderBy(asc(s.channelMapping.otaRoomCode), asc(s.channelMapping.otaRateCode));
    return rows.map((r) => ({
      ratePlanId: r.ratePlanId,
      roomCode: r.otaRoomCode,
      rateCode: r.otaRateCode,
      ...(r.occupancy ? { occupancy: Number(r.occupancy) } : {}),
      ...(r.rateType ? { rateType: r.rateType } : {}),
      ...(r.derivedOption ? { derivedOption: r.derivedOption as DerivedOption } : {}),
    }));
  }
  /** Replace the connection's mapping set atomically; the audit entry carries before/after (MAP-6). */
  async replaceMappings(
    connectionId: string,
    rows: readonly MappingRow[],
    ids: () => string,
  ): Promise<void> {
    await this.tx.delete(s.channelMapping).where(eq(s.channelMapping.connectionId, connectionId));
    if (rows.length === 0) return;
    await this.tx.insert(s.channelMapping).values(
      rows.map((r) => ({
        id: ids(),
        orgId: this.orgId,
        connectionId,
        ratePlanId: r.ratePlanId,
        otaRoomCode: r.roomCode,
        otaRateCode: r.rateCode,
        occupancy: r.occupancy !== undefined ? String(r.occupancy) : null,
        rateType: r.rateType ?? null,
        derivedOption: r.derivedOption ?? null,
      })),
    );
  }
  /** Accepted mappings across the org for the same adapter: the "previously accepted" signal of MAP-1. */
  async mappingHistory(adapterCode: string, propertyId: string): Promise<MappingRow[]> {
    const rows = await rawRows<{
      rate_plan_id: string;
      ota_room_code: string;
      ota_rate_code: string;
      occupancy: string | null;
    }>(
      this.tx,
      sql`select m.rate_plan_id, m.ota_room_code, m.ota_rate_code, m.occupancy from channel_mapping m join channel_connection c on c.id = m.connection_id
        where c.adapter_code = ${adapterCode} and c.property_id = ${propertyId} and c.archived_at is not null`,
    );
    return rows.map((r) => ({
      ratePlanId: r.rate_plan_id,
      roomCode: r.ota_room_code,
      rateCode: r.ota_rate_code,
      ...(r.occupancy ? { occupancy: Number(r.occupancy) } : {}),
    }));
  }

  // ---- events and health (spec 07 §7.4) ----------------------------------------------

  async insertEvent(e: {
    id: string;
    connectionId: string | null;
    propertyId: string;
    type: string;
    severity: "info" | "p2" | "p1";
    message: string;
    payload?: Record<string, unknown>;
    occurredAt?: string;
  }): Promise<void> {
    await this.tx.insert(s.channelEvent).values({
      id: e.id,
      orgId: this.orgId,
      connectionId: e.connectionId,
      propertyId: e.propertyId,
      type: e.type,
      severity: e.severity,
      message: e.message,
      payload: e.payload ?? {},
      ...(e.occurredAt ? { occurredAt: e.occurredAt } : {}),
    });
  }
  async listEvents(
    opts: { connectionId?: string; propertyId?: string; limit?: number; openOnly?: boolean } = {},
  ): Promise<ChannelEventRow[]> {
    const rows = await this.tx
      .select()
      .from(s.channelEvent)
      .where(
        and(
          opts.connectionId ? eq(s.channelEvent.connectionId, opts.connectionId) : undefined,
          opts.propertyId ? eq(s.channelEvent.propertyId, opts.propertyId) : undefined,
          opts.openOnly ? isNull(s.channelEvent.acknowledgedAt) : undefined,
        ),
      )
      .orderBy(desc(s.channelEvent.occurredAt))
      .limit(opts.limit ?? 50);
    return rows.map((r) => ({
      id: r.id,
      connectionId: r.connectionId,
      propertyId: r.propertyId,
      type: r.type,
      severity: r.severity,
      message: r.message,
      payload: r.payload as Record<string, unknown>,
      occurredAt: r.occurredAt,
      acknowledgedAt: r.acknowledgedAt,
    }));
  }
  async acknowledgeEvent(id: string): Promise<void> {
    await this.tx
      .update(s.channelEvent)
      .set({ acknowledgedAt: sql`now()` })
      .where(eq(s.channelEvent.id, id));
  }

  /** One row per connection with the numbers the health board sorts on. */
  async health(): Promise<
    Array<
      ConnectionHealth &
        ConnectionRow & { bookings7d: number; bookings30d: number; unmappedBookings: number }
    >
  > {
    return rawRows(
      this.tx,
      sql`${this.connectionColumns()}, (c.readiness->>'ready')::boolean as ready,
        (select count(*)::int from rate_day r where r.property_id = c.property_id and r.sync_state = 'failed') as "failedCells",
        (select count(*)::int from rate_day r where r.property_id = c.property_id and r.sync_state in ('pending','in_flight')) as "pendingCells",
        (select count(*)::int from channel_event e where e.connection_id = c.id and e.severity = 'p1' and e.acknowledged_at is null) as "openP1",
        (select count(*)::int from channel_event e where e.connection_id = c.id and e.severity = 'p2' and e.acknowledged_at is null) as "openP2",
        (select count(*)::int from booking b where b.property_id = c.property_id and lower(b.ota_name) = lower(c.adapter_code) and b.created_at > now() - interval '7 days') as "bookings7d",
        (select count(*)::int from booking b where b.property_id = c.property_id and lower(b.ota_name) = lower(c.adapter_code) and b.created_at > now() - interval '30 days') as "bookings30d",
        (select count(*)::int from booking b where b.property_id = c.property_id and lower(b.ota_name) = lower(c.adapter_code) and b.mapping_state <> 'mapped') as "unmappedBookings"
        ${this.connectionFrom()} where c.archived_at is null`,
    );
  }
}
