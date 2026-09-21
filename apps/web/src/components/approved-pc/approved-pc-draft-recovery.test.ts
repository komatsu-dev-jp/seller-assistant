import React, { useState, useRef, useEffect, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as listingDraft from "../../lib/approved-listing-draft";
import { copyResearchText } from "../../lib/product-research-handoff";
import {
  readApprovedPcListingDraft,
  writeApprovedPcListingDraft,
} from "../../lib/approved-listing-draft";

// Exercise the actual screen handlers without a DOM dependency. Browser layout,
// focus and native dialog behavior are covered by the separate browser gate.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [
      hooks.values[index],
      (value: unknown) => {
        hooks.values[index] = value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useEffect(effect: () => void) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) {
      hooks.values[index] = true;
      hooks.effects.push(effect);
    }
  },
}));

type Props = {
  children?: ReactNode;
  "aria-label"?: string;
  href?: string;
  role?: string;
  value?: string;
  onClick?: (event: { preventDefault: () => void }) => void;
  onChange?: (event: { target: { value: string } }) => void;
};
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
function screen(number: number) {
  // The app deliberately preserves JSX for Next; transpile only these two
  // production functions to exercise their handlers in the Node test runner.
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/approved-pc/approved-pc-middle-screens.tsx"),
    "utf8",
  );
  const section = source.slice(
    source.indexOf("function Description()"),
    source.indexOf("function GalleryVisual"),
  );
  const compiled = ts.transpileModule(section, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const bindings = {
    React,
    useState,
    useRef,
    useEffect,
    ...listingDraft,
    copyResearchText,
    styles: {},
    Shell: "section",
    Card: "section",
    to: (n: number) => `/pc/${n}`,
  };
  const component = new Function(
    ...Object.keys(bindings),
    `${compiled}\nreturn ${number === 23 ? "Description" : "Official"};`,
  )(...Object.values(bindings)) as () => ReactElement;
  const render = () => {
    hooks.cursor = 0;
    return component();
  };
  render();
  hooks.effects.splice(0).forEach((effect) => effect());
  const find = (predicate: (node: ReactElement<Props>) => boolean) => {
    const node = nodes(render()).find(predicate);
    if (!node) throw new Error("Screen control missing");
    return node;
  };
  return {
    text: () => text(render()),
    edit: (label: string, value: string) =>
      find((node) => node.props["aria-label"] === label).props.onChange?.({ target: { value } }),
    value: (label: string) => find((node) => node.props["aria-label"] === label).props.value,
    click: (label: string) =>
      find((node) => node.type === "button" && text(node).includes(label)).props.onClick?.({
        preventDefault: vi.fn(),
      }),
    navigate: (href: string) => {
      const preventDefault = vi.fn();
      find((node) => node.props.href === href).props.onClick?.({ preventDefault });
      return preventDefault;
    },
  };
}

let blocked = false;
let stored: string | null = null;
const storage = {
  getItem: () => stored,
  setItem: (_key: string, value: string) => {
    if (blocked) throw new Error("denied");
    stored = value;
  },
};
beforeEach(() => {
  hooks.values = [];
  hooks.effects = [];
  blocked = false;
  stored = null;
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { sessionStorage: storage });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => vi.unstubAllGlobals());

describe("PC23/24 draft recovery handlers", () => {
  it("round-trips PC23 to PC24 and back without mixing the note into copied text", async () => {
    const edit = screen(23);
    edit.edit("編集する商品説明", "本文のみ");
    edit.edit("補足メモ", "分離したメモ");
    expect(edit.navigate("/pc/24")).not.toHaveBeenCalled();
    hooks.values = [];
    const copy = screen(24);
    expect(copy.value("コピーする商品説明")).toBe("本文のみ");
    copy.click("商品説明をコピー");
    await vi.waitFor(() => expect(copy.text()).toContain("コピーしました"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("本文のみ");
    expect(copy.navigate("/pc/23")).not.toHaveBeenCalled();
    hooks.values = [];
    const returned = screen(23);
    expect(returned.value("編集する商品説明")).toBe("本文のみ");
    expect(returned.value("補足メモ")).toBe("分離したメモ");
  });

  it("keeps on-screen fields when reading and writing storage are rejected", () => {
    const page = screen(23);
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("read denied");
        },
        setItem: () => {
          throw new Error("write denied");
        },
      },
    });
    page.edit("編集する商品説明", "現在の本文");
    page.edit("補足メモ", "現在のメモ");
    page.click("一時保存を再試行");
    expect(page.value("編集する商品説明")).toBe("現在の本文");
    expect(page.value("補足メモ")).toBe("現在のメモ");
    expect(page.navigate("/pc/24")).toHaveBeenCalled();
    expect(page.text()).toContain("一時保存できませんでした");
  });

  it.each(["getItem", "storage getter"])(
    "preserves an unread existing PC24 draft after %s denial and back recovery",
    (failure) => {
      const original = { description: "保存済みの大切な本文", note: "保存済みのメモ" };
      writeApprovedPcListingDraft(storage, original);
      const setItem = vi.fn(storage.setItem);
      if (failure === "getItem") {
        vi.stubGlobal("window", {
          sessionStorage: {
            getItem: () => {
              throw new Error("denied");
            },
            setItem,
          },
        });
      } else {
        vi.stubGlobal("window", {
          get sessionStorage() {
            throw new Error("denied");
          },
        });
      }
      const page = screen(24);
      expect(page.text()).toContain("読み込めませんでした");
      page.edit("コピーする商品説明", "上書きしてはいけない本文");
      page.click("商品説明をコピー");
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      expect(page.navigate("/pc/23")).toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(readApprovedPcListingDraft(storage)).toEqual(original);
      vi.stubGlobal("window", { sessionStorage: storage });
      expect(page.navigate("/pc/23")).not.toHaveBeenCalled();
      expect(page.value("コピーする商品説明")).toBe(original.description);
      expect(readApprovedPcListingDraft(storage)).toEqual(original);
    },
  );

  it.each([23, 24])("loads the existing PC%s draft before retry can save defaults", (number) => {
    const original = { description: "保存済み本文", note: "元のメモ" };
    writeApprovedPcListingDraft(storage, original);
    vi.stubGlobal("window", {
      get sessionStorage() {
        throw new Error("denied");
      },
    });
    const page = screen(number);
    page.click("一時保存を再試行");
    expect(page.text()).toContain("読み込めませんでした");
    vi.stubGlobal("window", { sessionStorage: storage });
    page.click("一時保存を再試行");
    expect(page.value(number === 23 ? "編集する商品説明" : "コピーする商品説明")).toBe(
      original.description,
    );
    expect(readApprovedPcListingDraft(storage)).toEqual(original);
    expect(page.text()).not.toContain("読み込めませんでした");
    if (number === 23) expect(page.value("補足メモ")).toBe(original.note);
  });

  it("retains both fields on denial and reset cancellation, then retries current values", () => {
    const page = screen(23);
    blocked = true;
    page.edit("編集する商品説明", "編集本文");
    page.edit("補足メモ", "別のメモ");
    page.click("リセット");
    page.click("編集を続ける");
    expect(page.value("編集する商品説明")).toBe("編集本文");
    expect(page.value("補足メモ")).toBe("別のメモ");
    expect(page.text()).toContain("一時保存できませんでした");
    expect(page.navigate("/pc/24")).toHaveBeenCalled();
    blocked = false;
    page.click("一時保存を再試行");
    expect(page.text()).not.toContain("一時保存できませんでした");
    expect(readApprovedPcListingDraft(storage)).toEqual({
      description: "編集本文",
      note: "別のメモ",
    });
    expect(page.navigate("/pc/24")).not.toHaveBeenCalled();
  });

  it("reacquires denied storage and recovers through next without re-editing", () => {
    const page = screen(23);
    vi.stubGlobal("window", {
      get sessionStorage() {
        throw new Error("denied");
      },
    });
    page.edit("編集する商品説明", "現在の本文");
    expect(page.navigate("/pc/24")).toHaveBeenCalled();
    vi.stubGlobal("window", { sessionStorage: storage });
    expect(page.navigate("/pc/24")).not.toHaveBeenCalled();
    expect(readApprovedPcListingDraft(storage)?.description).toBe("現在の本文");
  });

  it("keeps copy success separate, blocks back while denied and saves the note on recovery", async () => {
    writeApprovedPcListingDraft(storage, { description: "元の本文", note: "非公開メモ" });
    const page = screen(24);
    blocked = true;
    page.edit("コピーする商品説明", "新しい本文");
    page.click("商品説明をコピー");
    await vi.waitFor(() => expect(page.text()).toContain("コピーしました"));
    expect(page.navigate("/pc/23")).toHaveBeenCalled();
    expect(page.value("コピーする商品説明")).toBe("新しい本文");
    blocked = false;
    expect(page.navigate("/pc/23")).not.toHaveBeenCalled();
    expect(readApprovedPcListingDraft(storage)).toEqual({
      description: "新しい本文",
      note: "非公開メモ",
    });
  });

  it("does not restore copy success after edits or a late clipboard reply", async () => {
    let finish: () => void = () => {};
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      },
    });
    const page = screen(24);
    page.click("商品説明をコピー");
    page.edit("コピーする商品説明", "後から編集");
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(page.text()).not.toContain("コピーしました");
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    page.click("商品説明をコピー");
    await vi.waitFor(() => expect(page.text()).toContain("コピーしました"));
    page.edit("コピーする商品説明", "さらに編集");
    expect(page.text()).not.toContain("コピーしました");
  });

  it("keeps copy failure and explicit retry independent", async () => {
    const page = screen(24);
    blocked = true;
    page.edit("コピーする商品説明", "保持する本文");
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    page.click("商品説明をコピー");
    await vi.waitFor(() => expect(page.text()).toContain("コピーできませんでした"));
    page.click("一時保存を再試行");
    expect(page.text()).toContain("一時保存できませんでした");
    blocked = false;
    page.click("一時保存を再試行");
    expect(page.text()).not.toContain("一時保存できませんでした");
    expect(page.text()).toContain("コピーできませんでした");
  });
});
