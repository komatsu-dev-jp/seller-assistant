import { AppSidebar } from "../../components/app-sidebar";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

interface LocationItem {
  level: number;
  name: string;
  count: number;
  selected?: boolean;
  alert?: boolean;
}

const locations: readonly LocationItem[] = [
  { level: 0, name: "自宅保管", count: 842 },
  { level: 1, name: "洋室A", count: 512 },
  { level: 2, name: "北側", count: 276 },
  { level: 3, name: "棚03", count: 84 },
  { level: 4, name: "2段目", count: 24 },
  { level: 5, name: "箱014", count: 12, selected: true },
  { level: 1, name: "洋室B", count: 148 },
  { level: 1, name: "返品隔離", count: 32, alert: true },
];

const inventory = [
  ["INV-000123", "SKU-2608-0123", "ネイビージャケット", "在庫中", "08/14 09:36"],
  ["INV-000124", "SKU-2608-0456", "グレースウェット", "引当済み", "08/14 09:10"],
  ["INV-000125", "SKU-2608-0789", "ベージュパンツ", "在庫中", "08/13 18:22"],
  ["INV-000126", "SKU-2608-0111", "白シャツ", "要確認", "08/13 17:55"],
  ["INV-000127", "SKU-2608-0333", "カーキニット", "在庫中", "08/13 16:41"],
] as const;

export default async function InventoryPage() {
  await requirePageSession(["owner", "inventory_manager"]);

  return (
    <main className="shell inventoryShell">
      <AppSidebar current="inventory" />
      <section className="content inventoryContent">
        <header className="topbar inventoryTopbar">
          <div>
            <p className="eyebrow">INVENTORY CONTROL</p>
            <h1>在庫ロケーション管理</h1>
            <p>部屋・棚・箱の写真と在庫番号を結び、誰が見ても現物へたどり着けます。</p>
          </div>
          <div className="actionGroup">
            <button type="button" className="secondaryButton">
              棚卸を開始
            </button>
            <button type="button">＋ 格納作業を作成</button>
          </div>
        </header>

        <section className="inventoryKpis" aria-label="在庫の概要">
          {[
            ["在庫中", "842", "stable"],
            ["未格納", "12", "warning"],
            ["引当済み", "18", "success"],
            ["差異", "4", "danger"],
            ["90日超", "36", "neutral"],
          ].map(([label, value, tone]) => (
            <article className={`inventoryKpi ${tone}`} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>

        <div className="inventoryGrid">
          <section className="panel locationTree" aria-labelledby="location-tree-heading">
            <div className="panelHead">
              <h2 id="location-tree-heading">場所ツリー</h2>
              <button className="tinyButton" type="button">
                ＋ 場所
              </button>
            </div>
            <div className="legend">
              <span>● 使用中</span>
              <span>○ 一時停止</span>
            </div>
            <ul>
              {locations.map((location) => (
                <li
                  className={location.selected ? "selected" : ""}
                  key={`${location.level}-${location.name}`}
                  style={{ paddingInlineStart: `${10 + location.level * 15}px` }}
                >
                  <span aria-hidden="true">{location.level < 5 ? "⌄" : "□"}</span>
                  <strong>{location.name}</strong>
                  <span className={location.alert ? "alertText" : ""}>{location.count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="inventoryMain">
            <article className="panel locationDetail">
              <div className="breadcrumb">自宅保管 › 洋室A › 北側 › 棚03 › 2段目 › 箱014</div>
              <div className="locationPhotos">
                <div className="photoPlaceholder roomPhoto">
                  <span>部屋写真</span>
                  <strong>洋室A・北側の保管棚</strong>
                  <small>位置情報除去済み</small>
                </div>
                <div className="photoPlaceholder exactPhoto">
                  <span>正確位置</span>
                  <strong>BX-014</strong>
                  <small>棚03・2段目</small>
                </div>
              </div>
              <div className="locationMeta">
                <span>更新 08/14 09:40</span>
                <span className="safeBadge">GPS情報 0件</span>
                <button className="tinyButton" type="button">
                  写真を更新
                </button>
              </div>
            </article>

            <article className="panel inventoryTablePanel">
              <div className="panelHead">
                <h2>保管中の商品</h2>
                <span className="capacity">12 / 20点</span>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>在庫番号</th>
                      <th>SKU</th>
                      <th>商品</th>
                      <th>状態</th>
                      <th>最終移動</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map(([number, sku, title, state, moved], index) => (
                      <tr className={index === 0 ? "activeRow" : ""} key={number}>
                        <td>{number}</td>
                        <td>{sku}</td>
                        <td>{title}</td>
                        <td>
                          <span className={`tableStatus state-${state}`}>{state}</span>
                        </td>
                        <td>{moved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <aside className="inventoryAside">
            <article className="panel responsibilityPanel">
              <div className="panelHead">
                <h2>担当</h2>
              </div>
              <dl>
                <div>
                  <dt>在庫責任者</dt>
                  <dd>本人</dd>
                </div>
                <div>
                  <dt>格納担当</dt>
                  <dd>本多</dd>
                </div>
                <div>
                  <dt>棚卸担当</dt>
                  <dd>山口</dd>
                </div>
              </dl>
              <button className="secondaryButton fullButton" type="button">
                担当を割り当てる
              </button>
            </article>

            <article className="panel discrepancyPanel">
              <div className="panelHead">
                <h2>差異・例外</h2>
              </div>
              <div className="discrepancyCounts">
                <div>
                  <strong>2</strong>
                  <span>誤棚</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>未発見候補</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>予定外発見</span>
                </div>
              </div>
              <p>差異だけで現在地は変更しません。別担当の再確認と承認が必要です。</p>
              <button className="secondaryButton fullButton" type="button">
                差異を確認
              </button>
            </article>

            <article className="panel selectedUnit">
              <div className="panelHead">
                <h2>INV-000123</h2>
                <span className="safeBadge">在庫中</span>
              </div>
              <div className="productSilhouette" aria-hidden="true">
                ♜
              </div>
              <p>現在地：洋室A › 北側 › 棚03 › 2段目 › 箱014</p>
              <p>最後の確認：本人・08/14 09:36</p>
              <button className="primaryButton fullButton" type="button">
                商品と場所を読み取る
              </button>
            </article>
          </aside>
        </div>

        <section className="stocktakeBar" aria-label="棚卸セッション">
          <div>
            <span className="eyebrow">棚卸セッション</span>
            <strong>洋室A 定期棚卸 2026-08</strong>
          </div>
          <div className="stocktakeProgress">
            <span>126 / 184 読取</span>
            <progress value="68" max="100">
              68%
            </progress>
          </div>
          <div className="stocktakeAlert">差異4件・再確認2件</div>
          <button type="button">セッションを開く</button>
        </section>
      </section>
    </main>
  );
}
