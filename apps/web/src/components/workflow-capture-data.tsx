import { captureTaskResponseSchema } from "@resale/contracts";

/** Only the assigned capture contract enters the worker presentation. */
export function assignedCaptureTasks(payload: unknown, workspaceId: string) {
  const tasks = captureTaskResponseSchema.array().parse(payload);
  if (tasks.some((task) => task.workspaceId !== workspaceId)) {
    throw new Error("担当の商品を安全に確認できません。");
  }
  return tasks;
}
