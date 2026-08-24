export type PilotCorrection = {
  detailCode: string;
  message: string;
};

const corrections: ReadonlyMap<string, PilotCorrection> = new Map([
  [
    "The pilot requires the generated four current image roles",
    {
      detailCode: "pilot_image_role_correction",
      message: "固定画像が不足しています。4種類の写真を原本どおりに選び直して保存してください。",
    },
  ],
  [
    "A current pilot image does not match the fixture manifest",
    {
      detailCode: "pilot_image_fixture_correction",
      message:
        "固定画像と一致しません。正面・背面・ブランドタグ・品質表示を原本どおりに選び直して保存してください。",
    },
  ],
  [
    "The pilot measurement set is incomplete or unexpected",
    {
      detailCode: "pilot_measurement_set_correction",
      message:
        "採寸項目が不足または不一致です。表示されたカテゴリ別の全項目だけを確認して入力し直してください。",
    },
  ],
  [
    "A current pilot measurement does not match the fixture profile",
    {
      detailCode: "pilot_measurement_value_correction",
      message:
        "採寸値が固定値と一致しません。測定位置・単位・値を人が確認して入力し直してください。",
    },
  ],
  [
    "The confirmed pilot attributes do not match the fixture",
    {
      detailCode: "pilot_attribute_value_correction",
      message: "ブランド・サイズ・色が固定値と一致しません。タグ写真を見て人が訂正してください。",
    },
  ],
  [
    "The confirmed pilot attributes lack tag evidence",
    {
      detailCode: "pilot_attribute_evidence_correction",
      message:
        "属性の根拠写真がブランドタグまたは品質表示ではありません。タグ写真を選び直して人が訂正してください。",
    },
  ],
]);

export function recoverablePilotCorrection(
  status: number,
  message: string,
  protocolVersion: string | null,
  hasActiveItem: boolean,
): PilotCorrection | null {
  if (status !== 409 || protocolVersion !== "listing_prep_pilot_v1.1.0" || !hasActiveItem) {
    return null;
  }
  return corrections.get(message) ?? null;
}
