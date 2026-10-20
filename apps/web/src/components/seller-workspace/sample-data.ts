import { emptyCommerce, type CommerceState } from "./sales-store";
import type { WorkspaceProduct } from "./product-adapter";

export const sampleProducts: WorkspaceProduct[] = [
  {
    id: "sample-shirt",
    name: "ネイビーのシャツ",
    subtitle: "M · 見本",
    registered: true,
    sellable: true,
    estimate: 1480,
    cost: 1000,
    href: "",
    image: "/approved-assets/mobile-fidelity/review-shirt-full.png",
  },
  {
    id: "sample-knit",
    name: "ベージュのニット",
    subtitle: "M · 見本",
    registered: true,
    sellable: true,
    estimate: 980,
    cost: 1200,
    href: "",
    image: "/approved-assets/pc-fidelity/inspection/knit-beige.png",
  },
  {
    id: "sample-tote",
    name: "トートバッグ",
    subtitle: "見本",
    registered: true,
    sellable: true,
    estimate: null,
    cost: 18000,
    href: "",
    image: "/approved-assets/pc-fidelity/product/beige-tote-front.png",
  },
];

/** Samples are never inserted into browser storage. Mutations last only until leaving sample mode. */
export function sampleCommerce(month: string): CommerceState {
  return {
    ...emptyCommerce(),
    locations: { "sample-shirt": "棚A", "sample-knit": "棚B", "sample-tote": "棚C・箱2" },
    sales: [
      {
        id: "sample-sale",
        productId: "sample-tote",
        productName: "トートバッグ",
        channel: "メルカリ",
        soldOn: `${month}-17`,
        deadline: `${month}-21`,
        priceYen: 48000,
        costYen: 18000,
        feeYen: 4800,
        shippingYen: 1200,
        packingYen: 300,
        stage: "unpacked",
        location: "棚C・箱2",
      },
    ],
    expenses: [
      { id: "sample-expense", title: "その他の経費（見本）", date: `${month}-18`, amountYen: 1780 },
    ],
  };
}
