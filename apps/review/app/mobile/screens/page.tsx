import Link from "next/link";

import { mobileScreenIds } from "../../../../web/src/components/approved-mobile/mobile-screen-data";

export default function MobileScreenIndexPage() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>モバイル版 全75画面</h1>
      <ul>
        {mobileScreenIds.map((screen) => (
          <li key={screen}>
            <Link href={`/mobile/screens/${screen}`}>{screen}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
