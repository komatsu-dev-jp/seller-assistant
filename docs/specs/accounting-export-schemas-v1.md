# 会計CSV出力schema正本 v1

- 状態: 修正版AのGoal再確認待ち
- 更新日: 2026-08-20（JST）
- 用途: serializer（CSVを決めた並びのbytesへ変換する処理）と検査を再現可能にする

## 1. 固定ファイルとSHA-256

| adapter | schema | SHA-256 | fixture | SHA-256 |
|---|---|---|---|---|
| `money_forward_journal_v1.0.0` | `docs/specs/accounting-export/money-forward-journal-v1.schema.json` | `DA96302338DA7B2B923D34D956CB2CA03D6BEC0BFCCE156BBDDDF0A32B8D439E` | `docs/specs/accounting-export/money-forward-journal-v1.fixture.json` | `21C8248D9FC3CA378ED8B08F5C267DC031D65BF49CD3A04E41B8942236D22A56` |
| `generic_journal_v1.0.0` | `docs/specs/accounting-export/generic-journal-v1.schema.json` | `4898686E474542030045300DA0AC9073B776DF1FC13CEA380D4B721359BC7308` | `docs/specs/accounting-export/generic-journal-v1.fixture.json` | `BD113544F4A98795707A833E4D5C7BB08FFF90C6AFB9F0E96AC691CB427D3615` |

実装時はこの4ファイルを読んでschema/fixtureを検証し、hashが異なればtestを停止する。仕様変更時は既存fileを黙って上書きせず、新versionと新hashを追加する。

## 2. Money Forward向けadapter

公式ガイド（2026-08-20確認、ページ更新日2026-07-09）はA〜AAの27列を示す。以前の25列理解はZ「最終更新日時」とAA「最終更新者」が欠けていたため採用しない。

公式根拠: https://biz.moneyforward.com/support/account/guide/import-books/ib01.html

列順は次のとおりで、headerを変更しない。

1. 取引No
2. 取引日
3. 借方勘定科目
4. 借方補助科目
5. 借方部門
6. 借方取引先
7. 借方税区分
8. 借方インボイス
9. 借方金額(円)
10. 借方税額
11. 貸方勘定科目
12. 貸方補助科目
13. 貸方部門
14. 貸方取引先
15. 貸方税区分
16. 貸方インボイス
17. 貸方金額(円)
18. 貸方税額
19. 摘要
20. 仕訳メモ
21. タグ
22. MF仕訳タイプ
23. 決算整理仕訳
24. 作成日時
25. 作成者
26. 最終更新日時
27. 最終更新者

正確な必須条件、上限、許容値、複合仕訳規則はschema JSONへ固定した。公式上はインボイス等が空欄でも既定値で取込まれ得るが、本アプリは推測を避けるため、借方/貸方がある行では人が承認した税区分・インボイス区分を明示しない限り出力しない。税額は空欄または0、P0の作成/更新情報4列と決算整理仕訳は空欄にする。

公式ページは文字コード、BOM、改行、quote方法を明示していないため、「公式がUTF-8 BOMを指定した」とは表記しない。本adapterの決定的な出力契約としてUTF-8 BOM、CRLF、カンマ区切り、必要時だけ二重quote、内部quoteの二重化、最終CRLFありを採用する。Money Forward実画面での手動取込互換性はユーザー確認項目であり、未確認ならDraft PRへそのまま記載する。取込が失敗した場合は推測で別encodingへ自動再出力せず、公式sample bytesを本人が取得して新versionとして再承認する。

## 3. 汎用adapter

汎用CSVは本アプリが所有する19列の契約であり、Money Forward列を流用しない。列はbatch/source、取引日、借方/貸方の科目・補助・税/インボイス・円金額、説明、根拠参照、mapping/formula版、人の確認者/日時である。住所、氏名、秘密、証憑本文を含めない。

文字コード等はMoney Forward向けと同じ決定的なserializer規則を使うが、header/列数/検査は別schemaとする。他の会計ソフトへそのまま取込めるとは表示せず、利用者または税理士が加工・mappingするための一般的な受渡し形式と明記する。

## 4. 重複規則

- 同じbatch内の重複source ID、重複row、同じidempotency keyで異なるpayloadはhard blockし、CSV bytesを0件にする。
- 過去batchと同じsource集合またはhashの再出力/再取込は警告するだけでは続行できない。人の明示確認、新しいbatch ID、元batchへの`supersedes`参照を必須にする。
- 無確認の再実行は拒否する。過去batchは変更・削除せず、`voided|superseded`を追記する。
- Money Forward公式は再importのたびに新しい仕訳が登録され、既存仕訳を更新しないと案内しているため、取込結果確認前の同一source再importを特に強く停止する。

## 5. 実装時の必須test

1. 4fileのSHA-256が本書と一致する。
2. header数、順序、fixture行の列数がschemaと一致する。
3. UTF-8 BOM、CRLF、delimiter、quote、最終CRLFをbytes単位で比較する。
4. 必須、最大文字数、日付、円整数、税/インボイス、複合仕訳貸借一致の境界値を確認する。
5. 同一batch重複はbytes 0件、過去batch重複は明示確認なしでbytes 0件となる。
6. Money Forward向けと汎用adapterのheader/schemaを取り違えた要求を拒否する。
7. fixtureは架空データだけで、住所、個人情報、秘密、実税務資料0件である。
