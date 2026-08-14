import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import * as readline from "node:readline";
import postgres from "postgres";
import { z } from "zod";
import { hashPassword } from "./auth.js";

const ownerInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(1).max(120),
  workspaceName: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
});

export type OwnerBootstrapInput = z.infer<typeof ownerInputSchema>;

export async function bootstrapInitialOwner(
  databaseUrl: string,
  rawInput: OwnerBootstrapInput,
): Promise<void> {
  const input = ownerInputSchema.parse(rawInput);
  const credential = await hashPassword(input.password);
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  try {
    await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(2026081501)`;
      const existing = await transaction<Array<{ count: number }>>`
        select count(*)::integer as count from auth_credential
      `;
      if ((existing[0]?.count ?? 0) !== 0) {
        throw new Error("Initial owner already exists");
      }
      const identityId = randomUUID();
      const workspaceId = randomUUID();
      await transaction`
        insert into app_identity (id, display_name)
        values (${identityId}, ${input.displayName})
      `;
      await transaction`
        insert into workspace (id, name)
        values (${workspaceId}, ${input.workspaceName})
      `;
      await transaction`
        insert into workspace_membership (workspace_id, identity_id, role, active)
        values (${workspaceId}, ${identityId}, 'owner', true)
      `;
      await transaction`
        insert into auth_credential (
          identity_id, email_normalized, password_hash, password_salt,
          hash_algorithm, scrypt_n, scrypt_r, scrypt_p
        ) values (
          ${identityId}, ${input.email}, ${credential.hash}, ${credential.salt},
          'scrypt-v1', ${credential.n}, ${credential.r}, ${credential.p}
        )
      `;
    });
  } finally {
    credential.hash.fill(0);
    credential.salt.fill(0);
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive terminal is required");
  }
  const email = await promptLine("オーナーのメールアドレス: ");
  const displayName = await promptLine("表示名: ");
  const workspaceName = await promptLine("事業所名: ");
  const password = await promptLine("パスワード（12〜128文字）: ", true);
  const confirmation = await promptLine("パスワードを再入力: ", true);
  if (password !== confirmation) throw new Error("Passwords do not match");
  await bootstrapInitialOwner(databaseUrl, { email, displayName, workspaceName, password });
  process.stdout.write("初期オーナーを1人作成しました。入力値や秘密値は表示していません。\n");
}

function promptLine(label: string, hidden = false): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const output = process.stdout;
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    output.write(label);

    const cleanup = () => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
    };
    const onKeypress = (character: string | undefined, key: readline.Key) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        output.write("\n");
        reject(new Error("Cancelled"));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup();
        output.write("\n");
        resolve(value);
        return;
      }
      if (key.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write("\b \b");
        }
        return;
      }
      if (character && !key.ctrl && !key.meta && !key.sequence?.startsWith("\u001b")) {
        value += character;
        output.write(hidden ? "•" : character);
      }
    };
    input.on("keypress", onKeypress);
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch(() => {
    process.stderr.write(
      "初期オーナーを作成できませんでした。DB接続、未作成状態、入力条件を確認してください。\n",
    );
    process.exitCode = 1;
  });
}
