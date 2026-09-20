import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { runInNewContext } from "node:vm";

// The app preserves JSX for Next. Execute the actual non-JSX error helpers
// without changing the shared test/compiler setup or mocking their behavior.
const componentSource = readFileSync(
  resolve("apps/web/src/components/accounting-workspace.tsx"),
  "utf8",
);
const helperSource = componentSource.slice(
  componentSource.indexOf("export class AccountingRequestError"),
  componentSource.indexOf("async function requestJson"),
);
const helperExports: {
  AccountingRequestError?: new (message: string, status: number, code?: string) => Error;
  financialLoadErrorMessage?: (error: unknown) => string;
} = {};
runInNewContext(
  transpileModule(helperSource, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText,
  { exports: helperExports, Error },
);
const AccountingRequestError = helperExports.AccountingRequestError!;
const financialLoadErrorMessage = helperExports.financialLoadErrorMessage!;

describe("financial summary failure guidance", () => {
  it("translates only the repository's specific incomplete-facts error", () => {
    const message = financialLoadErrorMessage(
      new AccountingRequestError("The order financial facts are incomplete", 409, "conflict"),
    );
    expect(message).toContain("不足しているか");
    expect(message).toContain("重複");
    expect(message).toContain("不足項目を特定できません");
    expect(message).toContain("未入力を0円として扱わず");
  });
  it("does not infer missing money from a different conflict", () => {
    const message = financialLoadErrorMessage(
      new AccountingRequestError("Different conflict", 409, "conflict"),
    );
    expect(message).toContain("Different conflict");
    expect(message).not.toContain("原価");
  });
  it.each([401, 403])("explains authorization failures %i separately", (status) => {
    expect(
      financialLoadErrorMessage(new AccountingRequestError("forbidden", status, "forbidden")),
    ).toContain("権限");
  });
  it("distinguishes server and network failures", () => {
    expect(
      financialLoadErrorMessage(new AccountingRequestError("failed safely", 503, "database_error")),
    ).toContain("稼働状態");
    expect(financialLoadErrorMessage(new TypeError("Failed to fetch"))).toContain("通信状態");
  });
  it("clears previous results before reads and rejects late results across order changes", () => {
    const source = readFileSync(
      resolve("apps/web/src/components/accounting-workspace.tsx"),
      "utf8",
    );
    const load = source.slice(
      source.indexOf("function loadFinancials()"),
      source.indexOf("function createExport("),
    );
    expect(load.indexOf("setFinancial(null)")).toBeLessThan(load.indexOf("await requestJson"));
    expect(load).toContain("request === financialRequest.current");
    expect(source).toContain("financialRequest.current += 1");
    expect(source).toContain("financialResult.orderId === orderId");
    expect(source.match(/role="alert">\{financialError.message\}/gu)?.length).toBe(2);
  });
});
