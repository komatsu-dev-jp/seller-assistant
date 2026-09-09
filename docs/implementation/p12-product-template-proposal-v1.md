# P12-B 商品種類別の検品・撮影・採寸項目案 v1

- 状態: 提案。利用者確認前であり、DB初期データ・API・画面動作へ反映しない
- 作成日: 2026-08-29（JST）
- 対象: シャツ、ニット、アウター、パンツ／スカート、ワンピース、バッグ
- 目的: 承認済みPC13の件数、mobile20の8撮影、写真v6の5分類を、実運用で矛盾しない一つの契約へする

## 確認してほしいこと

1. 撮影は、推奨A「購入判断に必要な最低限の細部も必須」と、代替B「細部は任意」のどちらにするか。
2. 画面の入口は承認済みどおり「パンツ／スカート」1つのままにし、次の画面でパンツかスカートを選んで別の項目へ分けてよいか。推奨は「分ける」。

## 共通ルール

- `R`は必須、`O`は商品に該当するときに使う任意、`C`は「気になる点あり」のときだけ必須。
- 検品は各項目を「未確認／問題なしを確認／気になる点あり」の3択にする。
- 「気になる点あり」はP12-Aの追記履歴へ保存し、写真やAIだけでは確定しない。
- 英字のkeyはアプリ内部だけで使い、利用者には日本語だけを見せる。
- PC13の表示件数はR/O/Cを含む全項目数。通常の残り件数には、その商品で適用されたRだけを数える。
- 写真の具体的な撮影項目を`shot_key`、既存機能と写真一覧で使う5分類を`front / back / brand_tag / care_label / flaw`とする。1分類に複数の撮影項目を保存できる。
- `気になる箇所`はPC13の表示件数には含めるが、通常商品の完了分母へ含めない。見える気になる点が登録された場合だけ必須。においだけの場合は写真を強制しない。

## 件数の正本

| 商品種類         | 検品 | 撮影 | 採寸 |
| ---------------- | ---: | ---: | ---: |
| シャツ           |   15 |    8 |    6 |
| ニット           |   14 |    7 |    5 |
| アウター         |   18 |   10 |    7 |
| パンツ／スカート |   16 |    8 |    6 |
| ワンピース       |   17 |    9 |    6 |
| バッグ           |   16 |    9 |    7 |

## シャツ

### 検品15件

1. R 状態全体 `overall_condition`
2. R 使用感・色あせ `wear_fading`
3. R 汚れ・シミ `stains`
4. R 傷・穴 `damage_holes`
5. R 毛玉・毛羽立ち `pilling_fuzz`
6. R ほつれ・糸の飛び出し `fraying_threads`
7. R 襟・首まわり `collar_neck`
8. R 袖・袖口 `sleeves_cuffs`
9. R 裾 `hem`
10. R 縫い目 `seams`
11. R ブランド・サイズ表示 `brand_size_label`
12. R 品質・素材表示 `care_content_label`
13. O ボタン・留め具 `buttons_fasteners`
14. O プリント・ロゴ・刺繍 `print_logo_embroidery`
15. O ポケット `pockets`

### 撮影8件

1. R 正面全体 `overall_front` → `front`
2. R 背面全体 `overall_back` → `back`
3. R ブランド・サイズ表示 `brand_size_label` → `brand_tag`
4. R 品質表示 `care_label` → `care_label`
5. R 襟元 `collar_detail` → `front`
6. R 袖・袖口 `cuff_detail` → `front`
7. R 裾 `hem_detail` → `back`
8. C 気になる箇所 `visible_concern_detail` → `flaw`

### 採寸6件

1. R 肩幅 `shoulder_width`
2. R 身幅 `chest_width`
3. R 着丈 `body_length`
4. R 袖丈 `sleeve_length`
5. O／形状条件 裄丈 `yuki_length`
6. O 裾幅 `hem_width`

ラグラン袖では肩幅・袖丈を対象外にし、裄丈を必須へ切り替える。既存`tops_standard_v1`の4項目は変更しない。

## ニット

### 検品14件

1. R 状態全体 `overall_condition`
2. R 型崩れ・伸び `shape_loss_wear`
3. R 汚れ・シミ `stains`
4. R 傷・穴 `damage_holes`
5. R 毛玉・毛羽立ち `pilling_fuzz`
6. R 引っかけ・ほつれ `snags_fraying`
7. R 首元 `neckline`
8. R 袖・袖口 `sleeves_cuffs`
9. R 裾 `hem`
10. R 編み目・縫い目 `seams`
11. R ブランド・サイズ表示 `brand_size_label`
12. R 品質・素材表示 `care_content_label`
13. O ボタン・留め具 `buttons_fasteners`
14. O ポケット `pockets`

### 撮影7件

1. R 正面全体 `overall_front` → `front`
2. R 背面全体 `overall_back` → `back`
3. R ブランド・サイズ表示 `brand_size_label` → `brand_tag`
4. R 品質表示 `care_label` → `care_label`
5. R 首元 `neckline_detail` → `front`
6. R 編み地・裾 `knit_surface_hem_detail` → `front`
7. C 気になる箇所 `visible_concern_detail` → `flaw`

### 採寸5件

1. R 肩幅 `shoulder_width`
2. R 自然状態の身幅 `chest_width`
3. R 着丈 `body_length`
4. R 袖丈 `sleeve_length`
5. O／形状条件 裄丈 `yuki_length`

既存`knit_set_in_v1`の4項目を変更せず、伸ばした寸法はP0へ含めない。

## アウター

### 検品18件

1. R 状態全体 `overall_condition`
2. R 使用感・色あせ `wear_fading`
3. R 汚れ・シミ `stains`
4. R 傷・穴 `damage_holes`
5. R 毛玉・毛羽立ち `pilling_fuzz`
6. R ほつれ・糸の飛び出し `fraying_threads`
7. R 襟・ラペル `collar_lapel`
8. R 袖・袖口 `sleeves_cuffs`
9. R 前開き・ファスナー・ボタン `front_closure`
10. R ポケット `pockets`
11. R 裾 `hem`
12. R 縫い目 `seams`
13. R ブランド・サイズ表示 `brand_size_label`
14. R 品質・素材表示 `care_content_label`
15. R におい `odor`
16. O 裏地 `lining`
17. O 中綿・ダウン `insulation_filling`
18. O ベルト・フード等の付属品 `detachable_accessories`

### 撮影10件

1. R 正面全体 `overall_front` → `front`
2. R 背面全体 `overall_back` → `back`
3. R ブランド・サイズ表示 `brand_size_label` → `brand_tag`
4. R 品質表示 `care_label` → `care_label`
5. R 襟・ラペル `collar_lapel_detail` → `front`
6. R 袖口 `cuff_detail` → `front`
7. R 前開き・留め具 `front_closure_detail` → `front`
8. O 裏地 `lining_detail` → `back`
9. R ポケット・裾 `pocket_hem_detail` → `back`
10. C 気になる箇所 `visible_concern_detail` → `flaw`

### 採寸7件

1. R 肩幅 `shoulder_width`
2. R 身幅 `chest_width`
3. R 着丈 `body_length`
4. R 袖丈 `sleeve_length`
5. O／形状条件 裄丈 `yuki_length`
6. O 裾幅 `hem_width`
7. O 袖口幅 `cuff_width`

既存`outer_standard_v1`の4項目は変更しない。

## パンツ／スカート

承認済みの入口は1つのままにする。選択後に`pants_standard_v1`または新しい`skirt_standard_v1`へ分ける。混在させると股下とスカート丈の必須判定が曖昧になるため、同一テンプレートにはしない。

### パンツ検品16件

1. R 状態全体 `overall_condition`
2. R 使用感・色あせ `wear_fading`
3. R 汚れ・シミ `stains`
4. R 傷・穴 `damage_holes`
5. R ほつれ・糸の飛び出し `fraying_threads`
6. R におい `odor`
7. R ウエストまわり `waistband`
8. R ファスナー・留め具 `front_closure`
9. R 股・ヒップ部分 `crotch_seat`
10. R ひざ部分 `knees`
11. R 裾 `hem`
12. R 脇・内股の縫い目 `side_inseam_seams`
13. R ポケット `pockets`
14. R ブランド・サイズ表示 `brand_size_label`
15. R 品質・素材表示 `care_content_label`
16. O 裏地 `lining`

### スカート検品16件

1. R 状態全体 `overall_condition`
2. R 使用感・色あせ `wear_fading`
3. R 汚れ・シミ `stains`
4. R 傷・穴 `damage_holes`
5. R ほつれ・糸の飛び出し `fraying_threads`
6. R におい `odor`
7. R ウエストまわり `waistband`
8. R ファスナー・留め具 `closure`
9. R 裾 `hem`
10. R 脇・縫い目 `seams`
11. R ブランド・サイズ表示 `brand_size_label`
12. R 品質・素材表示 `care_content_label`
13. O プリーツ・ギャザー `pleats_gathers`
14. O スリット `slit`
15. O ポケット `pockets`
16. O 裏地 `lining`

### パンツ撮影8件

1. R 正面全体 `overall_front` → `front`
2. R 背面全体 `overall_back` → `back`
3. R ブランド・サイズ表示 `brand_size_label` → `brand_tag`
4. R 品質表示 `care_label` → `care_label`
5. R ウエスト・留め具 `waist_closure_detail` → `front`
6. R 裾 `hem_detail` → `back`
7. R 脇・ポケット `side_pocket_detail` → `back`
8. C 気になる箇所 `visible_concern_detail` → `flaw`

### スカート撮影8件

1. R 正面全体 `overall_front` → `front`
2. R 背面全体 `overall_back` → `back`
3. R ブランド・サイズ表示 `brand_size_label` → `brand_tag`
4. R 品質表示 `care_label` → `care_label`
5. R ウエスト・留め具 `waist_closure_detail` → `front`
6. R 裾・スリット `hem_slit_detail` → `back`
7. O 裏地・ポケット `lining_pocket_detail` → `back`
8. C 気になる箇所 `visible_concern_detail` → `flaw`

### パンツ採寸6件

1. R ウエスト平置幅 `waist_flat_width`
2. R 股上 `rise_length`
3. R 股下 `inseam_length`
4. R わたり幅 `thigh_width`
5. R 裾幅 `hem_width`
6. O ヒップ幅 `hip_width`

既存`pants_standard_v1`の5項目は変更しない。

### スカート採寸6件

1. R ウエスト平置幅 `waist_flat_width`
2. R スカート丈 `skirt_length`
3. O ヒップ幅 `hip_width`
4. O 裾幅 `hem_width`
5. O 前丈 `front_length`
6. O 後丈 `back_length`

## ワンピース

### 検品17件

1. R 状態全体 `overall_condition`
2. R 使用感・色あせ `wear_fading`
3. R 汚れ・シミ `stains`
4. R 傷・穴 `damage_holes`
5. R 毛玉・毛羽立ち `pilling_fuzz`
6. R ほつれ・糸の飛び出し `fraying_threads`
7. R におい `odor`
8. R 首元 `neckline`
9. R ウエスト部分 `waist`
10. R 裾 `hem`
11. R 縫い目 `seams`
12. R ブランド・サイズ表示 `brand_size_label`
13. R 品質・素材表示 `care_content_label`
14. O 袖・袖口 `sleeves_cuffs`
15. O ファスナー・留め具 `closure`
16. O 裏地 `lining`
17. O ポケット `pockets`

### 撮影9件

1. R 正面全体 `overall_front` → `front`
2. R 背面全体 `overall_back` → `back`
3. R ブランド・サイズ表示 `brand_size_label` → `brand_tag`
4. R 品質表示 `care_label` → `care_label`
5. R 首元 `neckline_detail` → `front`
6. R 袖 `sleeve_detail` → `front`
7. R ウエスト・留め具 `waist_closure_detail` → `back`
8. R 裾・裏地 `hem_lining_detail` → `back`
9. C 気になる箇所 `visible_concern_detail` → `flaw`

### 採寸6件

1. R 身幅 `chest_width`
2. R 総丈 `total_length`
3. O 肩幅 `shoulder_width`
4. O 袖丈 `sleeve_length`
5. O ウエスト幅 `waist_width`
6. O ヒップ幅 `hip_width`

## バッグ

### 検品16件

1. R 状態全体 `overall_condition`
2. R 汚れ・シミ `stains`
3. R 傷・擦れ `scratches_scuffs`
4. R 剥がれ・ひび割れ `peeling_cracks`
5. R ほつれ・糸の飛び出し `fraying_threads`
6. R におい `odor`
7. R 前面・背面 `exterior_panels`
8. R 底 `bottom`
9. R 角・縁 `corners_edges`
10. R 左右側面 `side_panels`
11. R 開口部・留め具 `opening_closure`
12. R 内側・裏地 `interior_lining`
13. R ポケット・収納部 `pockets_compartments`
14. R 持ち手・ストラップ `handles_straps`
15. R 金具 `hardware`
16. O 表示タグ `display_label`

### 撮影9件

1. R 正面 `overall_front` → `front`
2. R 背面 `overall_back` → `back`
3. R 底 `bottom_detail` → `front`
4. R 左側面 `left_side_detail` → `front`
5. R 右側面 `right_side_detail` → `back`
6. R 開口部・内側 `opening_interior_detail` → `back`
7. R 持ち手・金具 `handle_hardware_detail` → `front`
8. O 表示タグ `display_label` → `brand_tag`
9. C 気になる箇所 `visible_concern_detail` → `flaw`

### 採寸7件

1. R 幅 `bag_width`
2. R 高さ `bag_height`
3. R マチ `bag_depth`
4. O 持ち手長さ `handle_length`
5. O 持ち手立ち上がり `handle_drop`
6. O ショルダー最短 `shoulder_min_length`
7. O ショルダー最長 `shoulder_max_length`

重量は既存の採寸契約がcm専用のため、今回の7件へ含めない。

## 推奨Aと代替B

### 推奨A: 最低限の細部を必須

上記のR/O/Cを採用する。襟、袖口、裾など中古品の購入判断に影響しやすい箇所だけを必須にし、該当しない裏地・付属品等は任意にする。

### 代替B: 細部を任意

- 衣類は正面、背面、ブランド・サイズ表示、品質表示だけを必須写真にする。
- バッグは正面、背面、底、左右側面、開口部・内側までを基本必須にする。
- そのほかの細部写真は任意にする。
- 気になる箇所は推奨Aと同じく、見える懸念がある場合だけ必須にする。

代替Bは作業が速い一方、襟・袖口・裾などの撮り忘れが増える可能性がある。

## 承認済み3表示との対応

- mobile20の8件はシャツ用の具体的な8撮影項目。
- 写真v6の5分類は保存・閲覧の大分類。同じ分類へ複数の具体的撮影項目を保存できる。
- PC13の件数は商品種類ごとのR/O/Cを含む固定カタログ件数。

したがって「8個の具体的な撮影項目を5つの写真分類へ保存する」という関係であり、承認済み表示は変更しない。

## 未確定と安全境界

- 検品項目の具体的な割当、細部写真の組合せ、R/Oの境界、未実装カテゴリの採寸keyは、この文書の提案であり未承認。
- 確定済みなのは、各画面の件数、基本写真・細部候補、既存pilotの採寸key、既存写真5分類、3状態、人が確定する境界。
- 承認前にmigration、初期データ、API、実運用画面を変更しない。
- 有料サービス、外部API、Photoroom自動操作、AI自動確定、外部送信は使用しない。
