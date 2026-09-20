import { mobileScreenIds } from "../../../../web/src/components/approved-mobile/mobile-screen-data";

export default function MobileScreenIndexPage() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>モバイル版 全75画面</h1>
      <ul>
        {mobileScreenIds.map((screen) => (
          <li key={screen}>
            <a href={`/mobile/screens/${screen}`}>{screen}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
