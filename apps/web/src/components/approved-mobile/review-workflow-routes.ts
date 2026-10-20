import { reviewPath } from "./review-path";

export type ReviewPlatform = "mobile" | "pc";
type Workflow = "intake" | "products" | "preparation" | "recipes" | "work";

const workflowPaths: Record<ReviewPlatform, Record<Workflow, string>> = {
  mobile: {
    intake: "/mobile/screens/box-02/",
    products: "/mobile/products/",
    preparation: "/mobile/screens/photo-03/",
    recipes: "/mobile/screens/photo-04/",
    work: "/mobile/screens/05/",
  },
  pc: {
    intake: "/pc/6/",
    products: "/pc/products/",
    preparation: "/pc/preparation/",
    recipes: "/pc/recipes/",
    work: "/pc/3/",
  },
};

export function workflowHref(
  platform: ReviewPlatform,
  workflow: Workflow,
  basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "",
): string {
  return reviewPath(workflowPaths[platform][workflow], basePath);
}

export function accountingHref(
  platform: ReviewPlatform,
  id: string,
  basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "",
): string {
  const pc: Record<string, string> = {
    "44": "/pc/46/",
    "45": "/pc/47/",
    "46": "/pc/48/?stage=check",
    "47": "/pc/48/?stage=file",
    "48": "/pc/48/?stage=import",
    "49": "/pc/48/?stage=history",
    "05": "/pc/3/",
  };
  return reviewPath(
    platform === "pc" ? (Object.hasOwn(pc, id) ? pc[id]! : "/pc/46/") : `/mobile/screens/${id}/`,
    basePath,
  );
}

export function pcAccountingScreen(stage: string | null): string {
  const screens: Record<string, string> = { file: "47", import: "48", history: "49" };
  return stage && Object.hasOwn(screens, stage) ? screens[stage]! : "46";
}

export function reviewScreenHref(
  platform: ReviewPlatform,
  id: string,
  basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "",
): string {
  if (platform === "mobile") return reviewPath(`/mobile/screens/${id}/`, basePath);
  if (id === "04") return reviewPath("/pc/2/", basePath);
  if (id === "05") return workflowHref(platform, "work", basePath);
  if (id.startsWith("box-")) return workflowHref(platform, "intake", basePath);
  if (id === "photo-03") return workflowHref(platform, "preparation", basePath);
  if (id === "29") return reviewPath("/pc/preparation/?panel=photos", basePath);
  if (isPcLocalWorkScreen(id)) return reviewPath(`/pc/workflow/?screen=${id}`, basePath);
  return workflowHref(platform, "work", basePath);
}

export function isPcLocalWorkScreen(id: string | null): id is string {
  return !!id && /^(?:1[4-9]|2[0-8])$/u.test(id);
}
