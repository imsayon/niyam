import type { Dispatch, SetStateAction } from "react";
import type { z } from "zod";
import type { schemas, policySchema } from "../../../server/workspace-domain.js";
import type { publicAccount } from "../../lib/security";

export type Account = ReturnType<typeof publicAccount>;
export type Session = {
  account: Account | null;
  adminEmail: string;
  google: boolean;
  registration: boolean;
  recovery: boolean;
};
export type Institution = { name: string; shortName: string };
export type Theme = "light" | "dark";
export type Page = "overview" | "events" | "rooms" | "allocation" | "students" | "faculty" | "leaves" | "imports" | "reports" | "access" | "audit" | "settings";
export type Kind = keyof typeof schemas;
export type DirectoryKind = "faculty" | "students";
type Row<K extends Kind> = z.output<(typeof schemas)[K]> & { id: string };
export type EventRecord = Row<"events"> & { status: string; publishedRunId: string | null };
export type Room = Row<"rooms">;
export type Cell = Room["cells"][number];
export type Sitting = Row<"sittings">;
export type Paper = Sitting["papers"][number];
export type Faculty = Row<"faculty">;
export type Student = Row<"students">;
export type Enrollment = Row<"enrollments">;
export type Leave = Row<"leaves"> & { status: "pending" | "approved" | "rejected" };
export type Reference = Row<"references">;
export type Policy = z.output<typeof policySchema>;
export type Seat = { studentId: string; student: string; code: string; paper: Paper; roomId: string; roomName: string; seatId: string; bench: string; position: number; row: number; col: number };
export type Duty = { roomId: string; room: string; facultyId: string; faculty: string };
export type PlannedSitting = Pick<Sitting, "id" | "name" | "date" | "start" | "end" | "roomIds"> & { seats: Seat[]; duties: Duty[] };
export type PlanFailure = { status: "infeasible" | "timed_out" | "needs_review"; issues: (string | { message: string })[] };
export type Run = { status: "feasible"; sessions: PlannedSitting[]; id: string; eventId: string; at: string; publishedAt?: string; revision: number; policy: Policy };
export type Schedule = Pick<PlannedSitting, "id" | "name" | "date" | "start" | "end"> & {
  event: string;
  revision: string;
  seat?: Seat;
  duty?: Duty;
  seats?: (Pick<Seat, "student" | "code" | "bench" | "position"> & { paper: string })[];
};
export type ImportLog = { id: string; kind: Kind; count: number; at: string };
export type Workspace = {
  events: EventRecord[];
  sittings: Sitting[];
  rooms: Room[];
  faculty: Faculty[];
  students: Student[];
  enrollments: Enrollment[];
  leaves: Leave[];
  runs: Run[];
  imports: ImportLog[];
  references: Reference[];
  schedules: Schedule[];
};
export type WorkspaceResponse = { data: Partial<Workspace>; revision: number };
export type ImportRow = Record<string, unknown>;
export type Classification = {
  destination: string | null;
  evidence: string[];
  semester?: number;
  kind?: string;
  referenceType?: string;
  conflicts?: { table: number; row: number; message: string }[];
};
export type ImportedRecord = Partial<Student & Faculty & Sitting & Reference & Enrollment> & { id: string };
export type ImportPreview = {
  revision: number;
  items: { record: ImportedRecord; row: number; action: "create" | "update" }[];
  errors: { row: number; message: string }[];
  fingerprint: string;
};
export type UploadResult = { rows: ImportRow[]; classification: Classification; text?: string };
export type Release = { windows: string; sha256: string | null };
export type Notice = { message: string; error: boolean };
export type Notify = (message: string, error?: boolean) => void;
export type Act = <T>(task: () => Promise<T>, success?: string) => Promise<T | null>;
export type Save = (record: unknown) => Promise<void>;
export type Modal =
  | { type: "event"; row?: EventRecord }
  | { type: "sitting"; row?: Sitting }
  | { type: "room"; row?: Room }
  | { type: "students" | "faculty"; row?: Student | Faculty }
  | { type: "enrollment" | "leave" }
  | { type: "delete"; kind: Kind; row: { id: string; name?: string; code?: string } };
export type SetModal = (modal: Modal | null) => void;
export type ScreenProps = {
  data: Workspace;
  revision: number;
  event?: EventRecord;
  eventId: string;
  sessions: Sitting[];
  run?: Run;
  act: Act;
  save: (kind: Kind, record: unknown, id?: string) => Promise<void>;
  drop: (kind: Kind, row: { id: string; name?: string; code?: string }) => void;
  busy: boolean;
  setModal: SetModal;
  notify: Notify;
  go: (page: Page) => void;
  account: Account;
};
export type State<T> = Dispatch<SetStateAction<T>>;

declare global {
  interface Window {
    niyamDesktop?: { openLogin: (url: string) => Promise<void> };
  }
}
