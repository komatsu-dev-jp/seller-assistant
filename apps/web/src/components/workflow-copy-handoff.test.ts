import { describe, expect, it, vi } from "vitest";
import { copyBeforeWorkflowHandoff } from "./workflow-copy-handoff";

describe("copy before confirmed workflow handoff", () => {
  it("awaits successful copy of edited text before calling the API", async () => {
    const events: string[] = [];
    let finishCopy!: () => void;
    const clipboard = {
      writeText: vi.fn((text: string) => {
        events.push(text);
        return new Promise<void>((resolve) => {
          finishCopy = resolve;
        });
      }),
    };
    const api = vi.fn(async () => {
      events.push("confirm_listing/manualChannelHandoff");
    });
    const pending = copyBeforeWorkflowHandoff("本人が編集した文章", clipboard, api);
    expect(api).not.toHaveBeenCalled();
    finishCopy();
    await pending;
    expect(events).toEqual(["本人が編集した文章", "confirm_listing/manualChannelHandoff"]);
  });
  it("does not call the API when clipboard is unsupported", async () => {
    const api = vi.fn();
    await expect(copyBeforeWorkflowHandoff("文章", undefined, api)).rejects.toThrow(
      "確定していません",
    );
    expect(api).not.toHaveBeenCalled();
  });
  it("does not call the API on rejection or synchronous exception", async () => {
    for (const writeText of [
      vi.fn().mockRejectedValue(new Error("denied")),
      () => {
        throw new Error("denied");
      },
    ]) {
      const api = vi.fn();
      await expect(copyBeforeWorkflowHandoff("文章", { writeText }, api)).rejects.toThrow(
        "確定していません",
      );
      expect(api).not.toHaveBeenCalled();
    }
  });
  it("rejects empty content and propagates an API failure after copying", async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    const api = vi.fn().mockRejectedValue(new Error("保存失敗"));
    await expect(copyBeforeWorkflowHandoff(" ", clipboard, api)).rejects.toThrow();
    expect(clipboard.writeText).not.toHaveBeenCalled();
    await expect(copyBeforeWorkflowHandoff("文章", clipboard, api)).rejects.toThrow("保存失敗");
    expect(api).toHaveBeenCalledTimes(1);
  });
});
