"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { getApprovedPcLiveRoute, isP1ApprovedPcScreen } from "./approved-screen-scope";

/**
 * The approved route is one 768x512 desktop screen (each approved board is a
 * 2x2 composite containing four of these screens). Route styles use the same
 * 768x512 coordinate system, then this canvas enlarges the whole screen to the
 * review viewport. At 1440px this is exactly 1.875x and 1440x960.
 */
export function PcCanvas({
  className,
  children,
  screenNumber,
}: {
  className: string | undefined;
  children: ReactNode;
  screenNumber: number;
}) {
  const [scale, setScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      // The gate is width-first: at 1440px the 768px virtual board becomes
      // 1440px wide and its 512px height becomes 960px. A short viewport may
      // scroll vertically; it must not shrink the approved desktop geometry.
      setScale(Math.max(0.01, window.innerWidth / 768));
    };

    update();
    window.scrollTo(0, 0);
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
    });
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
    };
  }, [className]);

  const viewportStyle: CSSProperties = {
    width: "100vw",
    minHeight: "100vh",
    height: "100vh",
    // The approved desktop board remains width-first. Short windows must be
    // able to reach the footer, while the className-dependent effect above
    // resets retained focus scrolling whenever the live screen changes.
    overflowX: "hidden",
    overflowY: "auto",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    background: "#eef2f7",
  };
  const canvasViewportStyle: CSSProperties = {
    width: `${768 * scale}px`,
    height: `${512 * scale}px`,
    flex: "0 0 auto",
  };
  const canvasStyle: CSSProperties = {
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  };
  const liveRoute = getApprovedPcLiveRoute(screenNumber);

  return (
    <div ref={viewportRef} style={viewportStyle} data-pc-canvas="768x512">
      <div style={canvasViewportStyle}>
        <main
          className={className}
          style={canvasStyle}
          data-implementation-scope={
            isP1ApprovedPcScreen(screenNumber) ? "p1-preview" : "p0-live-mapped"
          }
          data-live-route={liveRoute ?? undefined}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
