# プロジェクトinbox

`inbox/` は、未解決で担当者の判断が必要であり、現在または次の作業を止める事項だけを保存する場所です。

## 記録形式

```markdown
# YYYY-MM-DD — 短い件名

- Status: open / resolved
- Question: 決める必要があること
- Context: 関連する仕様、ファイル、Issueへの参照
- Owner: 判断する人
- Next action: 次に取る最小で安全な行動
- Resolution: none / docs/DECISIONS.mdの該当項目
```

解決後は `Status` を更新し、日付付きの判断記録へリンクします。秘密情報、個人情報、会話全文、通常の一時メモ、未検証の教訓は保存しません。

