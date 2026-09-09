export function csvCell(value: string): string {
  let prefixIndex = 0;
  while (prefixIndex < value.length) {
    const character = value[prefixIndex] ?? "";
    const codePoint = character.charCodeAt(0);
    const isControl = codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
    if (!isControl && !/\s/u.test(character)) break;
    prefixIndex += 1;
  }
  const firstContentCharacter = value[prefixIndex];
  const textOnlyValue =
    firstContentCharacter !== undefined && "=+-@".includes(firstContentCharacter)
      ? `'${value}`
      : value;
  return `"${textOnlyValue.replaceAll('"', '""')}"`;
}
