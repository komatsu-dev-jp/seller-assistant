"use client";

import { useEffect, useState } from "react";
import { assignedCaptureTasks } from "./workflow-capture-data";
import { getCaptureActionState } from "./mobile-assignment-action";

export function MobileCaptureTaskAction({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(true);
  const [assignmentCount, setAssignmentCount] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setAssignmentCount(0);
    setFailed(false);
    fetch(`/v1/workspaces/${workspaceId}/capture-tasks`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("撮影の担当商品を確認できませんでした。");
        const tasks = assignedCaptureTasks(await response.json(), workspaceId);
        if (!controller.signal.aborted) setAssignmentCount(tasks.length);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId]);

  const action = getCaptureActionState(loading, assignmentCount, failed);
  const content = (
    <>
      <span aria-hidden="true">▣</span>
      <div>
        <strong>割当商品の撮影・採寸</strong>
        <small>{action.detail}</small>
      </div>
      <span aria-hidden="true">{action.enabled ? "›" : "—"}</span>
    </>
  );

  return action.enabled ? (
    <a className="mobileWorkflowAction" href="/mobile/capture">
      {content}
    </a>
  ) : (
    <button className="mobileWorkflowAction" type="button" disabled>
      {content}
    </button>
  );
}
