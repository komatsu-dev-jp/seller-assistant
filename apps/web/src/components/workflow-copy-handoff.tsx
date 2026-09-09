export async function copyBeforeWorkflowHandoff(
  text: string,
  clipboard: { writeText: (value: string) => Promise<void> } | undefined,
  confirm: () => Promise<void>,
): Promise<void> {
  if (!text.trim()) throw new Error("コピーする商品説明を入力してください。");
  if (!clipboard?.writeText)
    throw new Error(
      "この環境ではコピーできません。対応するブラウザで開き直してください。出品準備は確定していません。",
    );
  try {
    await clipboard.writeText(text);
  } catch {
    throw new Error(
      "コピーできませんでした。ブラウザの許可を確認して再試行してください。出品準備は確定していません。",
    );
  }
  await confirm();
}
