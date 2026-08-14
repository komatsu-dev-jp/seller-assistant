import {
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import postgres from "postgres";
import type { LoginRequest } from "@resale/contracts";
import { createSignedSession, serializeSessionCookie } from "./session.js";

const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;
const HASH_LENGTH = 32;
const SALT_LENGTH = 16;
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_SECONDS = 15 * 60;
const BLOCK_SECONDS = 15 * 60;

export interface LoginResult {
  kind: "success" | "invalid" | "rate_limited";
  setCookie?: string;
  retryAfterSeconds?: number;
}

export interface LoginService {
  login(input: LoginRequest, requestFingerprint: string): Promise<LoginResult>;
  close(): Promise<void>;
}

export interface PasswordRecord {
  hash: Buffer;
  salt: Buffer;
  n: number;
  r: number;
  p: number;
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = randomBytes(SALT_LENGTH);
  return {
    hash: await derivePassword(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P),
    salt,
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  };
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  validateParameters(record);
  const actual = await derivePassword(password, record.salt, record.n, record.r, record.p);
  return actual.length === record.hash.length && timingSafeEqual(actual, record.hash);
}

export class PostgresLoginService implements LoginService {
  private readonly sql: postgres.Sql;
  private readonly dummyRecordPromise: Promise<PasswordRecord>;

  constructor(
    databaseUrl: string,
    private readonly sessionSecret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.sql = postgres(databaseUrl, { max: 2, idle_timeout: 20, connect_timeout: 10 });
    this.dummyRecordPromise = hashPassword("dummy-password-never-authenticates");
  }

  async login(input: LoginRequest, requestFingerprint: string): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const identifierHash = createHmac("sha256", this.sessionSecret)
      .update(`${email}\u0000${requestFingerprint}`, "utf8")
      .digest("hex");
    const now = this.now();

    const bucketRows = await this.sql<Array<{ blocked_until: Date | null }>>`
      select blocked_until from auth_login_bucket where identifier_hash = ${identifierHash}
    `;
    const blockedUntil = bucketRows[0]?.blocked_until;
    if (blockedUntil && blockedUntil.getTime() > now.getTime()) {
      return {
        kind: "rate_limited",
        retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000)),
      };
    }

    const rows = await this.sql<
      Array<{
        identity_id: string;
        password_hash: Buffer;
        password_salt: Buffer;
        scrypt_n: number;
        scrypt_r: number;
        scrypt_p: number;
      }>
    >`
      select identity_id, password_hash, password_salt, scrypt_n, scrypt_r, scrypt_p
      from auth_credential
      where email_normalized = ${email} and disabled_at is null
    `;
    const credential = rows[0];
    const record = credential
      ? {
          hash: credential.password_hash,
          salt: credential.password_salt,
          n: credential.scrypt_n,
          r: credential.scrypt_r,
          p: credential.scrypt_p,
        }
      : await this.dummyRecordPromise;
    const valid = await verifyPassword(input.password, record);
    if (!valid || !credential) {
      const result = await this.registerFailure(identifierHash, now);
      return result;
    }

    const sessionId = randomUUID();
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = issuedAt + SESSION_SECONDS;
    await this.sql.begin(async (transaction) => {
      await transaction`
        delete from auth_login_bucket where identifier_hash = ${identifierHash}
      `;
      await transaction`
        insert into auth_session (id, identity_id, issued_at, expires_at)
        values (${sessionId}, ${credential.identity_id}, ${new Date(issuedAt * 1000)}, ${new Date(expiresAt * 1000)})
      `;
    });
    const token = createSignedSession(
      { sessionId, identityId: credential.identity_id, issuedAt, expiresAt },
      this.sessionSecret,
    );
    return { kind: "success", setCookie: serializeSessionCookie(token, SESSION_SECONDS) };
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  private async registerFailure(identifierHash: string, now: Date): Promise<LoginResult> {
    const rows = await this.sql<Array<{ failed_count: number; blocked_until: Date | null }>>`
      insert into auth_login_bucket (
        identifier_hash, failed_count, window_started_at, blocked_until, updated_at
      ) values (${identifierHash}, 1, ${now}, null, ${now})
      on conflict (identifier_hash) do update set
        failed_count = case
          when auth_login_bucket.window_started_at < ${new Date(now.getTime() - FAILURE_WINDOW_SECONDS * 1000)}
            then 1
          else auth_login_bucket.failed_count + 1
        end,
        window_started_at = case
          when auth_login_bucket.window_started_at < ${new Date(now.getTime() - FAILURE_WINDOW_SECONDS * 1000)}
            then ${now}
          else auth_login_bucket.window_started_at
        end,
        blocked_until = case
          when (case
            when auth_login_bucket.window_started_at < ${new Date(now.getTime() - FAILURE_WINDOW_SECONDS * 1000)}
              then 1
            else auth_login_bucket.failed_count + 1
          end) >= ${MAX_FAILURES}
            then ${new Date(now.getTime() + BLOCK_SECONDS * 1000)}
          else null
        end,
        updated_at = ${now}
      returning failed_count, blocked_until
    `;
    const blockedUntil = rows[0]?.blocked_until;
    return blockedUntil
      ? { kind: "rate_limited", retryAfterSeconds: BLOCK_SECONDS }
      : { kind: "invalid" };
  }
}

async function derivePassword(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  const derived = await new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      password.normalize("NFKC"),
      salt,
      HASH_LENGTH,
      { N: n, r, p, maxmem: SCRYPT_MAX_MEMORY },
      (error, value) => {
        if (error) reject(error);
        else resolve(value);
      },
    );
  });
  return derived;
}

function validateParameters(record: PasswordRecord): void {
  if (
    record.hash.length !== HASH_LENGTH ||
    record.salt.length < SALT_LENGTH ||
    record.n !== SCRYPT_N ||
    record.r !== SCRYPT_R ||
    record.p !== SCRYPT_P
  ) {
    throw new Error("Stored password parameters do not meet the security floor");
  }
}

export const passwordSecurityProfile = Object.freeze({
  algorithm: "scrypt-v1",
  n: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  saltBytes: SALT_LENGTH,
  hashBytes: HASH_LENGTH,
  maxFailures: MAX_FAILURES,
  blockSeconds: BLOCK_SECONDS,
});
