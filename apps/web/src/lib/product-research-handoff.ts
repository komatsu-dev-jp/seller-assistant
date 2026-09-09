import type { ProductResearchResponse } from "@resale/contracts";

type ResearchInput = Pick<ProductResearchResponse, "confirmedAttributes" | "candidates">;

export function normalizeSearchTerms(value: string): string {
  return [
    ...new Map(
      value
        .normalize("NFKC")
        .trim()
        .split(/\s+/u)
        .filter(Boolean)
        .map((word) => [word.toLowerCase(), word]),
    ).values(),
  ].join(" ");
}

export function buildResearchSearchTerms(research: ResearchInput): string {
  const confirmed = research.confirmedAttributes;
  const values = confirmed
    ? [confirmed.brand, confirmed.sizeLabel, confirmed.color]
    : [...research.candidates]
        .filter((candidate) => candidate.status !== "rejected")
        .sort((a, b) => a.candidateId.localeCompare(b.candidateId))
        .flatMap((candidate) => [
          candidate.brandCandidate,
          candidate.modelCandidate,
          candidate.sizeCandidate,
          candidate.colorCandidate,
          candidate.materialCandidate,
        ]);
  return normalizeSearchTerms(values.filter(Boolean).join(" "));
}

export function buildMercariSearchUrl(terms: string): string | null {
  const normalized = normalizeSearchTerms(terms);
  return normalized
    ? `https://jp.mercari.com/search?keyword=${encodeURIComponent(normalized)}`
    : null;
}

export function buildCodexResearchQuestion(terms: string): string {
  return `次の商品検索語を手がかりに、販売価格の調査を手伝ってください。\n検索語（編集可能な候補・商品同定は要確認）: ${normalizeSearchTerms(terms)}\n販売済みか、型番・サイズ・状態・送料が比較可能かを区別し、出典URLと確認日、不明点を示してください。\n未確認の価格を確定扱いせず、予想価格は候補として提示してください。根拠不足なら明記してください。最終価格は人が確認します。\n自動出品・価格反映・ログイン・Cookie共有は行わないでください。`;
}

export async function copyResearchText(
  value: string,
  writeText: (text: string) => Promise<void>,
): Promise<boolean> {
  if (!value.trim()) return false;
  try {
    await writeText(value);
    return true;
  } catch {
    return false;
  }
}
