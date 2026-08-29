import JsBarcode from "jsbarcode";

type BarcodeEncoding = { data: string };
type BarcodeTarget = { encodings?: BarcodeEncoding[] };

export function encodeCode128Bits(value: string): string {
  if (!value || value.length > 64 || !/^[\x20-\x7E]+$/u.test(value)) {
    throw new Error("バーコードに変換できない文字が含まれています。");
  }

  const target: BarcodeTarget = {};
  JsBarcode(target, value, {
    format: "CODE128",
    displayValue: false,
    margin: 0,
  });
  const bits = target.encodings?.map((encoding) => encoding.data).join("") ?? "";
  if (!/^[01]+$/u.test(bits)) throw new Error("バーコードを作成できませんでした。");
  return bits;
}
