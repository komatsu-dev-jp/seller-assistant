import { hasValidCodeCheckDigit } from "@resale/contracts";

const inventoryNumberPattern = /^INV-([0-9]{6})-[0-9]$/u;
const shortNumberPattern = /^[0-9]{4,6}$/u;
const barcodePayloadPattern = /^RESALE\|(INV-[0-9]{6}-[0-9])\|V([1-9][0-9]{0,3})$/u;

export type InventoryBarcodePayload = {
  inventoryNumber: string;
  labelVersion: number;
};

export type InventoryLookup =
  | { kind: "barcode"; inventoryNumber: string; labelVersion: number }
  | { kind: "full"; inventoryNumber: string }
  | { kind: "short"; shortNumber: string };

export function shortInventoryNumber(inventoryNumber: string): string {
  const match = inventoryNumber.trim().toUpperCase().match(inventoryNumberPattern);
  if (!match?.[1] || !hasValidCodeCheckDigit(inventoryNumber)) {
    throw new Error("正しい在庫管理番号を確認できません。");
  }

  const withoutLeadingZeroes = match[1].replace(/^0+(?=[0-9])/u, "");
  return withoutLeadingZeroes.padStart(4, "0");
}

export function buildInventoryBarcodePayload(
  inventoryNumber: string,
  labelVersion: number,
): string {
  const normalized = inventoryNumber.trim().toUpperCase();
  if (
    !inventoryNumberPattern.test(normalized) ||
    !hasValidCodeCheckDigit(normalized) ||
    !Number.isSafeInteger(labelVersion) ||
    labelVersion < 1 ||
    labelVersion > 10_000
  ) {
    throw new Error("バーコードに使える在庫情報ではありません。");
  }

  return `RESALE|${normalized}|V${labelVersion}`;
}

export function parseInventoryBarcodePayload(value: string): InventoryBarcodePayload | null {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(barcodePayloadPattern);
  if (!match?.[1] || !match[2] || !hasValidCodeCheckDigit(match[1])) return null;

  const labelVersion = Number(match[2]);
  if (!Number.isSafeInteger(labelVersion) || labelVersion > 10_000) return null;
  return { inventoryNumber: match[1], labelVersion };
}

export function parseInventoryLookup(value: string): InventoryLookup | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 64) return null;

  const payload = parseInventoryBarcodePayload(normalized);
  if (payload) return { kind: "barcode", ...payload };

  if (inventoryNumberPattern.test(normalized) && hasValidCodeCheckDigit(normalized)) {
    return { kind: "full", inventoryNumber: normalized };
  }

  if (shortNumberPattern.test(normalized)) {
    return { kind: "short", shortNumber: normalized.replace(/^0+(?=[0-9])/u, "") };
  }

  return null;
}
