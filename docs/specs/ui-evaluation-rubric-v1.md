# P0 UI評価表 v1

- 状態: target SHA `02c4641599eb6885bca3256f7792cf0a08c464bb`でP05独立Terra最終PASS（100/100）
- 更新日: 2026-08-24（JST）
- 合格: 90/100以上、かつ重大項目に0点なし

実装担当とは別の確認者が、同じcommitの実ブラウザで採点する。モック画像だけでは採点しない。

## 現行評価状況

- target SHA `02c4641599eb6885bca3256f7792cf0a08c464bb`のfresh productionで、P05独立Terraは100/100（Critical/High/Medium 0）だった。8 task 40/40、安全25/25、responsive15/15、a11y15/15、初心者5/5を確認した。
- この独立確認者はP05のUI実行担当であり、P08の最終独立Solレビューとは別である。
- Medium 1は、棚卸差異の復元フォームに21〜25pxの入力欄・ボタンが残っていたこと。`6c68980`で同フォームを44px以上へ修正し、`21fbff4`まで保持している。
- 暫定報告は44px不足をresponsiveの減点へ含めているが、下表のresponsive規則は切断・横overflow・overlay・入力不能を採点対象とする。最終確認者は現行規則で点数を再計算し、減点根拠を項目ごとに残す。
- 390/768/1440のoverflow 0、CSS zoom 2 fallbackで390/390/390、selector overflow 0、主要操作44px以上、console 0、runtime requestは`127.0.0.1`のみを確認した。dual初回担当の確認form非表示・承認disabled・日本語handoff・409なし、managerの写真・二重読取・keyboard 3秒→hold→承認成功status、mobile online→offline→onlineの端末内保持/retry disabled、会計profile・7/7履歴・CSV停止・27列5行preview/downloadを確認した。
- 最新full checkは29 files / 202 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、fixture hash `a44d25d...`でPASSした。P05は合格済みだが、P08の最終Solレビューとは別である。

## P05最終結果（2026-08-24）

- 採点者: 独立Terra、target SHA: `02c4641599eb6885bca3256f7792cf0a08c464bb`、fresh production。
- 結果: **100/100 PASS**。Critical 0、High 0、Medium 0。8 task 40/40、安全25/25、responsive15/15、a11y15/15、初心者5/5。
- 証拠PNG（14点）: `output/playwright/v11-p05-independent/fresh-dual-initial-owner-disabled-390x844.png`、`fresh-dual-manager-keyboard-focus-390x844.png`、`fresh-dual-manager-candidate-390x844.png`、`fresh-dual-manager-approved-status-390x844.png`、`fresh-solo-audit-csszoom200-390x844.png`、`fresh-solo-restored-390x844.png`、`fresh-solo-restored-768x1024.png`、`fresh-solo-restored-1440x1000.png`、`final-mobile-online-390x844.png`、`final-mobile-offline-390x844.png`、`final-accounting-profile-390x844.png`、`final-accounting-mapping-390x844.png`、`final-accounting-csv-blocker-390x844.png`、`final-accounting-csv-downloaded-390x844.png`。
- 未実施: 人の`WARMUP-01`＋固定10商品pilot、実iPhone、実Money Forward import、P08最終Solレビュー、Draft PR。

| 区分                 | 確認項目                                                                                                  | 点数規則                                                                                                                                                                       | 満点 |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---: |
| 主要作業完了         | 1人差異、2人差異、復元、会計profile設定、mapping候補採用、mapping変更、CSV停止、CSV出力の8 task           | 各task: UIだけで期待状態まで完了しerror/retry/迂回0回=5点。1回だけretryまたは戻る操作が必要だがdata欠落/安全低下なし=3点。未完了、直接API/devtoolsが必要、安全境界を越える=0点 |   40 |
| 安全表示・誤操作防止 | 可逆状態と復元、P0不可逆操作拒否、候補中の販売/引当hold、外部送信0件と税務候補表示、停止理由と根拠の5項目 | 各項目: 全対象画面で表示と実挙動が一致=5点。1画面でも欠落/矛盾/迂回可能=0点。部分点なし                                                                                        |   25 |
| responsive layout    | 390×844、768×1024、1440×1000の3 viewport                                                                  | 各viewport: 主要action切断、横overflow、overlay、入力不能が全て0件=5点。1件以上=0点。部分点なし                                                                                |   15 |
| accessibility        | keyboard完走、focus表示/復帰、accessible name、screen reader status、200%文字拡大の5項目                  | 各項目: 全対象taskで合格=3点。1件でも操作不能/欠落=0点。3秒確認のkeyboard同等手段欠落はkeyboard項目0点                                                                         |   15 |
| 初心者向け明瞭さ     | `?`用語説明、次のaction、error修正方法、候補/確定の区別、online/offline状態の5項目                        | 各項目: 指定文言とactionが画面に存在し、対象から到達可能=1点。欠落/到達不能=0点。部分点なし                                                                                    |    5 |

合計は各項目の整数点を足して100点満点で再現計算する。「軽微」は主要作業taskで、1回だけretryまたは戻る操作が必要だが、data欠落、安全性低下、直接API/devtools利用がない状態だけを指す。重大項目は主要作業完了、安全表示・誤操作防止、accessibilityの各確認項目であり、一つでも0点なら総点にかかわらず不合格とする。採点者、日時、commit SHA、browser/viewport、taskごとの操作回数、各減点理由、画面証拠pathを記録する。
