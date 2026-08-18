export default function OfflinePage() {
  return (
    <main className="offlinePage">
      <div className="offlineMark" aria-hidden="true">
        ↻
      </div>
      <p className="eyebrow">OFFLINE</p>
      <h1>通信を確認してください</h1>
      <p>保存済みの画面は閲覧できます。未送信の作業は「同期待ち」のまま保持します。</p>
      <p>現在地や在庫は自動上書きせず、接続後に商品と場所を再確認します。</p>
      <a className="primaryButton" href="/mobile">
        もう一度確認
      </a>
    </main>
  );
}
