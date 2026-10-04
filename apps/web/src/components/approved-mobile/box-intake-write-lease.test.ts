import { describe, it, expect, vi } from "vitest";
import { acquireIntakeEditor, intakeWriteLock } from "./box-intake-write-lease";
import { createBox, writeIntake, readIntake } from "./box-intake-store";

function manager() {
  const held = new Set<string>();
  const request = vi.fn(
    async (name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) => {
      expect(options).toEqual({ mode: "exclusive", ifAvailable: true });
      if (held.has(name)) return await callback(null);
      held.add(name);
      try {
        return await callback({ name, mode: "exclusive" });
      } finally {
        held.delete(name);
      }
    },
  );
  return { request } as unknown as Pick<LockManager, "request">;
}

describe("intake single-writer browser lease", () => {
  it("prevents concurrent editor reads/writes until the first editor releases", async () => {
    const locks = manager();
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    let firstRaw: string | null = null;
    const firstReady = vi.fn(() => {
      firstRaw = readIntake(storage).raw;
    });
    const first = acquireIntakeEditor(locks, firstReady, vi.fn());
    expect(first.canWrite()).toBe(true);
    const secondReady = vi.fn();
    const secondFailed = vi.fn();
    const second = acquireIntakeEditor(locks, secondReady, secondFailed);
    expect(second.canWrite()).toBe(false);
    expect(secondReady).not.toHaveBeenCalled();
    expect(secondFailed).toHaveBeenCalledWith(expect.stringContaining("別のタブ"));
    raw = writeIntake(storage, { version: 1, activeBoxId: "a", boxes: [createBox("a")] }, firstRaw);
    second.close();
    first.close();
    await Promise.resolve();
    await Promise.resolve();
    let restored: string | null = null;
    const next = acquireIntakeEditor(
      locks,
      () => {
        restored = readIntake(storage).raw;
      },
      vi.fn(),
    );
    expect(restored).toBe(raw);
    expect(next.canWrite()).toBe(true);
    expect(locks.request).toHaveBeenCalledWith(
      intakeWriteLock,
      expect.any(Object),
      expect.any(Function),
    );
    next.close();
  });
  it("does not restore or hold a lock acquired after the component closed", async () => {
    let grant: LockGrantedCallback<unknown> | undefined;
    const locks = {
      request: vi.fn((_name: string, _options: unknown, callback: LockGrantedCallback<unknown>) => {
        grant = callback;
        return Promise.resolve();
      }),
    } as unknown as Pick<LockManager, "request">;
    const ready = vi.fn();
    const failed = vi.fn();
    const lease = acquireIntakeEditor(locks, ready, failed);
    lease.close();
    await grant?.({ name: intakeWriteLock, mode: "exclusive" });
    expect(lease.canWrite()).toBe(false);
    expect(ready).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });
  it("fails closed when lock support is missing or the browser rejects access", async () => {
    const ready = vi.fn();
    const failed = vi.fn();
    expect(acquireIntakeEditor(undefined, ready, failed).canWrite()).toBe(false);
    expect(failed).toHaveBeenCalledWith(expect.stringContaining("最新版のSafari"));
    const locks = { request: () => Promise.reject(Error("blocked")) } as unknown as Pick<
      LockManager,
      "request"
    >;
    const lease = acquireIntakeEditor(locks, ready, failed);
    await Promise.resolve();
    await Promise.resolve();
    expect(lease.canWrite()).toBe(false);
    expect(failed).toHaveBeenCalledWith(expect.stringContaining("編集の準備"));
    expect(ready).not.toHaveBeenCalled();
    lease.close();
  });
});
