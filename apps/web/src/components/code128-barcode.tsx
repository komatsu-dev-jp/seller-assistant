import { encodeCode128Bits } from "../lib/code128";

const quietZone = 12;

export function Code128Barcode({ value, label }: { value: string; label: string }) {
  const bits = encodeCode128Bits(value);
  const bars = barRuns(bits);
  const width = bits.length + quietZone * 2;

  return (
    <svg
      className="code128Barcode"
      viewBox={`0 0 ${width} 48`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
    >
      <title>{label}</title>
      <rect width={width} height="48" fill="#fff" />
      {bars.map(({ start, length }) => (
        <rect key={start} x={start + quietZone} y="0" width={length} height="48" fill="#000" />
      ))}
    </svg>
  );
}

function barRuns(bits: string): Array<{ start: number; length: number }> {
  const runs: Array<{ start: number; length: number }> = [];
  let start = -1;

  for (let index = 0; index <= bits.length; index += 1) {
    if (bits[index] === "1" && start === -1) start = index;
    if (bits[index] !== "1" && start !== -1) {
      runs.push({ start, length: index - start });
      start = -1;
    }
  }

  return runs;
}
