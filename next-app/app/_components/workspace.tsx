"use client";

import { usePathname } from "next/navigation";
import type { Institution, Kind, Modal, Notice, Page, ScreenProps, Session, Theme, WorkspaceResponse } from "./types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, canOpen, empty, errorMessage, nav, pagePath, pretty, readPage, send } from "./client";
import { AccountLink, Login } from "./sign-in";
import { Badge, Dialog, Select, Toast } from "./controls";
import { Building2, ChevronRight, LogOut, Menu, Moon, Plus, Settings, Sparkles, Sun } from "lucide-react";
import { Overview } from "./overview";
import { LeaveForm, Leaves, Personal } from "./personal";
import { EventForm, Events, SittingForm } from "./examinations";
import { RoomForm, Rooms } from "./rooms";
import { Allocation } from "./allocation";
import { Directory, DirectoryForm, EnrollmentForm } from "./directory";
import { Imports } from "./imports";
import { Reports } from "./reports";
import { Access, Audit, SettingsPage } from "./settings";
import { Assistant } from "./assistant";

export function WorkspaceApp({ initialSession }: { initialSession: Session }) {
  const [session, setSession] = useState(initialSession),
    [data, setData] = useState(empty),
    [revision, setRevision] = useState(0);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const currentAccount = useRef<string | undefined>(undefined);
  currentAccount.current = session?.account?.id;
  const refreshTicket = useRef(0);
  const latestRefresh = useRef(0);
  const [importFile, setImportFile] = useState<File | null>(null);
  const route = readPage(usePathname());
  const [eventId, setEventId] = useState(""),
    [modal, setModalState] = useState<(Modal & { revision: number }) | null>(null),
    [notice, setNotice] = useState<Notice | null>(null),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  const setModal = (value: Modal | null) =>
    setModalState(value ? { ...value, revision } : null);
  const [theme, setTheme] = useState<Theme>("light");
  const [ai, setAi] = useState(false),
    [connected, setConnected] = useState(true);
  const [desktopApproval, setDesktopApproval] = useState<string | null>(null);
  useEffect(() => {
    setTheme(localStorage.getItem("niyam-theme") === "dark" ? "dark" : "light");
    if (window.niyamDesktop) return;
    const id = new URLSearchParams(location.search).get("desktop");
    if (id && /^[0-9a-f-]{36}$/i.test(id))
      sessionStorage.setItem("niyam-desktop-request", id);
    setDesktopApproval(sessionStorage.getItem("niyam-desktop-request"));
  }, []);
  const [pairBusy, setPairBusy] = useState(false);
  const dismissDesktopApproval = () => {
    sessionStorage.removeItem("niyam-desktop-request");
    setDesktopApproval(null);
    const url = new URL(location.href);
    url.searchParams.delete("desktop");
    url.searchParams.delete("role");
    history.replaceState(null, "", url);
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  function changeTheme(value: Theme) {
    localStorage.setItem("niyam-theme", value);
    setTheme(value);
  }
  const notify = useCallback(
    (message: string, error = false) => setNotice({ message, error }),
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8500);
    return () => clearTimeout(timer);
  }, [notice]);
  const refresh = useCallback(async () => {
    const requestedFor = currentAccount.current;
    const ticket = ++refreshTicket.current;
    const row = await api<WorkspaceResponse>("/workspace");
    if (requestedFor === currentAccount.current && ticket > latestRefresh.current) {
      latestRefresh.current = ticket;
      setData({ ...empty, ...row.data });
      setRevision(row.revision);
      setConnected(true);
      setReadyFor(requestedFor ?? null);
    }
    return row;
  }, []);
  useEffect(() => {
    if (initialSession.account) return;
    let pending = true;
    // A Strict cookie issued during OAuth becomes visible on the first same-origin request.
    api<Session>("/session")
      .then(observed => { if (pending && observed.account) setSession(current => current.account ? current : observed); })
      .catch(error => { if (pending) notify(errorMessage(error), true); });
    return () => { pending = false; };
  }, [initialSession, notify]);
  useEffect(() => {
    if (!session?.account?.id) {
      setInstitution(null);
      return;
    }
    let active = true;
    api<Institution>("/institution")
      .then((value) => { if (active) setInstitution(value); })
      .catch((error) => { if (active) notify(errorMessage(error), true); });
    return () => { active = false; };
  }, [session?.account?.id, notify]);
  useEffect(() => {
    if (session?.account?.status !== "active") return;
    refresh().catch((error) => notify(errorMessage(error), true));
    const update = () => refresh().catch(() => setConnected(false));
    const timer = setInterval(() => {
      if (!document.hidden) update();
    }, 15000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [session?.account?.id, session?.account?.status, refresh, notify]);
  useEffect(() => {
    if (!eventId || !data.events?.some((event) => event.id === eventId))
      setEventId(data.events?.[0]?.id || "");
  }, [data.events, eventId]);
  useEffect(() => {
    setModalState(null);
  }, [session?.account?.id]);
  useEffect(() => {
    const expired = () => {
      latestRefresh.current = refreshTicket.current;
      setSession((old) => ({ ...old, account: null }));
      setReadyFor(null);
      setData(empty);
    };
    window.addEventListener("niyam-session-expired", expired);
    return () => window.removeEventListener("niyam-session-expired", expired);
  }, []);
  const account = session?.account;
  const page = canOpen(account?.role, route) ? route : "overview";
  useEffect(() => {
    if (account && location.pathname !== pagePath(page))
      history.replaceState(null, "", pagePath(page));
  }, [account, page, route]);
  async function act<T>(task: () => Promise<T>, success?: string) {
    setBusy(true);
    try {
      const result = await task();
      await refresh();
      if (success) notify(success);
      return result;
    } catch (error) {
      notify(errorMessage(error), true);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save(kind: Kind, record: unknown, id?: string) {
    const result = await act(
      () =>
        send(
          "/records/" + kind + (id ? "/" + id : ""),
          { revision: modal?.revision ?? revision, record },
          id ? "PATCH" : "POST",
        ),
      "Record saved",
    );
    if (result) setModal(null);
  }
  function drop(kind: Kind, row: { id: string; name?: string; code?: string }) {
    setModal({ type: "delete", kind, row });
  }
  const go = (value: Page) => {
    if (location.pathname !== pagePath(value))
      history.pushState(null, "", pagePath(value));
    setMobile(false);
  };
  if (!account)
    return (
      <>
        <Login
          session={session}
          login={setSession}
          notify={notify}
          theme={theme}
          setTheme={changeTheme}
        />
        {notice && <Toast notice={notice} close={() => setNotice(null)} />}
      </>
    );
  if (account.status !== "active")
    return (
      <div className="splash">
        <img src="/mark.svg" alt="" />
        <h1>Access requested</h1>
        <p>
          Verify your email, then ask your administrator to approve and link
          your account.
        </p>
        <AccountLink notify={notify} />
        <button
          className="button"
          onClick={() =>
            api<Session>("/session")
              .then(setSession)
              .catch((error) => notify(errorMessage(error), true))
          }
        >
          Check approval status
        </button>
        <button
          onClick={async () => {
            await api("/session", { method: "DELETE" });
            setSession({ ...session, account: null });
          }}
        >
          Sign out
        </button>
      </div>
    );
  if (readyFor !== account.id)
    return (
      <div className="splash">
        <img src="/mark.svg" alt="" />
        <p>Loading your examination workspace…</p>
        <button
          className="button"
          onClick={() =>
            refresh().catch((error) => notify(errorMessage(error), true))
          }
        >
          Retry connection
        </button>
        {notice && <Toast notice={notice} close={() => setNotice(null)} />}
      </div>
    );
  const event = data.events?.find((event) => event.id === eventId);
  const sessions =
    data.sittings?.filter((sitting) => sitting.eventId === eventId) || [];
  const run = data.runs?.findLast((item) => item.eventId === eventId);
  const props: ScreenProps = {
    data,
    revision,
    event,
    eventId,
    sessions,
    run,
    act,
    save,
    drop,
    busy,
    setModal,
    notify,
    go,
    account,
  };
  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <img src="/mark.svg" alt="" />
          <span>
            niyam<span className="brand-dot">.</span>
            <small>EXAMINATION OPERATIONS</small>
          </span>
        </a>
        <div className="institution">
          <span className="institution-icon">
            <Building2 size={19} />
          </span>
          <div>
            <strong title={institution?.name}>{institution?.shortName || "Institution"}</strong>
            <small title={institution?.name}>{institution?.name || "Examination workspace"}</small>
          </div>
          <Badge>{account.role}</Badge>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav
            .filter(([id]) => canOpen(account.role, id))
            .map(([id, label, Icon]) => (
              <a
                className={page === id ? "active" : ""}
                aria-label={label}
                key={id}
                href={pagePath(id)}
                aria-current={page === id ? "page" : undefined}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  go(id);
                }}
              >
                <Icon size={19} />
                {label}
                {id === "allocation" && <span className="nav-spark">✦</span>}
                {id === "leaves" &&
                  data.leaves?.some((leave) => leave.status === "pending") && (
                    <span className="nav-dot" />
                  )}
              </a>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="live-dot" />
            Shared workspace<small>Changes sync across devices</small>
          </div>
          <button className="user-card" onClick={() => go("settings")}>
            <span className="avatar">{account.name[0]}</span>
            <span>
              <strong>{account.name}</strong>
              <small>{pretty(account.role)} account</small>
            </span>
            <Settings size={16} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="overlay"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Navigation"
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{nav.find((item) => item[0] === page)?.[1]}</strong>
          </div>
          <div className="top-actions">
            <span className={"connection " + (!connected ? "lost" : "")}>
              <span />
              {connected ? "Connected" : "Connection interrupted"}
            </span>
            <button
              className="icon"
              aria-label="Toggle appearance"
              onClick={() => changeTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon"
              aria-label="Sign out"
              onClick={async () => {
                await api("/session", { method: "DELETE" });
                latestRefresh.current = refreshTicket.current;
                setSession({ ...session, account: null });
                setData(empty);
                setReadyFor(null);
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {account.role === "admin"
                  ? "EXAMINATION CONTROL"
                  : "YOUR EXAMINATION WORKSPACE"}
              </div>
              <h1>
                {page === "overview"
                  ? account.role === "admin"
                    ? "A clear view. Every exam."
                    : "Your next step, in one place."
                  : nav.find((item) => item[0] === page)?.[1]}
              </h1>
              <p>
                {page === "overview"
                  ? "Plan with confidence. Keep every room, person, and paper in sync."
                  : descriptions[page]}
              </p>
            </div>
            {account.role === "admin" && (
              <div className="heading-actions">
                <Select
                  placeholder="Select examination"
                  value={eventId}
                  onChange={setEventId}
                  items={data.events || []}
                  required={false}
                />
                <button
                  className="button primary"
                  onClick={() => setModal({ type: "event" })}
                >
                  <Plus size={17} />
                  New exam
                </button>
              </div>
            )}
          </div>
          {page === "overview" &&
            (account.role === "admin" ? (
              <Overview {...props} />
            ) : (
              <Personal {...props} />
            ))}
          {page === "events" && <Events {...props} />}
          {page === "rooms" && <Rooms {...props} />}
          {page === "allocation" && <Allocation {...props} />}
          {(page === "students" || page === "faculty") && (
            <Directory {...props} kind={page} />
          )}
          {page === "leaves" && <Leaves {...props} />}
          {page === "imports" && (
            <Imports
              {...props}
              incomingFile={importFile}
              clearFile={setImportFile}
            />
          )}
          {page === "reports" && <Reports {...props} />}
          {page === "access" && <Access {...props} />}
          {page === "audit" && <Audit notify={notify} />}
          {page === "settings" && (
            <SettingsPage
              {...props}
              setSession={setSession}
              theme={theme}
              setTheme={changeTheme}
              institution={institution}
              setInstitution={setInstitution}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>Niyam · Examination operations</span>
          <span>
            {institution?.shortName || "Examination workspace"}
          </span>
        </footer>
      </div>
      <button
        className="ai-launch"
        onClick={() => setAi(!ai)}
        aria-label="Open Niyam assistant"
      >
        <Sparkles size={19} />
        <span>Ask Niyam</span>
      </button>
      {ai && (
        <Assistant
          eventId={eventId}
          close={() => setAi(false)}
          onAttach={
            account.role === "admin"
              ? (file) => {
                  setImportFile(file);
                  setAi(false);
                  go("imports");
                }
              : undefined
          }
        />
      )}
      {modal && (
        <Dialog
          title={
            modal.type === "delete"
              ? "Delete record"
              : modalTitles[modal.type] || "Edit record"
          }
          close={() => setModal(null)}
          wide={["room", "sitting"].includes(modal.type)}
        >
          {modal.type === "event" && (
            <EventForm
              row={modal.row}
              save={(record) => save("events", record, modal.row?.id)}
              busy={busy}
            />
          )}
          {modal.type === "sitting" && (
            <SittingForm
              data={data}
              eventId={eventId}
              row={modal.row}
              save={(record) => save("sittings", record, modal.row?.id)}
              busy={busy}
            />
          )}
          {modal.type === "room" && (
            <RoomForm
              row={modal.row}
              save={(record) => save("rooms", record, modal.row?.id)}
              busy={busy}
            />
          )}
          {(modal.type === "students" || modal.type === "faculty") && (
            <DirectoryForm
              kind={modal.type}
              row={modal.row}
              save={(record) => save(modal.type, record, modal.row?.id)}
              busy={busy}
            />
          )}
          {modal.type === "enrollment" && (
            <EnrollmentForm
              data={data}
              sessions={sessions}
              save={(record) => save("enrollments", record)}
              busy={busy}
            />
          )}
          {modal.type === "leave" && (
            <LeaveForm
              data={data}
              account={account}
              save={(record) => save("leaves", record)}
              busy={busy}
            />
          )}
          {modal.type === "delete" && (
            <div className="dialog-content">
              <p>
                Delete {modal.row.name || modal.row.code || "this record"}?
                Linked records must be removed first.
              </p>
              <button
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  const r = await act(
                    () =>
                      send(
                        "/records/" + modal.kind + "/" + modal.row.id,
                        { revision: modal.revision },
                        "DELETE",
                      ),
                    "Record deleted",
                  );
                  if (r) setModal(null);
                }}
              >
                Delete record
              </button>
            </div>
          )}
        </Dialog>
      )}
      {desktopApproval && (
        <Dialog title="Connect your Windows app" close={dismissDesktopApproval}>
          <div className="dialog-content">
            <p>
              A Niyam desktop application is requesting access as your
              <strong> {pretty(account.role)}</strong> account. Only approve
              if you initiated this sign-in from your computer.
            </p>
            <button
              className="button primary"
              disabled={pairBusy}
              onClick={async () => {
                setPairBusy(true);
                try {
                  await send("/session/desktop/approve", {
                    requestId: desktopApproval,
                  });
                  dismissDesktopApproval();
                  notify("Desktop sign-in approved. You can return to Niyam for Windows.");
                } catch (error) {
                  notify(errorMessage(error), true);
                } finally {
                  setPairBusy(false);
                }
              }}
            >
              {pairBusy ? "Approving…" : "Approve desktop sign-in"}
            </button>
            <button className="button" onClick={dismissDesktopApproval}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
      {notice && <Toast notice={notice} close={() => setNotice(null)} />}
    </div>
  );
}

export const descriptions = {
  events: "Build exam sittings, papers, and enrollment.",
  rooms: "Shape your spaces. Every bench and seat accounted for.",
  allocation: "Turn your institutional rules into a reproducible plan.",
  students: "Manage candidate records and exam enrollment.",
  faculty: "Keep your invigilator directory and availability up to date.",
  leaves: "Review availability before committing duties.",
  imports: "Bring your records in, review the changes, then commit.",
  reports: "Download the plans your examination teams need.",
  access: "Approve verified accounts and link them to the right person.",
  audit: "A record of changes across the workspace.",
  settings: "Manage your account, appearance, and integrations.",
};

export const modalTitles = {
  event: "Examination event",
  room: "Room layout",
  sitting: "Exam sitting",
  students: "Student record",
  faculty: "Faculty record",
  enrollment: "Enroll a candidate",
  leave: "Request leave",
};
