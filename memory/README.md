# 共有プロジェクトmemory

`memory/` は、CodexとClaude Codeが共有する、確認済みの長期知識を置く場所です。AIの再学習データではありません。

## 記録の流れ

1. 重大または再発し得る失敗を `memory/_templates/incident.md` で候補記録します。
2. 原因、修正、再発防止、証拠、重複確認、独立レビューがそろうまで `status: candidate` のままにします。
3. 複数作業で再利用できると確認できた場合だけ、`memory/_templates/lesson.md` を使ってlessonへ昇格します。
4. 有効なlessonだけを `memory/INDEX.md` に一行で登録します。

合意済みの製品・技術判断は `../docs/DECISIONS.md`、未解決で担当者の判断が必要な事項は `../inbox/`、一時的な進捗は `../handoffs/active/` に置きます。

APIキー、トークン、Webhook URL、Cookie、パスワード、個人情報、生ログ、実データ行は保存しません。

