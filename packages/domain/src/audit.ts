const forbiddenKeys = new Set([
  "address",
  "postalCode",
  "token",
  "cookie",
  "receiptBody",
  "aiPrompt",
  "aiResponse",
  "password",
  "secret",
]);

export interface AuditEvent {
  workspaceId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: string;
  fieldNames: string[];
  redactedChanges: Record<string, "changed" | "added" | "removed">;
  referenceIds: string[];
}

export function assertSafeAuditEvent(event: AuditEvent): void {
  const keys = [
    ...event.fieldNames,
    ...Object.keys(event.redactedChanges),
    ...Object.keys(event as unknown as Record<string, unknown>),
  ];
  const violation = keys.find((key) => forbiddenKeys.has(key));
  if (violation) throw new Error(`Audit event contains forbidden field: ${violation}`);

  const serialized = JSON.stringify(event).toLowerCase();
  const forbiddenValuePatterns = ["bearer ", "session=", "-----begin private key-----"];
  if (forbiddenValuePatterns.some((pattern) => serialized.includes(pattern))) {
    throw new Error("Audit event contains a secret-shaped value");
  }
}
