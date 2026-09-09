# 同じWi-Fi内のiPhoneで安全に表示する手順

## 結論

PC用WebとAPIを直接ネットワーク公開しない。iPhone確認時だけ、HTTPS（通信を暗号化する接続）の中継を別ポートで起動する。認証Cookieの`Secure`設定を弱めず、許可したiPhoneのIPv4アドレス1件だけを通す。

- 費用: 0円
- 外部サービス・クラウド・外部API: 0件
- PC用P06: `http://127.0.0.1:4273`のまま
- API: `http://127.0.0.1:3200`のままPC内だけ
- iPhone用: 現在のPC Wi-Fiアドレスを含むローカルHTTPS URL
- P06のWindows計測とiPhone確認は別run・別証拠にする

## 実装した安全境界

- `scripts/lan-preview-proxy.mjs`はNode.js標準機能だけを使う。追加パッケージ、課金、外部通信はない。
- 待受先は`0.0.0.0`ではなく、明示したPCのIPv4アドレス1件だけである。
- 接続元は明示したiPhoneのIPv4アドレス1件だけを許可する。別端末はHTTP 403で拒否する。
- `Host`、`Origin`、`Referer`を完全一致で確認し、状態を変える要求は同一Originがなければ拒否する。
- 転送用・hop-by-hop header（中継区間だけで使うheader）を除去し、公開中継を任意サイトへ接続できるopen proxyにしない。
- Cookie、認証header、本文、秘密鍵をログへ出さない。
- 公開CA証明書の取得口は固定パス1件だけで、秘密鍵やフォルダー一覧は404にする。
- 認証Cookieの`HttpOnly; Secure; SameSite=Strict`を保持する。
- 証明書、秘密鍵、ログは`C:\tmp`だけに置き、Git、Slack、Notion、PRへ保存しない。

## iPhone利用者が最初に確認すること

1. PCとiPhoneを同じ信頼済みWi-Fiへ接続する。ホテル、店舗、会社の共有Wi-Fiでは使わない。
2. iPhoneで「設定」→「Wi-Fi」→接続中ネットワーク右側の情報ボタンを開く。
3. 「IPv4アドレス」の「IPアドレス」をCodexへ伝える。`100.64.7.xxx`のような家庭内・同一Wi-Fi内だけの番号で、パスワードではない。
4. Codexが、そのIPだけを許可するWindows Firewall規則とHTTPS中継を起動するまで待つ。

## Codexが起動後に案内する操作

1. Safariで公開CA証明書のHTTP URLを開いてダウンロードする。公開証明書だけであり、秘密鍵は配布しない。
2. iPhoneの「設定」→「一般」→「VPNとデバイス管理」で、`Resale Ops Local Preview CA`をインストールする。
3. 「設定」→「一般」→「情報」→「証明書信頼設定」で同CAを信頼する。
4. Codexが案内した`https://<PCのIPv4>:4274/login`をSafariで開く。
5. 架空のローカル検証アカウントでログインし、画面表示、ホーム画面追加、カメラ選択、縦横表示を確認する。

iOSの項目名が異なる場合は、推測で別profileを入れず、その画面のスクリーンショットをCodexへ返す。

## 確認後の削除

1. CodexがHTTPS中継を停止し、iPhone限定Firewall規則を削除する。
2. iPhoneから`Resale Ops Local Preview CA` profileを削除する。
3. Codexが`C:\tmp\resale-ops-lan-preview`の一時証明書と秘密鍵を削除する。

CAを発行した親秘密鍵はserver証明書の作成直後に削除済みで、追加証明書を発行できない。server秘密鍵は現在のWindowsユーザーだけが読めるACL（Windowsのファイル権限）で保護し、7日で期限切れにする。

## 現在の検証証拠（2026-08-25）

- PC Wi-Fi: `100.64.7.28/24`。Windows表示はPublicのため、iPhone IPを特定するまで外部端末向け許可を作らない。
- 既存Node.jsにはPublic全ポートの広い許可規則が2件あった。今回の作業では変更せず、別コピーのNode実行ファイルと専用Firewall規則で分離する。
- 元Nodeと一時コピーのSHA-256は`3331E1FFE19874215472217C5E94F5A0C6D8E18C4AC7111D3937AA0AD5E9B4A5`で一致した。
- unit testは21/21 PASS。root full checkは32 files / 230 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、API/Web buildまでPASSした。
- PC自身だけを許可した実走で、TLS証明書検証、login page 200、公開CA 200、秘密鍵path 404、別Origin 403、Secure Cookie、session 200、workflow 200、logout 204、失効session 401を確認した。
- 未確認: 実iPhoneのIP限定Firewall、CA install/full trust、Safari login、PWA home追加、camera、offline、HEIC/WebP。これらをPC自己検証で代用しない。
