import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const html = readFileSync("apps/review/public/refresh.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/u)[1];
const root = "https://example.test/seller-assistant/";

function setup(registrations = [], supported = true) {
  let click;
  const button = {
    disabled: false,
    addEventListener: (_name, handler) => {
      click = handler;
    },
  };
  const status = { textContent: "" };
  const location = { href: `${root}refresh.html`, replace: vi.fn() };
  const serviceWorker = { getRegistrations: vi.fn(async () => registrations) };
  vm.runInNewContext(script, {
    URL,
    window: { location },
    navigator: supported ? { serviceWorker } : {},
    document: { getElementById: (id) => (id === "refresh" ? button : status) },
    // Any accidental destructive access fails the test immediately.
    get localStorage() {
      throw new Error("must preserve inputs");
    },
    get indexedDB() {
      throw new Error("must preserve photos");
    },
    get caches() {
      throw new Error("must not delete other caches");
    },
  });
  return { click: () => click(), button, status, location, serviceWorker };
}

function registration(scope, scriptURL) {
  return { scope, active: scriptURL ? { scriptURL } : null, unregister: vi.fn(async () => true) };
}

describe("Safari display recovery", () => {
  it("runs only on click and removes this app's root and nested registrations", async () => {
    const ours = [
      registration(root),
      registration(`${root}mobile/`),
      registration("https://example.test/", `${root}sw.js`),
    ];
    const others = [
      registration("https://example.test/other/"),
      registration("https://example.test/other/", `${root}sw.js`),
      registration("https://example.test/", "https://example.test/other/sw.js"),
      registration("https://other.test/seller-assistant/"),
    ];
    const h = setup([...ours, ...others]);
    expect(h.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    await h.click();
    for (const r of ours) expect(r.unregister).toHaveBeenCalledOnce();
    for (const r of others) expect(r.unregister).not.toHaveBeenCalled();
    expect(h.location.replace).toHaveBeenCalledWith(`${root}mobile/app/?display=R1`);
  });

  it("waits until every relevant registration is gone before leaving", async () => {
    let finish;
    const r = registration(root);
    r.unregister.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const h = setup([r]);
    const pending = h.click();
    await vi.waitFor(() => expect(r.unregister).toHaveBeenCalledOnce());
    expect(h.location.replace).not.toHaveBeenCalled();
    finish(true);
    await pending;
    expect(h.location.replace).toHaveBeenCalledOnce();
  });

  it("offers retry without claiming success when unregister fails", async () => {
    const r = registration(root);
    r.unregister.mockRejectedValue(new Error("denied"));
    const h = setup([r]);
    await h.click();
    expect(h.location.replace).not.toHaveBeenCalled();
    expect(h.button.disabled).toBe(false);
    expect(h.status.textContent).toContain("更新できませんでした");
  });

  it("opens the app on browsers without worker support", async () => {
    const h = setup([], false);
    await h.click();
    expect(h.location.replace).toHaveBeenCalledOnce();
  });
});
