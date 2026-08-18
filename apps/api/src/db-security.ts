import postgres from "postgres";

export async function assertRestrictedDatabaseRole(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {
    const rows = await sql<
      Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; has_runtime: boolean }>
    >`
      select role.rolname,
             role.rolsuper,
             role.rolbypassrls,
             pg_has_role(current_user, 'resale_app_runtime', 'member') as has_runtime
      from pg_roles role
      where role.rolname = current_user
    `;
    const role = rows[0];
    if (!role || role.rolsuper || role.rolbypassrls || !role.has_runtime) {
      throw new Error(
        "DATABASE_URL must use a restricted LOGIN role granted resale_app_runtime without SUPERUSER or BYPASSRLS",
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
