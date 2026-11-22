"use client";
import dynamic from "next/dynamic";
const NiyamApp = dynamic(() => import("../../legacy/NiyamApp"), {
  ssr: false,
  loading: () => (
    <main role="status" aria-live="polite" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#101b2b", color: "#f5f7fb", fontFamily: "system-ui" }}>
      Opening Niyam…
    </main>
  ),
});
export default function NiyamShell() { return <NiyamApp />; }
