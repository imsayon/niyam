import type { Account, Page, Policy, Workspace } from "./types";
import { Armchair, Building2, CalendarDays, ChartNoAxesCombined, ClipboardList, FileUp, GraduationCap, History, LayoutDashboard, Settings, ShieldCheck, Users } from "lucide-react";

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch("/api" + path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
    credentials: "same-origin",
  });
  const result = await res
    .json()
    .catch(() => ({ error: "The server returned an unreadable response." }));
  if (res.status === 401)
    window.dispatchEvent(new Event("niyam-session-expired"));
  if (!res.ok) {
    const detail = Array.isArray(result.details)
      ? result.details
          .slice(0, 3)
          .map((item: { message: string }) => item.message)
          .join(" · ")
      : "";
    throw new Error(result.error + (detail ? " " + detail : ""));
  }
  return result;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export const send = <T = unknown>(path: string, data: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(data) });

export const pretty = (value?: string | null) =>
  value?.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export const dateLabel = (value: string) =>
  new Date(value + "T12:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const empty: Workspace = {
  events: [],
  sittings: [],
  rooms: [],
  faculty: [],
  students: [],
  enrollments: [],
  leaves: [],
  runs: [],
  imports: [],
  references: [],
  schedules: [],
};

export const policyDefault: Policy = {
  patterns: { 3: [{ semester: 3 }, { semester: 5 }, { semester: 7 }] },
  neighbors: true,
  frontBack: false,
  diagonal: false,
  maxDuties: 3,
  leaveBuffer: 0,
  avoidRepeat: true,
};

export const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["events", "Examinations", CalendarDays],
  ["rooms", "Rooms & layouts", Building2],
  ["allocation", "Allocation studio", Armchair],
  ["students", "Students", GraduationCap],
  ["faculty", "Faculty", Users],
  ["leaves", "Leave requests", ClipboardList],
  ["imports", "Import records", FileUp],
  ["reports", "Reports", ChartNoAxesCombined],
  ["access", "Access management", ShieldCheck],
  ["audit", "Activity log", History],
  ["settings", "Settings", Settings],
] as const;

export const pagePath = (page: Page) =>
  page === "overview" ? "/" : "/" + (page === "events" ? "examinations" : page);

export const readPage = (pathname: string): Page =>
  nav.find(
    ([id]) =>
      pagePath(id) === pathname.replace(/\/$/, "") ||
      pagePath(id) === pathname,
  )?.[0] || "overview";

export const canOpen = (role: Account["role"] | undefined, page: Page) =>
  role === "admin" ||
  ["overview", "settings"].includes(page) ||
  (role === "faculty" && page === "leaves");
