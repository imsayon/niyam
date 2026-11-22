import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = {
  title: "Niyam | Examination operations",
  description: "Niyam — intelligent examination operations, seating and invigilation.",
  applicationName: "Niyam",
  icons: { icon: "/mark.svg" },
};
export const viewport: Viewport = { themeColor: "#142c50", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
