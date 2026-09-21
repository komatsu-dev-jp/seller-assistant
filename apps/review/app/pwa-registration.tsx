"use client";

import { useEffect } from "react";

const basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register(`${basePath}/sw.js`, {
        scope: `${basePath || ""}/`,
        updateViaCache: "none",
      })
      .then((registration) => registration.update())
      .catch(() => undefined);
  }, []);

  return null;
}
