import { APPDATA_POLICY } from "../fixtures/contracts.ts";
import { sha256Hex } from "./protocol.ts";

export class ContractError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

interface RefreshRecord {
  tokenHash: string;
  subject: string;
  sessionId: string;
  expiresAt: number;
  rotatedAt?: number;
  revokedAt?: number;
}

export class RefreshTokenStore {
  readonly records = new Map<string, RefreshRecord>();

  async issue(
    token: string,
    subject: string,
    sessionId: string,
    expiresAt: number,
  ): Promise<void> {
    const tokenHash = await sha256Hex(token);
    this.records.set(tokenHash, { tokenHash, subject, sessionId, expiresAt });
  }

  async rotate(
    oldToken: string,
    nextToken: string,
    nextSessionId: string,
    now: number,
    expiresAt: number,
  ): Promise<RefreshRecord> {
    const oldHash = await sha256Hex(oldToken);
    const record = this.records.get(oldHash);
    if (
      !record || record.rotatedAt !== undefined ||
      record.revokedAt !== undefined
    ) {
      throw new ContractError("refresh_token_replay");
    }
    if (record.expiresAt <= now) {
      throw new ContractError("refresh_token_expired");
    }
    record.rotatedAt = now;
    await this.issue(nextToken, record.subject, nextSessionId, expiresAt);
    return { ...record };
  }

  async revoke(token: string, now: number): Promise<void> {
    const record = this.records.get(await sha256Hex(token));
    if (
      !record || record.rotatedAt !== undefined ||
      record.revokedAt !== undefined
    ) {
      throw new ContractError("refresh_token_replay");
    }
    record.revokedAt = now;
  }
}

export interface SealedMessageInput {
  senderUserId: string;
  recipientMailboxToken: string;
  deliveryToken: string;
  deliveryClass: "message" | "control";
  sealedEnvelope: Record<string, unknown>;
}

interface StoredMessage extends SealedMessageInput {
  id: string;
  ownerUserId: string;
  status: "pending" | "delivered" | "read";
  sequence: number;
  createdAt: number;
  expiresAt: number;
  deliveredAt?: number;
  readAt?: number;
}

export class SealedRelay {
  readonly messages = new Map<string, StoredMessage>();
  readonly mailboxOwners = new Map<string, string>();
  private readonly deliveryIds = new Map<string, string>();
  private sequence = 0;

  registerMailbox(userId: string, token: string): void {
    if (!userId || !/^smbx[12]\.\S{8,}$/u.test(token)) {
      throw new ContractError("invalid_request");
    }
    const owner = this.mailboxOwners.get(token);
    if (owner && owner !== userId) {
      throw new ContractError("unauthorized_mailbox");
    }
    this.mailboxOwners.set(token, userId);
  }

  send(
    input: SealedMessageInput,
    now: number,
    ttlMs = 24 * 60 * 60 * 1000,
  ): StoredMessage & { replayed: boolean } {
    if (
      !input.senderUserId ||
      !/^sdv1\.[A-Za-z0-9+/]{43}=$/u.test(input.deliveryToken) ||
      !this.mailboxOwners.has(input.recipientMailboxToken) ||
      ttlMs <= 0 ||
      JSON.stringify(input.sealedEnvelope).length > 64 * 1024
    ) throw new ContractError("invalid_request");
    const existingId = this.deliveryIds.get(input.deliveryToken);
    if (existingId) {
      const existing = this.messages.get(existingId)!;
      if (fingerprint(existing) !== fingerprint(input)) {
        throw new ContractError("duplicate_delivery_token");
      }
      return {
        ...existing,
        sealedEnvelope: { ...existing.sealedEnvelope },
        replayed: true,
      };
    }
    const ownerUserId = this.mailboxOwners.get(input.recipientMailboxToken)!;
    const stored: StoredMessage = {
      ...input,
      sealedEnvelope: { ...input.sealedEnvelope },
      id: `message-${++this.sequence}`,
      ownerUserId,
      status: "pending",
      sequence: this.sequence,
      createdAt: now,
      expiresAt: now + ttlMs,
    };
    this.messages.set(stored.id, stored);
    this.deliveryIds.set(stored.deliveryToken, stored.id);
    return { ...stored, replayed: false };
  }

  fetch(
    userId: string,
    now: number,
    afterSequence = 0,
    limit = 100,
  ): StoredMessage[] {
    if (limit < 1 || limit > 100) throw new ContractError("invalid_request");
    return [...this.messages.values()]
      .filter((message) =>
        message.ownerUserId === userId &&
        message.expiresAt > now &&
        message.sequence > afterSequence
      )
      .sort((left, right) => left.sequence - right.sequence)
      .slice(0, limit)
      .map((message) => ({
        ...message,
        sealedEnvelope: { ...message.sealedEnvelope },
      }));
  }

  mark(
    userId: string,
    id: string,
    status: "delivered" | "read",
    now: number,
  ): StoredMessage {
    const message = this.messages.get(id);
    if (!message) throw new ContractError("message_not_found");
    if (message.ownerUserId !== userId) {
      throw new ContractError("unauthorized_mailbox");
    }
    if (status === "delivered" && message.status === "pending") {
      message.status = "delivered";
      message.deliveredAt = now;
    }
    if (status === "read") {
      message.status = "read";
      message.deliveredAt ??= now;
      message.readAt ??= now;
    }
    return { ...message, sealedEnvelope: { ...message.sealedEnvelope } };
  }

  receipt(senderUserId: string, id: string, deliveryToken: string):
    | Pick<
      StoredMessage,
      "id" | "status" | "deliveredAt" | "readAt"
    >
    | null {
    const message = this.messages.get(id);
    if (
      !message || message.senderUserId !== senderUserId ||
      message.deliveryToken !== deliveryToken
    ) return null;
    return {
      id: message.id,
      status: message.status,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
    };
  }

  delete(userId: string, ids: readonly string[]): number {
    let deleted = 0;
    for (const id of new Set(ids)) {
      const message = this.messages.get(id);
      if (!message) continue;
      if (message.ownerUserId !== userId) {
        throw new ContractError("unauthorized_mailbox");
      }
      this.messages.delete(id);
      deleted++;
    }
    return deleted;
  }
}

interface ObjectRecord {
  ref: string;
  owner: string;
  size: number;
  state: "pending" | "active" | "deleted";
  bytes?: Uint8Array;
}

interface SignedCapability {
  operation: "upload" | "download";
  ref: string;
  expiresAt: number;
  used: boolean;
}

export class SignedObjectStore {
  readonly records = new Map<string, ObjectRecord>();
  readonly capabilities = new Map<string, SignedCapability>();
  private counter = 0;

  signUpload(owner: string, size: number, now: number, ttlMs = 5 * 60 * 1000): {
    objectRef: string;
    method: "PUT";
    token: string;
    expiresAt: number;
  } {
    if (!owner || size < 1 || size > 25 * 1024 * 1024) {
      throw new ContractError("invalid_object_request");
    }
    const objectRef = `spectra://objects/users/${owner}/object-${++this
      .counter}.enc`;
    const token = this.capability("upload", objectRef, now + ttlMs);
    this.records.set(objectRef, {
      ref: objectRef,
      owner,
      size,
      state: "pending",
    });
    return { objectRef, method: "PUT", token, expiresAt: now + ttlMs };
  }

  put(token: string, bytes: Uint8Array, now: number): void {
    const capability = this.useCapability(token, "upload", now);
    const record = this.records.get(capability.ref)!;
    if (record.state !== "pending" || bytes.byteLength !== record.size) {
      throw new ContractError("invalid_object_request");
    }
    record.bytes = bytes.slice();
    record.state = "active";
  }

  signDownload(
    owner: string,
    objectRef: string,
    now: number,
    ttlMs = 5 * 60 * 1000,
  ): {
    method: "GET";
    token: string;
    expiresAt: number;
  } {
    const record = this.records.get(objectRef);
    if (!record || record.owner !== owner || record.state !== "active") {
      throw new ContractError("unauthorized");
    }
    return {
      method: "GET",
      token: this.capability("download", objectRef, now + ttlMs),
      expiresAt: now + ttlMs,
    };
  }

  get(token: string, now: number): Uint8Array {
    const capability = this.capabilities.get(token);
    if (
      !capability || capability.operation !== "download" ||
      capability.expiresAt <= now
    ) {
      throw new ContractError("unauthorized");
    }
    const record = this.records.get(capability.ref);
    if (!record || record.state !== "active" || !record.bytes) {
      throw new ContractError("unauthorized");
    }
    return record.bytes.slice();
  }

  delete(owner: string, objectRef: string): void {
    const record = this.records.get(objectRef);
    if (!record || record.owner !== owner || record.state === "deleted") {
      throw new ContractError("unauthorized");
    }
    record.state = "deleted";
    record.bytes = undefined;
  }

  private capability(
    operation: "upload" | "download",
    ref: string,
    expiresAt: number,
  ): string {
    const token = `opaque-${operation}-${++this.counter}`;
    this.capabilities.set(token, { operation, ref, expiresAt, used: false });
    return token;
  }

  private useCapability(
    token: string,
    operation: "upload",
    now: number,
  ): SignedCapability {
    const capability = this.capabilities.get(token);
    if (
      !capability ||
      capability.operation !== operation ||
      capability.used ||
      capability.expiresAt <= now
    ) throw new ContractError("unauthorized");
    capability.used = true;
    return capability;
  }
}

export function canAccessAppData(
  table: string,
  action: string,
  authenticatedUser: string,
  ownerUser: string,
): boolean {
  const actions = APPDATA_POLICY[table as keyof typeof APPDATA_POLICY] as
    | readonly string[]
    | undefined;
  if (!actions?.includes(action) || !authenticatedUser) return false;
  return authenticatedUser === ownerUser;
}

export function requireAdminRole(
  claims: Record<string, unknown>,
  role = "spectra_admin",
): void {
  const metadata = claims.app_metadata;
  if (!metadata || typeof metadata !== "object") {
    throw new ContractError("forbidden");
  }
  const record = metadata as Record<string, unknown>;
  const roles = Array.isArray(record.roles) ? record.roles : [record.role];
  if (!roles.includes(role)) throw new ContractError("forbidden");
}

export class AccountDeletionStore {
  readonly jobs = new Map<
    string,
    { status: "pending" | "completed"; stage: string; tokenHash: string }
  >();

  async start(
    userId: string,
    confirmation: string,
    operationToken: string,
  ): Promise<void> {
    if (!userId || confirmation !== "DELETE") {
      throw new ContractError("invalid_confirmation");
    }
    if (operationToken.length < 32) {
      throw new ContractError("invalid_operation_token");
    }
    const tokenHash = await sha256Hex(operationToken);
    this.jobs.set(tokenHash, {
      status: "pending",
      stage: "objects",
      tokenHash,
    });
  }

  async status(
    operationToken: string,
  ): Promise<{ status: string; stage: string }> {
    const job = this.jobs.get(await sha256Hex(operationToken));
    if (!job) throw new ContractError("deletion_status_unavailable");
    return { status: job.status, stage: job.stage };
  }

  async complete(operationToken: string): Promise<void> {
    const job = this.jobs.get(await sha256Hex(operationToken));
    if (!job) throw new ContractError("deletion_status_unavailable");
    job.status = "completed";
    job.stage = "done";
  }
}

export class FixedWindowLimiter {
  readonly counts = new Map<string, number>();

  constructor(readonly limit: number, readonly windowMs: number) {
    if (limit < 1 || windowMs < 1) throw new Error("invalid rate limit");
  }

  async allow(rawKey: string, now: number): Promise<boolean> {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const key = `${await sha256Hex(rawKey)}:${windowStart}`;
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return count <= this.limit;
  }
}

export class RealtimeProtocol {
  private readonly pending = new Set<string>();
  private readonly subscribed = new Set<string>();
  private reconnectAttempts = 0;

  open(
    subscriptions: readonly { subscriberId: string; topic: string }[],
  ): Record<string, string>[] {
    this.pending.clear();
    const outbound: Record<string, string>[] = [];
    for (const subscription of subscriptions) {
      if (!/^sealed_(mailbox|receipt):\S{8,}$/u.test(subscription.topic)) {
        throw new ContractError("invalid_topic");
      }
      this.pending.add(subscription.topic);
      outbound.push({
        subscriberId: subscription.subscriberId,
        topic: subscription.topic,
      });
    }
    return outbound;
  }

  receive(
    message: unknown,
  ): {
    kind: "ack" | "event";
    topic: string;
    event?: string;
    payload?: unknown;
  } {
    if (!message || typeof message !== "object") {
      throw new ContractError("invalid_websocket_message");
    }
    const value = message as Record<string, unknown>;
    if (
      value.type === "subscribed" && typeof value.topic === "string" &&
      this.pending.has(value.topic)
    ) {
      this.pending.delete(value.topic);
      this.subscribed.add(value.topic);
      this.reconnectAttempts = 0;
      return { kind: "ack", topic: value.topic };
    }
    if (
      value.type === "event" &&
      typeof value.topic === "string" &&
      typeof value.event === "string" &&
      this.subscribed.has(value.topic)
    ) {
      return {
        kind: "event",
        topic: value.topic,
        event: value.event,
        payload: value.payload,
      };
    }
    throw new ContractError("invalid_websocket_message");
  }

  close(expected: boolean): number | null {
    this.pending.clear();
    this.subscribed.clear();
    if (expected) return null;
    const attempt = this.reconnectAttempts++;
    return Math.min(30_000, 1_000 * (2 ** attempt));
  }
}

function fingerprint(input: SealedMessageInput): string {
  return JSON.stringify([
    input.senderUserId,
    input.recipientMailboxToken,
    input.deliveryClass,
    input.sealedEnvelope,
  ]);
}
