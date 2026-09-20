const dedicatedMeasurementReuseDatabaseMessage =
  "Dedicated measurement media cannot share original bytes with another photo";

export const dedicatedMeasurementReuseMessage =
  "Dedicated measurement media cannot reuse another photo";

export function knownDatabaseConflictMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  if (String(error.code) !== "23514" || !("message" in error)) return null;
  return String(error.message).includes(dedicatedMeasurementReuseDatabaseMessage)
    ? dedicatedMeasurementReuseMessage
    : null;
}
