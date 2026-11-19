import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  CalendarDays,
  Armchair,
  Users,
  GraduationCap,
  ClipboardList,
  FileUp,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  Sun,
  Moon,
  ArrowUpRight,
  ArrowRight,
  Plus,
  X,
  Search,
  Check,
  TriangleAlert,
  Download,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  Play,
  Send,
  Menu,
  History,
  Building2,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Pencil,
  FileText,
  Clock,
} from "lucide-react";
import "@fontsource-variable/manrope";
import "@fontsource-variable/dm-sans";
import "./style.css";

async function api(path, options = {}) {
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
          .map((item) => item.message)
          .join(" · ")
      : "";
    throw new Error(result.error + (detail ? " " + detail : ""));
  }
  return result;
}
const send = (path, data, method = "POST") =>
  api(path, { method, body: JSON.stringify(data) });
const pretty = (value) =>
  value?.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const dateLabel = (value) =>
  new Date(value + "T12:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const empty = {
  events: [],
  sittings: [],
  rooms: [],
  faculty: [],
  students: [],
  enrollments: [],
  leaves: [],
  runs: [],
  imports: [],
};
const policyDefault = {
  patterns: { 3: [{ semester: 3 }, { semester: 5 }, { semester: 7 }] },
  neighbors: true,
  frontBack: false,
  diagonal: false,
  maxDuties: 3,
  leaveBuffer: 0,
  avoidRepeat: true,
};
const nav = [
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
];
function Badge({ children }) {
  return (
    <span className={"badge " + String(children).toLowerCase()}>
      {pretty(String(children))}
    </span>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Select({ value, onChange, items, placeholder, required = true }) {
  return (
    <select
      required={required}
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
function Blank({ title = "No records yet", children }) {
  return (
    <div className="blank">
      <ClipboardList size={30} />
      <h3>{title}</h3>
      <p>{children || "Add your first record to get started."}</p>
    </div>
  );
}
function Table({ headers, children }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((title) => (
              <th key={title}>{title}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Dialog({ title, close, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" onClick={close} aria-label="Close dialog">
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function App() {
  const [session, setSession] = useState(null),
    [loading, setLoading] = useState(true),
    [data, setData] = useState(empty),
    [revision, setRevision] = useState(0);
  const [readyFor, setReadyFor] = useState(null);
  const currentAccount = useRef(null);
  currentAccount.current = session?.account?.id;
  const [page, setPage] = useState("overview"),
    [eventId, setEventId] = useState(""),
    [modal, setModalState] = useState(null),
    [notice, setNotice] = useState(null),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  const setModal = (value) =>
    setModalState(value ? { ...value, revision } : null);
  const [theme, setTheme] = useState(() =>
    localStorage.getItem("niyam-theme") === "dark" ? "dark" : "light",
  );
  const [ai, setAi] = useState(false),
    [connected, setConnected] = useState(true);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("niyam-theme", theme);
  }, [theme]);
  const notify = useCallback(
    (message, error = false) => setNotice({ message, error }),
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8500);
    return () => clearTimeout(timer);
  }, [notice]);
  const refresh = useCallback(async () => {
    const requestedFor = currentAccount.current;
    const row = await api("/workspace");
    if (requestedFor === currentAccount.current) {
      setData(row.data);
      setRevision(row.revision);
      setConnected(true);
      setReadyFor(requestedFor);
    }
    return row;
  }, []);
  useEffect(() => {
    api("/session")
      .then(setSession)
      .catch((error) => notify(error.message, true))
      .finally(() => setLoading(false));
  }, [notify]);
  useEffect(() => {
    if (session?.account?.status !== "active") return;
    refresh().catch((error) => notify(error.message, true));
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
    setPage("overview");
    setModalState(null);
  }, [session?.account?.id]);
  useEffect(() => {
    const expired = () => {
      setSession((old) => ({ ...old, account: null }));
      setReadyFor(null);
      setData(empty);
    };
    window.addEventListener("niyam-session-expired", expired);
    return () => window.removeEventListener("niyam-session-expired", expired);
  }, []);
  const account = session?.account;
  async function act(task, success) {
    setBusy(true);
    try {
      const result = await task();
      await refresh();
      if (success) notify(success);
      return result;
    } catch (error) {
      notify(error.message, true);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save(kind, record, id) {
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
  function drop(kind, row) {
    setModal({ type: "delete", kind, row });
  }
  const go = (value) => {
    setPage(value);
    setMobile(false);
  };
  if (loading)
    return (
      <div className="splash">
        <img src="/mark.svg" alt="" />
        <p>Opening Niyam…</p>
      </div>
    );
  if (!account)
    return (
      <>
        <Login
          session={session}
          login={setSession}
          notify={notify}
          theme={theme}
          setTheme={setTheme}
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
            api("/session")
              .then(setSession)
              .catch((error) => notify(error.message, true))
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
            refresh().catch((error) => notify(error.message, true))
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
  const props = {
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
            <strong>Niyam College</strong>
            <small>Evaluation workspace</small>
          </div>
          <Badge>{account.role}</Badge>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav
            .filter(
              ([id]) =>
                account.role === "admin" ||
                (["overview", "leaves", "settings"].includes(id) &&
                  !(account.role === "student" && id === "leaves")),
            )
            .map(([id, label, Icon]) => (
              <button
                className={page === id ? "active" : ""}
                aria-label={label}
                key={id}
                onClick={() => go(id)}
              >
                <Icon size={19} />
                {label}
                {id === "allocation" && <span className="nav-spark">✦</span>}
                {id === "leaves" &&
                  data.leaves?.some((leave) => leave.status === "pending") && (
                    <span className="nav-dot" />
                  )}
              </button>
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
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon"
              aria-label="Sign out"
              onClick={async () => {
                await api("/session", { method: "DELETE" });
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
          {["students", "faculty"].includes(page) && (
            <Directory {...props} kind={page} />
          )}
          {page === "leaves" && <Leaves {...props} />}
          {page === "imports" && <Imports {...props} />}
          {page === "reports" && <Reports {...props} />}
          {page === "access" && <Access {...props} />}
          {page === "audit" && <Audit notify={notify} />}
          {page === "settings" && (
            <SettingsPage
              {...props}
              setSession={setSession}
              theme={theme}
              setTheme={setTheme}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>Niyam · Examination operations</span>
          <span>Evaluation workspace · Synthetic records</span>
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
      {ai && <Assistant eventId={eventId} close={() => setAi(false)} />}
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
          {["students", "faculty"].includes(modal.type) && (
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
      {notice && <Toast notice={notice} close={() => setNotice(null)} />}
    </div>
  );
}
const descriptions = {
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
const modalTitles = {
  event: "Examination event",
  room: "Room layout",
  sitting: "Exam sitting",
  students: "Student record",
  faculty: "Faculty record",
  enrollment: "Enroll a candidate",
  leave: "Request leave",
};
function Toast({ notice, close }) {
  return (
    <div
      role={notice.error ? "alert" : "status"}
      className={"toast " + (notice.error ? "error" : "")}
    >
      <TriangleAlert size={18} />
      <span>{notice.message}</span>
      <button className="icon" onClick={close} aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
}
const signInRoles = ["admin", "faculty", "student"];

function Login({ session, login, notify, theme, setTheme }) {
  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [release, setRelease] = useState(null);
  const [role, setRole] = useState(() => {
    const selected = new URLSearchParams(location.search).get("role");
    return signInRoles.includes(selected) ? selected : "admin";
  });
  const googleLogin = role !== "admin" && session?.google;
  useEffect(() => {
    api("/releases")
      .then(setRelease)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    const error = url.searchParams.get("signIn");
    if (!error) return;
    notify(
      error === "roster"
        ? "This email has no available roster entry for that role. Contact your administrator."
        : "Google sign-in could not be completed. Try again.",
      true,
    );
    url.searchParams.delete("role");
    url.searchParams.delete("signIn");
    history.replaceState(null, "", url);
  }, [notify]);

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const { url } = await send("/session/google", { role });
      location.assign(url);
    } catch (error) {
      notify(error.message, true);
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "login")
        login({ ...session, ...(await send("/session", { ...body, role })) });
      else if (mode === "register") {
        await send("/register", body);
        notify("Check your inbox to verify your email. Sign in to continue.");
        setMode("login");
      } else {
        await send("/recovery", body);
        notify("If an active account exists, a reset link has been requested.");
      }
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <section className="login-story">
        <a className="brand">
          <img src="/mark.svg" alt="" />
          <span>niyam.</span>
        </a>
        <div className="login-copy">
          <div className="eyebrow">EXAMINATION OPERATIONS, RECONSIDERED</div>
          <h1>
            Every seat.
            <br />
            Every duty.
            <br />
            <em>In order.</em>
          </h1>
          <p>
            From the first timetable to the final room plan.
            <br />
            Bring clarity to your next examination.
          </p>
          <div className="login-visual" aria-hidden="true">
            <div className="login-plan">
              <div className="login-plan-header">
                <span />
                <i />
              </div>
              <div className="login-plan-seats">
                {Array.from({ length: 18 }, (_, seat) => (
                  <i key={seat} />
                ))}
              </div>
            </div>
            <div className="login-sheet">
              <span>
                <Check size={17} strokeWidth={2.5} />
              </span>
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="bench-label">
            INTELLIGENT SEATING · BUILT AROUND YOUR RULES
          </div>
        </div>
        <small>Niyam · An independent examination management platform</small>
      </section>
      <section className="login-form">
        <button
          className="icon theme-login"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle appearance"
        >
          <Sun size={20} />
        </button>
        <div className="login-form-inner">
          <div className="eyebrow">YOUR INSTITUTION. ONE WORKSPACE.</div>
          <h2>
            {mode === "login"
              ? "Welcome back."
              : mode === "register"
                ? "Request an account."
                : "Recover your account."}
          </h2>
          <p>
            {mode === "login"
              ? googleLogin
                ? "Use the Google account listed for you by your administrator."
                : "Sign in to your examination workspace."
              : mode === "register"
                ? "Verify your email before an administrator approves access."
                : "Receive a secure link at your registered email address."}
          </p>
          <div
            aria-label="Sign-in role"
            role="tablist"
            className="login-roles"
            onKeyDown={(event) => {
              const index = signInRoles.indexOf(role);
              const next = {
                ArrowLeft: (index + 2) % 3,
                ArrowRight: (index + 1) % 3,
                Home: 0,
                End: 2,
              }[event.key];
              if (next === undefined || busy || typeof next !== "number")
                return;
              event.preventDefault();
              event.currentTarget.children[next].focus();
              setRole(signInRoles[next]);
              setMode("login");
            }}
          >
            {signInRoles.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                id={"sign-in-" + item}
                aria-selected={item === role}
                aria-controls="sign-in-panel"
                tabIndex={item === role ? 0 : -1}
                disabled={busy}
                onClick={() => {
                  setRole(item);
                  setMode("login");
                }}
              >
                {pretty(item)}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="sign-in-panel"
            aria-labelledby={"sign-in-" + role}
          >
            {googleLogin ? (
              <button
                className="button primary login-google"
                type="button"
                onClick={signInWithGoogle}
                disabled={busy}
              >
                {busy ? "Connecting…" : "Continue with Google"}
                <ArrowRight size={18} />
              </button>
            ) : (
              <form key={role + mode} onSubmit={submit}>
                {mode === "register" && (
                  <>
                    <Field label="Full name">
                      <input name="name" required autoComplete="name" />
                    </Field>
                    <input type="hidden" name="role" value={role} />
                  </>
                )}
                <Field label="Email address">
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@institution.edu"
                    defaultValue={
                      role === "admin" ? session?.adminEmail : undefined
                    }
                    readOnly={role === "admin" && !!session?.adminEmail}
                    required
                  />
                </Field>
                {mode !== "recovery" && (
                  <Field label="Password">
                    <input
                      name="password"
                      type="password"
                      minLength={mode === "register" ? 12 : 1}
                      maxLength={128}
                      autoComplete={
                        mode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                      placeholder="Enter your password"
                      required
                    />
                  </Field>
                )}
                <button className="button primary" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : mode === "login"
                      ? "Sign in"
                      : mode === "register"
                        ? "Request access"
                        : "Send recovery link"}
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
            {!googleLogin && (mode !== "login" || session?.recovery) && (
              <div className="login-links">
                {(mode !== "login" ||
                  (role !== "admin" && session?.registration)) && (
                  <button
                    onClick={() =>
                      setMode(mode === "login" ? "register" : "login")
                    }
                  >
                    {mode === "login" ? "Request access" : "Back to sign in"}
                  </button>
                )}
                {mode !== "recovery" && session?.recovery && (
                  <button onClick={() => setMode("recovery")}>
                    Forgot password?
                  </button>
                )}
              </div>
            )}
          </div>
          <AccountLink notify={notify} />
          <div className="login-download">
            <Download size={19} />
            <div>
              <strong>Niyam for Windows</strong>
              <small>Your workspace, on your desktop.</small>
            </div>
            {release?.windows ? (
              <a className="text-link" href={release.windows}>
                Download <ArrowUpRight size={14} />
              </a>
            ) : (
              <span className="micro">Build in progress</span>
            )}
          </div>
          <div className="login-secure">
            <ShieldCheck size={14} /> Access is scoped to your institutional
            role
          </div>
        </div>
      </section>
    </div>
  );
}
function AccountLink({ notify }) {
  const hash = new URLSearchParams(location.hash.slice(1));
  const purpose = hash.has("reset")
    ? "reset"
    : hash.has("verify")
      ? "verify"
      : null;
  if (!purpose) return null;
  return (
    <form
      className="token-form"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await send("/account-token", {
            token: hash.get(purpose),
            purpose,
            password:
              new FormData(event.currentTarget).get("password") || undefined,
          });
          history.replaceState(null, "", location.pathname);
          notify(
            purpose === "reset"
              ? "Password updated. Sign in again."
              : "Email verified. Await administrator approval.",
          );
        } catch (error) {
          notify(error.message, true);
        }
      }}
    >
      {purpose === "reset" && (
        <Field label="New password">
          <input name="password" type="password" required minLength={12} />
        </Field>
      )}
      <button className="button">
        {purpose === "reset"
          ? "Set new password"
          : "Verify email after signing in"}
      </button>
    </form>
  );
}
function Overview({ data, sessions, event, run, go, setModal }) {
  const scheduled = sessions.filter(
    (sitting) => sitting.status === "scheduled",
  );
  const count = scheduled.reduce(
    (total, sitting) =>
      total + data.enrollments.filter((e) => e.sittingId === sitting.id).length,
    0,
  );
  const used =
    run?.sessions.reduce((total, s) => total + s.seats.length, 0) || 0;
  const capacity = scheduled.reduce(
    (total, sitting) =>
      total +
      sitting.roomIds.reduce(
        (seats, id) =>
          seats +
          (data.rooms
            .find((room) => room.id === id)
            ?.cells.filter((cell) => !cell.blocked).length || 0),
        0,
      ),
    0,
  );
  return (
    <>
      <div className="overview-grid">
        <section className="hero-card">
          <div className="hero-content">
            <div className="eyebrow">CURRENT EXAMINATION</div>
            <h2>{event?.name || "Your next examination starts here."}</h2>
            <p>
              {event
                ? "Coordinate your papers, spaces, and people."
                : "Create an exam, add your roster, and build your first plan."}
            </p>
            <div className="hero-actions">
              <button
                className="button yellow"
                onClick={() =>
                  event ? go("allocation") : setModal({ type: "event" })
                }
              >
                {event ? "Open allocation studio" : "Create examination"}
                <ArrowUpRight size={16} />
              </button>
              {event && <Badge>{event.status}</Badge>}
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-front">EXAMINATION HALL</div>
            {Array.from({ length: 12 }, (_, i) => (
              <div className="art-bench" key={i}>
                {Array.from({ length: 3 }, (_, seat) => (
                  <i key={seat} />
                ))}
              </div>
            ))}
            <div className="art-caption">
              <span /> Every student in the right place
            </div>
          </div>
        </section>
        <section className="readiness panel">
          <div className="panel-title">
            <h3>Plan readiness</h3>
            <ShieldCheck size={17} />
          </div>
          <div className="readiness-number">
            {event?.publishedRunId
              ? "Published"
              : run
                ? "Ready to review"
                : "In preparation"}
          </div>
          <div className="progress">
            <span
              style={{
                width: event?.publishedRunId
                  ? "100%"
                  : run
                    ? "80%"
                    : sessions.length
                      ? "45%"
                      : "5%",
              }}
            />
          </div>
          <ul>
            {[
              ["Exam configured", sessions.length > 0],
              ["Candidates enrolled", count > 0],
              ["Allocation generated", !!run],
              ["Plan published", !!event?.publishedRunId],
            ].map(([title, done]) => (
              <li key={title}>
                <span className={done ? "step-done" : "step-pending"}>
                  {done ? <Check size={12} /> : <Clock size={12} />}
                </span>
                {title}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="stats">
        {[
          [
            data.students.length,
            "Registered candidates",
            GraduationCap,
            "students",
          ],
          [data.faculty.length, "Faculty members", Users, "faculty"],
          [data.rooms.length, "Examination rooms", Building2, "rooms"],
          [sessions.length, "Exam sittings", CalendarDays, "events"],
        ].map(([value, label, Icon, page]) => (
          <button className="stat" key={label} onClick={() => go(page)}>
            <span className="stat-icon">
              <Icon size={20} />
            </span>
            <ArrowUpRight className="stat-arrow" size={16} />
            <strong>{value}</strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="lower-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h3>Exam sittings</h3>
              <p>Your current examination timeline</p>
            </div>
            <button className="text-link" onClick={() => go("events")}>
              View schedule <ArrowRight size={14} />
            </button>
          </div>
          {sessions.length ? (
            <div className="sitting-list">
              {sessions.slice(0, 5).map((sitting) => (
                <div className="sitting-line" key={sitting.id}>
                  <div className="date-tile">
                    <strong>{sitting.date.slice(-2)}</strong>
                    <span>
                      {new Date(sitting.date + "T12:00:00").toLocaleDateString(
                        "en",
                        { month: "short" },
                      )}
                    </span>
                  </div>
                  <div>
                    <h4>{sitting.name}</h4>
                    <p>
                      {sitting.start}–{sitting.end} · {sitting.papers.length}{" "}
                      papers · {sitting.roomIds.length} rooms
                    </p>
                  </div>
                  <Badge>{sitting.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <Blank title="No sittings scheduled" />
          )}
        </section>
        <section className="panel">
          <div className="panel-title">
            <h3>Capacity at a glance</h3>
            <Armchair size={18} />
          </div>
          <div className="capacity-visual">
            <div
              className="capacity-circle"
              style={{
                "--progress":
                  Math.min(100, capacity ? (used / capacity) * 100 : 0) + "%",
              }}
            >
              <div>
                <strong>{used}</strong>
                <span>seats allocated</span>
              </div>
            </div>
            <div className="capacity-key">
              <span>
                <i className="yellow-dot" />
                {capacity} available seats
              </span>
              <span>
                <i className="blue-dot" />
                {count} enrollments
              </span>
              <small>Across scheduled sittings</small>
            </div>
          </div>
          <button className="text-link" onClick={() => go("rooms")}>
            Explore your rooms <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </>
  );
}
function Events({
  data,
  event,
  eventId,
  sessions,
  setModal,
  act,
  revision,
  drop,
  busy,
}) {
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>{event?.name || "Choose an examination"}</h3>
            <p>{event?.cycle}</p>
          </div>
          {event && (
            <div className="button-row">
              <Badge>{event.status}</Badge>
              {event.status === "draft" && (
                <button
                  className="icon"
                  aria-label="Delete examination"
                  onClick={() => drop("events", event)}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                className="button small"
                onClick={() => setModal({ type: "event", row: event })}
              >
                <Pencil size={14} />
                Edit
              </button>
              {event.status === "published" && (
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Withdraw the current plan from student and faculty views?",
                      )
                    )
                      act(
                        () =>
                          send("/events/" + eventId + "/transition", {
                            revision,
                            to: "configured",
                          }),
                        "Published plan withdrawn",
                      );
                  }}
                >
                  Withdraw plan
                </button>
              )}
              {["draft", "published", "completed"].includes(event.status) && (
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        send("/events/" + eventId + "/transition", {
                          revision,
                          to: {
                            draft: "configured",
                            published: "completed",
                            completed: "archived",
                          }[event.status],
                        }),
                      "Event updated",
                    )
                  }
                >
                  {
                    {
                      draft: "Mark configured",
                      published: "Complete event",
                      completed: "Archive event",
                    }[event.status]
                  }
                </button>
              )}
            </div>
          )}
        </div>
        <div className="lifecycle">
          {["Draft", "Configured", "Published", "Completed", "Archived"].map(
            (stage) => (
              <span
                className={
                  event?.status === stage.toLowerCase() ? "current" : ""
                }
                key={stage}
              >
                {stage}
                <ChevronRight size={14} />
              </span>
            ),
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Sittings & papers</h3>
            <p>
              Each sitting can contain several papers and share a set of rooms.
            </p>
          </div>
          <button
            className="button primary"
            disabled={!event}
            onClick={() => setModal({ type: "sitting" })}
          >
            <Plus size={16} />
            Add sitting
          </button>
        </div>
        {sessions.length ? (
          <Table
            headers={[
              "Sitting",
              "Date & time",
              "Papers",
              "Rooms",
              "Candidates",
              "Status",
              "Actions",
            ]}
          >
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                </td>
                <td>
                  {dateLabel(s.date)}
                  <small>
                    {s.start}–{s.end}
                  </small>
                </td>
                <td>
                  {s.papers.map((p) => (
                    <small key={p.id}>
                      {p.code} · Semester {p.semester}
                    </small>
                  ))}
                </td>
                <td>
                  {s.roomIds
                    .map((id) => data.rooms.find((r) => r.id === id)?.name)
                    .join(", ")}
                </td>
                <td>
                  {data.enrollments.filter((e) => e.sittingId === s.id).length}
                </td>
                <td>
                  <Badge>{s.status}</Badge>
                </td>
                <td>
                  <div className="button-row">
                    <button
                      className="icon"
                      aria-label="Edit sitting"
                      onClick={() => setModal({ type: "sitting", row: s })}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon"
                      aria-label="Delete sitting"
                      onClick={() => drop("sittings", s)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Blank title="Add your first sitting" />
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Candidate enrollment</h3>
            <p>Review or remove registrations for this examination.</p>
          </div>
          <button
            className="button"
            disabled={!sessions.length}
            onClick={() => setModal({ type: "enrollment" })}
          >
            <Plus size={15} />
            Enroll candidate
          </button>
        </div>
        <Table
          headers={[
            "Candidate",
            "Sitting",
            "Paper",
            "Accessibility",
            "Actions",
          ]}
        >
          {data.enrollments
            .filter((entry) =>
              sessions.some((sitting) => sitting.id === entry.sittingId),
            )
            .map((entry) => {
              const person = data.students.find(
                (student) => student.id === entry.studentId,
              );
              const sitting = sessions.find(
                (sitting) => sitting.id === entry.sittingId,
              );
              return (
                <tr key={entry.id}>
                  <td>
                    {person?.name}
                    <small>{person?.code}</small>
                  </td>
                  <td>{sitting.name}</td>
                  <td>
                    {
                      sitting.papers.find((paper) => paper.id === entry.paperId)
                        ?.code
                    }
                  </td>
                  <td>{entry.accessible ? "Required" : "Standard"}</td>
                  <td>
                    <button
                      className="icon"
                      aria-label={"Remove enrollment for " + person?.name}
                      onClick={() => drop("enrollments", entry)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
        </Table>
      </section>
    </>
  );
}
function EventForm({ row, save, busy }) {
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        save(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <Field label="Examination name">
        <input
          name="name"
          defaultValue={row?.name}
          required
          maxLength={150}
          placeholder="End-Semester Examinations"
        />
      </Field>
      <Field label="Academic cycle">
        <input
          name="cycle"
          defaultValue={row?.cycle}
          required
          maxLength={150}
          placeholder="2026–27 · Odd semester"
        />
      </Field>
      <button className="button primary" disabled={busy}>
        Save examination
      </button>
    </form>
  );
}
function SittingForm({ data, eventId, row, save, busy }) {
  const [papers, setPapers] = useState(
    row?.papers || [
      {
        id: crypto.randomUUID(),
        code: "",
        name: "",
        semester: 3,
        department: "CSE",
      },
    ],
  );
  const [roomIds, setRoomIds] = useState(row?.roomIds || []);
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          eventId: row?.eventId || eventId,
          papers,
          roomIds,
        });
      }}
    >
      <div className="form-grid">
        <Field label="Sitting name">
          <input name="name" defaultValue={row?.name} required />
        </Field>
        <Field label="Exam date">
          <input name="date" type="date" defaultValue={row?.date} required />
        </Field>
        <Field label="Starts">
          <input
            name="start"
            type="time"
            defaultValue={row?.start || "09:30"}
            required
          />
        </Field>
        <Field label="Ends">
          <input
            name="end"
            type="time"
            defaultValue={row?.end || "12:00"}
            required
          />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={row?.status || "scheduled"}>
            <option>scheduled</option>
            <option>cancelled</option>
          </select>
        </Field>
      </div>
      <h3>Available rooms</h3>
      <div className="checks">
        {data.rooms.map((room) => (
          <label key={room.id}>
            <input
              type="checkbox"
              checked={roomIds.includes(room.id)}
              onChange={(e) =>
                setRoomIds(
                  e.target.checked
                    ? [...roomIds, room.id]
                    : roomIds.filter((id) => id !== room.id),
                )
              }
            />
            {room.name}
          </label>
        ))}
      </div>
      <h3>Papers in this sitting</h3>
      {papers.map((paper, i) => (
        <div className="paper-form" key={paper.id}>
          {[
            ["code", "Paper code"],
            ["name", "Paper name"],
            ["semester", "Semester"],
            ["department", "Department"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                value={paper[key]}
                type={key === "semester" ? "number" : "text"}
                min={1}
                max={16}
                required
                onChange={(e) =>
                  setPapers(
                    papers.map((p, j) =>
                      j === i
                        ? {
                            ...p,
                            [key]:
                              key === "semester"
                                ? Number(e.target.value)
                                : key === "name"
                                  ? e.target.value
                                  : e.target.value.toUpperCase(),
                          }
                        : p,
                    ),
                  )
                }
              />
            </Field>
          ))}
          <button
            type="button"
            className="icon"
            onClick={() => setPapers(papers.filter((_, j) => j !== i))}
            aria-label="Remove paper"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button"
        onClick={() =>
          setPapers([
            ...papers,
            {
              id: crypto.randomUUID(),
              code: "",
              name: "",
              semester: 3,
              department: "CSE",
            },
          ])
        }
      >
        <Plus size={15} />
        Add paper
      </button>
      <button
        className="button primary"
        disabled={busy || !papers.length || !roomIds.length}
      >
        Save sitting
      </button>
    </form>
  );
}
function Directory({ kind, data, setModal, drop, sessions }) {
  const [search, setSearch] = useState("");
  const rows = data[kind].filter((row) =>
    (row.name + row.code + row.email)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-title">
        <div className="search">
          <Search size={16} />
          <input
            placeholder="Search name, ID, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="button-row">
          {kind === "students" && (
            <button
              className="button"
              onClick={() => setModal({ type: "enrollment" })}
              disabled={!sessions.length}
            >
              <Plus size={16} />
              Enroll candidate
            </button>
          )}
          <button
            className="button primary"
            onClick={() => setModal({ type: kind })}
          >
            <Plus size={16} />
            Add {kind === "faculty" ? "faculty" : "student"}
          </button>
        </div>
      </div>
      {rows.length ? (
        <Table
          headers={[
            "Name",
            "Institution ID",
            "Department",
            kind === "students" ? "Semester / enrollment" : "Availability",
            "Email",
            "Actions",
          ]}
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="person">
                  <span className="avatar pale">{row.name[0]}</span>
                  <strong>{row.name}</strong>
                </div>
              </td>
              <td className="mono">{row.code}</td>
              <td>{row.department}</td>
              <td>
                {kind === "students" ? (
                  <>
                    Semester {row.semester}
                    <small>
                      {
                        data.enrollments.filter((e) => e.studentId === row.id)
                          .length
                      }{" "}
                      enrollments
                    </small>
                  </>
                ) : (
                  <Badge>{row.available ? "available" : "unavailable"}</Badge>
                )}
              </td>
              <td>{row.email || "—"}</td>
              <td>
                <div className="button-row">
                  <button
                    className="icon"
                    aria-label={"Edit " + row.name}
                    onClick={() => setModal({ type: kind, row })}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon"
                    aria-label={"Delete " + row.name}
                    onClick={() => drop(kind, row)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Blank title="No matching records" />
      )}
      <div className="table-footer">
        {rows.length} {kind === "faculty" ? "faculty members" : "students"}
      </div>
    </section>
  );
}
function DirectoryForm({ kind, row, save, busy }) {
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.currentTarget));
        save({
          ...values,
          ...(kind === "faculty"
            ? { available: values.available === "yes" }
            : { semester: Number(values.semester) }),
        });
      }}
    >
      <div className="form-grid">
        {[
          ["name", "Full name"],
          ["code", "Institution ID"],
          ["department", "Department"],
          ["email", "Email address"],
        ].map(([key, label]) => (
          <Field label={label} key={key}>
            <input
              name={key}
              type={key === "email" ? "email" : "text"}
              defaultValue={row?.[key] || ""}
              required={key !== "email"}
              maxLength={key === "email" ? 254 : 100}
            />
          </Field>
        ))}
        {kind === "students" ? (
          <Field label="Semester">
            <input
              name="semester"
              type="number"
              min={1}
              max={16}
              required
              defaultValue={row?.semester || 3}
            />
          </Field>
        ) : (
          <Field label="Available for duties">
            <select
              name="available"
              defaultValue={row?.available === false ? "no" : "yes"}
            >
              <option value="yes">Available</option>
              <option value="no">Unavailable</option>
            </select>
          </Field>
        )}
      </div>
      <button className="button primary" disabled={busy}>
        Save record
      </button>
    </form>
  );
}
function EnrollmentForm({ data, sessions, save, busy }) {
  const [sittingId, setSitting] = useState(sessions[0]?.id || "");
  const sitting = sessions.find((s) => s.id === sittingId);
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.currentTarget));
        save({ ...v, sittingId, accessible: v.accessible === "on" });
      }}
    >
      <Field label="Sitting">
        <Select value={sittingId} onChange={setSitting} items={sessions} />
      </Field>
      <Field label="Candidate">
        <select name="studentId" required>
          {data.students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Paper">
        <select name="paperId" required key={sittingId}>
          {sitting?.papers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="check">
        <input name="accessible" type="checkbox" />
        Requires accessible seating
      </label>
      <button className="button primary" disabled={busy}>
        Enroll candidate
      </button>
      <p className="micro">
        Use Import records to enroll candidates in bulk with candidate ID and
        paper code.
      </p>
    </form>
  );
}
function Rooms({ data, setModal, drop }) {
  return (
    <>
      <div className="section-toolbar">
        <span>
          {data.rooms.length} rooms ·{" "}
          {data.rooms.reduce(
            (n, r) => n + r.cells.filter((c) => !c.blocked).length,
            0,
          )}{" "}
          active seats
        </span>
        <button
          className="button primary"
          onClick={() => setModal({ type: "room" })}
        >
          <Plus size={16} />
          Add room
        </button>
      </div>
      <div className="room-cards">
        {data.rooms.map((room) => (
          <section className="panel room-card" key={room.id}>
            <div className="panel-title">
              <div>
                <h3>{room.name}</h3>
                <p>{room.building}</p>
              </div>
              <button
                className="icon"
                onClick={() => setModal({ type: "room", row: room })}
                aria-label="Edit room"
              >
                <Pencil size={16} />
              </button>
            </div>
            <SeatMap cells={room.cells} compact />
            <div className="room-footer">
              <span>
                <strong>{room.cells.filter((c) => !c.blocked).length}</strong>{" "}
                active seats
              </span>
              <span>{room.invigilators} invigilators</span>
              <button
                className="icon"
                onClick={() => drop("rooms", room)}
                aria-label="Delete room"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </section>
        ))}
      </div>
      {!data.rooms.length && <Blank title="No rooms configured" />}
    </>
  );
}
function SeatMap({ cells, seats = [], compact = false, onToggle }) {
  const benches = [...new Set(cells.map((cell) => cell.bench))];
  const firstRow = Math.min(...cells.map((cell) => cell.row));
  const columns = new Set(
    cells.filter((cell) => cell.row === firstRow).map((cell) => cell.bench),
  ).size;
  return (
    <div className={"seat-map " + (compact ? "compact" : "")}>
      <div className="room-front">FRONT OF ROOM</div>
      <div
        className="benches"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(90px, 1fr))` }}
      >
        {benches.map((bench) => (
          <div className="bench" key={bench}>
            <span className="bench-name">{bench}</span>
            <div className="bench-seats">
              {cells
                .filter((cell) => cell.bench === bench)
                .sort((a, b) => a.position - b.position)
                .map((cell) => {
                  const seat = seats.find((seat) => seat.seatId === cell.id);
                  const klass =
                    "seat " +
                    (cell.blocked
                      ? "blocked"
                      : seat
                        ? "sem sem-" + seat.paper.semester
                        : "") +
                    (cell.accessible ? " accessible" : "");
                  const title = cell.blocked
                    ? "Blocked"
                    : seat
                      ? seat.student + " · " + seat.paper.code
                      : cell.accessible
                        ? "Accessible seat"
                        : "Vacant seat";
                  return onToggle ? (
                    <button
                      type="button"
                      key={cell.id}
                      className={klass}
                      title={title}
                      onClick={() => onToggle(cell.id)}
                      aria-label={
                        bench + " seat " + cell.position + " " + title
                      }
                    >
                      {cell.blocked ? <X size={12} /> : cell.position}
                    </button>
                  ) : (
                    <span key={cell.id} className={klass} title={title}>
                      {cell.blocked ? (
                        <X size={12} />
                      ) : seat ? (
                        "S" + seat.paper.semester
                      ) : (
                        cell.position
                      )}
                    </span>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      <div className="seat-legend">
        <span>
          <i />
          Vacant
        </span>
        <span>
          <i className="yellow-dot" />
          Assigned
        </span>
        <span>
          <X size={12} />
          Blocked
        </span>
        {onToggle && <span>Click to block or unblock</span>}
      </div>
    </div>
  );
}
function RoomForm({ row, save, busy }) {
  const [cells, setCells] = useState(row?.cells || createCells(7, 2, 3));
  const [dimensions, setDimensions] = useState({
    rows: 7,
    benches: 2,
    size: 3,
  });
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        const value = Object.fromEntries(new FormData(e.currentTarget));
        save({
          name: value.name,
          building: value.building,
          invigilators: Number(value.invigilators),
          cells,
        });
      }}
    >
      <div className="form-grid">
        <Field label="Room name">
          <input name="name" required defaultValue={row?.name} />
        </Field>
        <Field label="Building">
          <input name="building" required defaultValue={row?.building} />
        </Field>
        <Field label="Invigilators required">
          <input
            name="invigilators"
            type="number"
            min={1}
            max={8}
            defaultValue={row?.invigilators || 2}
          />
        </Field>
      </div>
      <h3>Layout builder</h3>
      <div className="form-grid">
        {[
          ["rows", "Rows", 30],
          ["benches", "Benches per row", 20],
          ["size", "Seats per bench", 20],
        ].map(([key, label, max]) => (
          <Field label={label} key={key}>
            <input
              type="number"
              min={1}
              max={max}
              value={dimensions[key]}
              onChange={(e) =>
                setDimensions({ ...dimensions, [key]: Number(e.target.value) })
              }
            />
          </Field>
        ))}
      </div>
      <button
        type="button"
        className="button"
        disabled={
          dimensions.rows * dimensions.benches * dimensions.size > 600 ||
          dimensions.benches * dimensions.size > 20 ||
          Object.values(dimensions).some((n) => n < 1)
        }
        onClick={() => {
          if (!row || window.confirm("Replace the current room layout?"))
            setCells(
              createCells(dimensions.rows, dimensions.benches, dimensions.size),
            );
        }}
      >
        Generate layout
      </button>
      <p className="micro">
        The first physical row has accessible seats. Maximum 600 seats, 30 rows,
        and 20 seat columns. Generating replaces the layout.
      </p>
      <SeatMap
        cells={cells}
        onToggle={(id) =>
          setCells(
            cells.map((cell) =>
              cell.id === id ? { ...cell, blocked: !cell.blocked } : cell,
            ),
          )
        }
      />
      <button className="button primary" disabled={busy}>
        Save room layout
      </button>
    </form>
  );
}
function createCells(rows, benches, size) {
  return Array.from({ length: rows * benches * size }, (_, i) => ({
    id: "seat-" + (i + 1),
    bench: "B" + (Math.floor(i / size) + 1),
    position: (i % size) + 1,
    row: Math.floor(i / (benches * size)) + 1,
    col: (i % (benches * size)) + 1,
    blocked: false,
    accessible: i < benches * size,
  }));
}
function Allocation({
  data,
  event,
  eventId,
  run,
  sessions,
  revision,
  act,
  notify,
  busy,
}) {
  const [policy, setPolicy] = useState(policyDefault),
    [status, setStatus] = useState(null),
    [sittingId, setSitting] = useState(""),
    [roomId, setRoom] = useState(""),
    [table, setTable] = useState(false);
  const sizes = [
    ...new Set(
      data.rooms.flatMap((room) =>
        [...new Set(room.cells.map((cell) => cell.bench))].map(
          (bench) => room.cells.filter((cell) => cell.bench === bench).length,
        ),
      ),
    ),
  ].sort((a, b) => a - b);
  const sitting =
    run?.sessions.find((s) => s.id === sittingId) || run?.sessions[0];
  const room =
    data.rooms.find(
      (room) => room.id === roomId && sitting?.roomIds.includes(room.id),
    ) || data.rooms.find((room) => room.id === sitting?.roomIds[0]);
  return (
    <>
      <div className="allocation-layout">
        <section className="panel rules-panel">
          <div className="panel-title">
            <div>
              <h3>Allocation rules</h3>
              <p>Saved with every generated plan</p>
            </div>
            <Sparkles size={20} />
          </div>
          <h4>Repeating bench pattern</h4>
          <p className="micro">
            Choose the cohort for each physical seat. Empty positions accept any
            cohort.
          </p>
          {sizes.map((size) => (
            <div className="pattern" key={size}>
              <span>{size} seats per bench</span>
              <div className="pattern-slots">
                {Array.from({ length: size }, (_, index) => (
                  <Field key={index} label={"Seat " + (index + 1)}>
                    <select
                      value={policy.patterns[size]?.[index]?.semester || ""}
                      onChange={(e) => {
                        const list = Array.from(
                          { length: size },
                          (_, i) => policy.patterns[size]?.[i] || {},
                        );
                        list[index] = e.target.value
                          ? { semester: Number(e.target.value) }
                          : {};
                        setPolicy({
                          ...policy,
                          patterns: { ...policy.patterns, [size]: list },
                        });
                      }}
                    >
                      <option value="">Any semester</option>
                      {Array.from({ length: 16 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          Semester {i + 1}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </div>
          ))}
          <details>
            <summary>Paper and department selectors</summary>
            <p className="micro">
              Optional patterns for mixed papers in one semester. Each array
              item accepts semester, paper, and department.
            </p>
            <textarea
              rows={5}
              defaultValue={JSON.stringify(policy.patterns, null, 2)}
              onBlur={(e) => {
                try {
                  const patterns = JSON.parse(e.target.value);
                  if (
                    !patterns ||
                    Array.isArray(patterns) ||
                    typeof patterns !== "object"
                  )
                    throw Error();
                  setPolicy({ ...policy, patterns });
                } catch {
                  notify("Enter a valid JSON object for the patterns.", true);
                }
              }}
            />
          </details>
          <h4>Anti-collusion checks</h4>
          {[
            ["neighbors", "Same-paper neighbors on a bench"],
            ["frontBack", "Same paper directly front or behind"],
            ["diagonal", "Same paper diagonally adjacent"],
            ["avoidRepeat", "Prefer different rooms for faculty"],
          ].map(([key, label]) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={policy[key]}
                onChange={(e) =>
                  setPolicy({ ...policy, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
          <div className="form-grid">
            <Field label="Max duties per faculty">
              <input
                type="number"
                min={1}
                max={20}
                value={policy.maxDuties}
                onChange={(e) =>
                  setPolicy({ ...policy, maxDuties: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Leave buffer days">
              <input
                type="number"
                min={0}
                max={7}
                value={policy.leaveBuffer}
                onChange={(e) =>
                  setPolicy({ ...policy, leaveBuffer: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <button
            className="button primary full"
            disabled={!event || busy}
            onClick={async () => {
              const response = await act(() =>
                send("/events/" + eventId + "/solve", { revision, policy }),
              );
              if (response) {
                setStatus(response.result || response);
                if (response.result)
                  notify(
                    "Draft allocation generated. Review before publishing.",
                  );
              }
            }}
          >
            <Play size={16} />
            {busy ? "Calculating…" : "Generate allocation"}
          </button>
        </section>
        <div>
          <section className="panel">
            <div className="panel-title">
              <div>
                <h3>Room plan</h3>
                <p>
                  {run
                    ? run.sessions.reduce((n, s) => n + s.seats.length, 0) +
                      " candidates assigned across " +
                      run.sessions.length +
                      " sittings"
                    : "Generate a plan to inspect student placements."}
                </p>
              </div>
              {run && (
                <Badge>
                  {event?.publishedRunId === run.id ? "published" : "draft"}
                </Badge>
              )}
            </div>
            {status?.status && status.status !== "feasible" && (
              <div className="inline-error">
                <strong>
                  {status.status === "timed_out"
                    ? "Search limit reached"
                    : "Arrangement infeasible"}
                </strong>
                {status.issues.map((issue) => (
                  <p key={issue}>{issue}</p>
                ))}
              </div>
            )}
            {run && run.revision + (run.publishedAt ? 1 : 0) !== revision && (
              <p className="inline-warning">
                Planning records changed. Generate a fresh plan before
                publishing.
              </p>
            )}
            {run ? (
              <>
                <div className="plan-tools">
                  <Select
                    value={sitting?.id}
                    onChange={setSitting}
                    items={run.sessions}
                  />
                  <Select
                    value={room?.id}
                    onChange={setRoom}
                    items={data.rooms.filter((room) =>
                      sitting?.roomIds.includes(room.id),
                    )}
                  />
                  <button
                    className="button small"
                    onClick={() => setTable(!table)}
                  >
                    {table ? "Room view" : "Table view"}
                  </button>
                </div>
                {room &&
                  (table ? (
                    <Table headers={["Candidate", "Paper", "Bench", "Seat"]}>
                      {sitting.seats
                        .filter((seat) => seat.roomId === room.id)
                        .map((seat) => (
                          <tr key={seat.studentId}>
                            <td>
                              {seat.student}
                              <small>{seat.code}</small>
                            </td>
                            <td>{seat.paper.code}</td>
                            <td>{seat.bench}</td>
                            <td>{seat.position}</td>
                          </tr>
                        ))}
                    </Table>
                  ) : (
                    <SeatMap
                      cells={room.cells}
                      seats={sitting.seats.filter(
                        (seat) => seat.roomId === room.id,
                      )}
                    />
                  ))}
                <div className="plan-summary">
                  <span>
                    <CheckCircle2 size={17} /> All candidates placed
                  </span>
                  <span>
                    <ShieldCheck size={17} /> Hard constraints satisfied
                  </span>
                </div>
                <div className="publish-bar">
                  <p>
                    Publishing makes this revision visible to faculty and
                    students.
                  </p>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      run.revision !== revision ||
                      event?.publishedRunId === run.id
                    }
                    onClick={() =>
                      act(
                        () =>
                          send("/events/" + eventId + "/publish", {
                            revision,
                            runId: run.id,
                          }),
                        "Plan published to students and faculty",
                      )
                    }
                  >
                    <Send size={16} />
                    Publish plan
                  </button>
                </div>
              </>
            ) : (
              <Blank title="Your plan will appear here">
                Configure the exam and enroll candidates, then generate an
                allocation.
              </Blank>
            )}
          </section>
          {sitting && (
            <section className="panel">
              <div className="panel-title">
                <h3>Invigilation duties</h3>
              </div>
              <Table headers={["Room", "Invigilator"]}>
                {sitting.duties.map((duty) => (
                  <tr key={duty.roomId + duty.facultyId}>
                    <td>{duty.room}</td>
                    <td>{duty.faculty}</td>
                  </tr>
                ))}
              </Table>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
function Personal({ data, account, setModal }) {
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>
              {account.role === "student" ? "My exams & seats" : "My duties"}
            </h3>
            <p>Current published examination plans</p>
          </div>
        </div>
        {data.schedules?.length ? (
          <div className="personal-cards">
            {data.schedules.map((item, i) => (
              <article className="personal-card" key={item.id + i}>
                <div className="eyebrow">{item.event}</div>
                <h2>{item.seat?.paper.name || item.name}</h2>
                <p>
                  {dateLabel(item.date)} · {item.start}–{item.end}
                </p>
                <div className="personal-assignment">
                  <div>
                    <span>ROOM</span>
                    <strong>{item.seat?.roomName || item.duty?.room}</strong>
                  </div>
                  {item.seat && (
                    <>
                      <div>
                        <span>BENCH</span>
                        <strong>{item.seat.bench}</strong>
                      </div>
                      <div>
                        <span>POSITION</span>
                        <strong>{item.seat.position}</strong>
                      </div>
                    </>
                  )}
                </div>
                {item.seats && (
                  <details>
                    <summary>Room candidate list ({item.seats.length})</summary>
                    <Table headers={["Candidate", "Paper", "Bench / seat"]}>
                      {item.seats.map((seat) => (
                        <tr key={seat.code}>
                          <td>
                            {seat.student}
                            <small>{seat.code}</small>
                          </td>
                          <td>{seat.paper}</td>
                          <td>
                            {seat.bench} / {seat.position}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </details>
                )}
                <small className="micro">
                  Published revision {item.revision.slice(0, 8)}
                </small>
                <a
                  className="text-link"
                  href={
                    "/api/export/" +
                    encodeURIComponent(item.event) +
                    "/timetable.pdf"
                  }
                >
                  <Download size={14} />
                  Download timetable
                </a>
              </article>
            ))}
          </div>
        ) : (
          <Blank title="Your plan is awaiting publication">
            Your examination office will publish your assignments here.
          </Blank>
        )}
      </section>
      {account.role === "faculty" && (
        <Leaves data={data} account={account} setModal={setModal} />
      )}
    </>
  );
}
function Leaves({ data, account, setModal, act, revision, busy }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h3>Leave requests</h3>
          <p>Approved leave is enforced during allocation.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setModal({ type: "leave" })}
        >
          <Plus size={15} />
          Request leave
        </button>
      </div>
      {data.leaves?.length ? (
        <Table headers={["Faculty", "Dates", "Reason", "Status", "Review"]}>
          {data.leaves.map((leave) => (
            <tr key={leave.id}>
              <td>
                {data.faculty?.find((f) => f.id === leave.facultyId)?.name ||
                  account.name}
              </td>
              <td>
                {dateLabel(leave.from)}
                <small>to {dateLabel(leave.to)}</small>
              </td>
              <td>{leave.reason}</td>
              <td>
                <Badge>{leave.status}</Badge>
              </td>
              <td>
                {account.role === "admin" && leave.status === "pending" && (
                  <div className="button-row">
                    {["approved", "rejected"].map((status) => (
                      <button
                        key={status}
                        className="button small"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () =>
                              send(
                                "/records/leaves/" + leave.id,
                                { revision, record: { status } },
                                "PATCH",
                              ),
                            "Leave " + status,
                          )
                        }
                      >
                        {status === "approved" ? "Approve" : "Reject"}
                      </button>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Blank title="No leave requests" />
      )}
    </section>
  );
}
function LeaveForm({ data, account, save, busy }) {
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          ...(account.role === "faculty"
            ? { facultyId: account.rosterId }
            : {}),
        });
      }}
    >
      {account.role === "admin" && (
        <Field label="Faculty">
          <select name="facultyId" required>
            {data.faculty.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field label="From">
          <input name="from" type="date" required />
        </Field>
        <Field label="To">
          <input name="to" type="date" required />
        </Field>
      </div>
      <Field label="Reason">
        <textarea name="reason" maxLength={400} required rows={3} />
      </Field>
      <button className="button primary" disabled={busy}>
        Submit request
      </button>
    </form>
  );
}
function Reports({ event, run }) {
  return (
    <div className="report-cards">
      {[
        [
          "timetable",
          "Examination timetable",
          CalendarDays,
          "Sittings, times, and assigned rooms.",
        ],
        [
          "seating",
          "Candidate seating plan",
          Armchair,
          "Every candidate, paper, bench, and seat.",
        ],
        [
          "duties",
          "Invigilation roster",
          Users,
          "Room duties for every assigned faculty member.",
        ],
      ].map(([id, title, Icon, description]) => (
        <section className="panel report-card" key={id}>
          <Icon size={30} />
          <h2>{title}</h2>
          <p>{description}</p>
          {run ? (
            <>
              <p className="micro">
                {run.publishedAt ? "Published plan" : "Latest draft"} ·{" "}
                {run.id.slice(0, 8)}
              </p>
              <div className="button-row">
                {["csv", "pdf"].map((format) => (
                  <a
                    className="button"
                    key={format}
                    href={
                      "/api/export/" +
                      event.id +
                      "/" +
                      id +
                      "." +
                      format +
                      "?run=" +
                      run.id
                    }
                  >
                    <Download size={15} />
                    {format.toUpperCase()}
                  </a>
                ))}
              </div>
            </>
          ) : (
            <p className="micro">
              Generate an allocation to download this report.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
function Imports({ data, eventId, sessions, revision, act, notify, busy }) {
  const [kind, setKind] = useState("students"),
    [rows, setRows] = useState([]),
    [text, setText] = useState(""),
    [filename, setFilename] = useState(""),
    [preview, setPreview] = useState(null),
    [parsing, setParsing] = useState(false),
    [sittingId, setSitting] = useState(""),
    [roomId, setRoom] = useState(""),
    [json, setJson] = useState("");
  const body = {
    kind,
    rows,
    revision,
    eventId,
    sittingId: sittingId || sessions[0]?.id,
    roomId: roomId || data.rooms[0]?.id,
  };
  useEffect(() => setPreview(null), [eventId, sittingId, roomId]);
  async function fileChanged(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024)
      return notify("Use a file smaller than 10 MB.", true);
    setParsing(true);
    setPreview(null);
    setText("");
    setRows([]);
    setJson("");
    setFilename(file.name);
    try {
      const ext = file.name.split(".").at(-1).toLowerCase();
      if (["csv", "xlsx", "xls"].includes(ext)) {
        const XLSX = await import("xlsx");
        const book = XLSX.read(await file.arrayBuffer(), {
          type: "array",
          sheetRows: 252,
        });
        const output = XLSX.utils.sheet_to_json(
          book.Sheets[book.SheetNames[0]],
          { defval: "" },
        );
        if (output.length > 250)
          throw Error("Split imports into batches of at most 250 rows.");
        setRows(output);
        setJson(JSON.stringify(output, null, 2));
      } else if (ext === "pdf") {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).href;
        const pdf = await pdfjs.getDocument({
          data: await file.arrayBuffer(),
          isEvalSupported: false,
        }).promise;
        if (pdf.numPages > 30) throw Error("Use PDFs of at most 30 pages.");
        let output = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          output +=
            "\nPage " +
            i +
            "\n" +
            content.items.map((item) => item.str).join(" ");
        }
        if (output.length > 25000)
          throw Error("Split the PDF into smaller documents.");
        setText(output);
        if (!output.trim())
          throw Error(
            "This PDF needs OCR. Export a searchable PDF or spreadsheet.",
          );
      } else if (ext === "txt") setText((await file.text()).slice(0, 25000));
      else throw Error("Select a CSV, Excel, TXT, or searchable PDF.");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setParsing(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h3>Review before committing</h3>
          <p>
            Structured files use direct parsing. Text documents use Gemini
            extraction.
          </p>
        </div>
        <a className="text-link" href={"/templates/" + kind + ".csv"} download>
          <Download size={15} />
          Download CSV template
        </a>
      </div>
      <div className="import-body">
        <div className="form-grid">
          <Field label="Record type">
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPreview(null);
              }}
            >
              {["students", "faculty", "enrollments", "sittings"].map(
                (type) => (
                  <option value={type} key={type}>
                    {pretty(type)}
                  </option>
                ),
              )}
            </select>
          </Field>
          {kind === "enrollments" && (
            <Field label="Enroll into sitting">
              <Select
                value={sittingId || sessions[0]?.id}
                onChange={setSitting}
                items={sessions}
              />
            </Field>
          )}
          {kind === "sittings" && (
            <Field label="Default room">
              <Select
                value={roomId || data.rooms[0]?.id}
                onChange={setRoom}
                items={data.rooms}
              />
            </Field>
          )}
        </div>
        <p className="micro">
          Columns ·{" "}
          {
            {
              students: "code, name, department, semester, email",
              faculty: "code, name, department, email",
              enrollments:
                "code (candidate ID), paper (paper code), accessible (yes/no)",
              sittings:
                "name, code, subject, date, start, end, semester, department",
            }[kind]
          }
        </p>
        <label className="dropzone">
          <FileUp size={31} />
          <strong>
            {parsing
              ? "Reading document…"
              : filename || "Choose a file to import"}
          </strong>
          <span>CSV, Excel, searchable PDF, or TXT · up to 10 MB</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,.txt"
            onChange={(e) => fileChanged(e.target.files[0])}
          />
        </label>
        {text && (
          <>
            <Field label="Document text">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
              />
            </Field>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                const result = await act(() =>
                  send("/ai/extract", { text, kind }),
                );
                if (result) {
                  if (!result.rows.length) {
                    notify(
                      "No records were extracted. Review the document or import a structured file.",
                      true,
                    );
                    return;
                  }
                  setRows(result.rows);
                  setJson(JSON.stringify(result.rows, null, 2));
                  setPreview(null);
                }
              }}
            >
              <Sparkles size={16} />
              Extract with Gemini
            </button>
          </>
        )}
        {rows.length > 0 && (
          <>
            <Field label="Review and edit extracted rows as JSON">
              <textarea
                className="mono"
                rows={9}
                value={json}
                onChange={(e) => {
                  setJson(e.target.value);
                  setPreview(null);
                }}
              />
            </Field>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                try {
                  const changed = JSON.parse(json);
                  if (!Array.isArray(changed))
                    throw Error("Rows must be an array");
                  setRows(changed);
                  const result = await act(() =>
                    send("/import/preview", { ...body, rows: changed }),
                  );
                  if (result) setPreview({ ...result, revision });
                } catch (error) {
                  notify(error.message, true);
                }
              }}
            >
              Validate & preview changes
            </button>
          </>
        )}
        {preview && (
          <div className="import-preview">
            <h3>
              {preview.items.length} valid rows · {preview.errors.length} errors
            </h3>
            {preview.errors.map((error) => (
              <p className="inline-error" key={error.row}>
                Row {error.row} · {error.message}
              </p>
            ))}
            <Table headers={["Row", "Action", "Record"]}>
              {preview.items.slice(0, 20).map((item) => (
                <tr key={item.row}>
                  <td>{item.row}</td>
                  <td>
                    <Badge>{item.action}</Badge>
                  </td>
                  <td>
                    {item.record.name ||
                      item.record.studentId ||
                      item.record.code}
                  </td>
                </tr>
              ))}
            </Table>
            <button
              className="button primary"
              disabled={
                busy || preview.errors.length > 0 || preview.items.length === 0
              }
              onClick={async () => {
                const result = await act(
                  () =>
                    send("/import/commit", {
                      ...body,
                      revision: preview.revision,
                    }),
                  "Import committed",
                );
                if (result) {
                  setRows([]);
                  setJson("");
                  setPreview(null);
                  setFilename("");
                  setText("");
                }
              }}
            >
              <Check size={17} />
              Commit {preview.items.length} rows
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
function Access({ data, act, revision, notify, busy }) {
  const [rows, setRows] = useState([]),
    [links, setLinks] = useState({});
  const refresh = () =>
    api("/accounts")
      .then(setRows)
      .catch((error) => notify(error.message, true));
  useEffect(() => {
    refresh();
  }, [revision]);
  return (
    <section className="panel">
      <div className="panel-title">
        <h3>Institutional accounts</h3>
        <button className="button small" onClick={refresh}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
      <Table
        headers={[
          "Account",
          "Role",
          "Email verified",
          "Status",
          "Roster link / action",
        ]}
      >
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              {row.name}
              <small>{row.email}</small>
            </td>
            <td>{row.role}</td>
            <td>{row.verified ? "Yes" : "Awaiting verification"}</td>
            <td>
              <Badge>{row.status}</Badge>
            </td>
            <td>
              {row.role !== "admin" &&
                (row.status === "pending" ? (
                  <div className="button-row">
                    <Select
                      value={links[row.id]}
                      onChange={(value) =>
                        setLinks({ ...links, [row.id]: value })
                      }
                      placeholder="Link roster record"
                      items={(row.role === "faculty"
                        ? data.faculty
                        : data.students
                      ).map((item) => ({
                        id: item.id,
                        name: item.code + " · " + item.name,
                      }))}
                    />
                    <button
                      className="button small"
                      disabled={busy || !row.verified || !links[row.id]}
                      onClick={async () => {
                        await act(
                          () =>
                            send("/accounts/" + row.id + "/decision", {
                              revision,
                              action: "approve",
                              rosterId: links[row.id],
                            }),
                          "Account approved",
                        );
                        refresh();
                      }}
                    >
                      Approve
                    </button>
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={async () => {
                        await act(
                          () =>
                            send("/accounts/" + row.id + "/decision", {
                              revision,
                              action: "reject",
                            }),
                          "Account rejected",
                        );
                        refresh();
                      }}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  row.status === "active" && (
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={async () => {
                        await act(
                          () =>
                            send("/accounts/" + row.id + "/decision", {
                              revision,
                              action: "disable",
                            }),
                          "Account disabled",
                        );
                        refresh();
                      }}
                    >
                      Disable access
                    </button>
                  )
                ))}
            </td>
          </tr>
        ))}
      </Table>
    </section>
  );
}
function Audit({ notify }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api("/audit")
      .then(setRows)
      .catch((error) => notify(error.message, true));
  }, [notify]);
  return (
    <section className="panel">
      <div className="panel-title">
        <h3>Recent changes</h3>
      </div>
      {rows.length ? (
        <Table headers={["Time", "Action", "Actor", "Target"]}>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>{new Date(row.at).toLocaleString("en-IN")}</td>
              <td>{row.action}</td>
              <td className="mono">{row.actor.slice(0, 8)}</td>
              <td className="mono">{row.target.slice(0, 20)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Blank title="No changes recorded" />
      )}
    </section>
  );
}
function SettingsPage({
  account,
  setSession,
  theme,
  setTheme,
  notify,
  busy,
  act,
}) {
  const [status, setStatus] = useState(null),
    [release, setRelease] = useState(null),
    [key, setKey] = useState("");
  useEffect(() => {
    api("/ai/status")
      .then(setStatus)
      .catch(() => {});
    api("/releases")
      .then(setRelease)
      .catch(() => {});
  }, []);
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-title">
          <h3>Your account</h3>
          <Badge>{account.role}</Badge>
        </div>
        <form
          className="dialog-content"
          onSubmit={async (e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            try {
              const result = await send(
                "/profile",
                {
                  name: values.name,
                  ...(values.password
                    ? { current: values.current, password: values.password }
                    : {}),
                },
                "PATCH",
              );
              setSession((old) => ({ ...old, ...result }));
              notify("Account updated");
            } catch (error) {
              notify(error.message, true);
            }
          }}
        >
          <Field label="Name">
            <input name="name" required defaultValue={account.name} />
          </Field>
          <Field label="Email">
            <input disabled value={account.email} />
          </Field>
          {account.passwordLogin && (
            <>
              <Field label="Current password (for a password change)">
                <input
                  name="current"
                  type="password"
                  autoComplete="current-password"
                />
              </Field>
              <Field label="New password (at least 12 characters)">
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </Field>
            </>
          )}
          <button className="button primary">Save account</button>
        </form>
      </section>
      <div>
        <section className="panel">
          <div className="panel-title">
            <h3>Appearance</h3>
          </div>
          <div className="dialog-content">
            <div className="theme-options">
              {["light", "dark"].map((mode) => (
                <button
                  className={"button " + (theme === mode ? "selected" : "")}
                  key={mode}
                  onClick={() => setTheme(mode)}
                >
                  {mode === "light" ? <Sun size={19} /> : <Moon size={19} />}{" "}
                  {pretty(mode)}
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h3>Gemini integration</h3>
            <Sparkles size={19} />
          </div>
          <div className="dialog-content">
            <Badge>{status?.enabled ? "configured" : "unavailable"}</Badge>
            <p className="micro">
              {status?.model || "Checking provider connection…"}
            </p>
            {account.role === "admin" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const result = await act(
                    () =>
                      send("/ai/config", {
                        key,
                        model: new FormData(e.currentTarget).get("model"),
                      }),
                    "Gemini configuration saved",
                  );
                  if (result) {
                    setKey("");
                    api("/ai/status").then(setStatus);
                  }
                }}
              >
                <Field label="Gemini API key">
                  <input
                    type="password"
                    required
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Model">
                  <input
                    name="model"
                    defaultValue="gemini-3.1-flash-lite"
                    required
                  />
                </Field>
                <button className="button" disabled={busy}>
                  Save & test key
                </button>
                <p className="micro">
                  The key is encrypted on the server. Imported document content
                  is sent to Gemini only when extraction is requested.
                </p>
              </form>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h3>Desktop application</h3>
            <Download size={18} />
          </div>
          <div className="dialog-content">
            {release?.windows ? (
              <>
                <a className="button primary" href={release.windows}>
                  Download for Windows <Download size={16} />
                </a>
                <small className="micro">
                  Evaluation release · Requires an internet connection
                </small>
                {release.sha256 && (
                  <small className="mono">SHA-256 {release.sha256}</small>
                )}
              </>
            ) : (
              <p>The Windows installer is being prepared.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
function Assistant({ eventId, close }) {
  const [question, setQuestion] = useState(""),
    [messages, setMessages] = useState([]),
    [busy, setBusy] = useState(false);
  return (
    <section className="assistant">
      <header>
        <div>
          <Sparkles size={18} />
          <strong>Ask Niyam</strong>
        </div>
        <button className="icon" aria-label="Close assistant" onClick={close}>
          <X size={18} />
        </button>
      </header>
      <div className="chat-messages">
        {!messages.length && (
          <div className="chat-empty">
            <Sparkles size={30} />
            <h3>Your examination assistant</h3>
            <p>
              Ask about your published schedule, faculty coverage, or the
              current examination.
            </p>
          </div>
        )}
        {messages.map((message, i) => (
          <p key={i} className={"message " + message.role}>
            {message.text}
          </p>
        ))}
        {busy && <p className="micro">Checking authorized records…</p>}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!question.trim() || busy) return;
          const text = question;
          setQuestion("");
          setMessages((old) => [...old, { role: "user", text }]);
          setBusy(true);
          try {
            const result = await send("/ai/ask", { eventId, question: text });
            setMessages((old) => [
              ...old,
              { role: "assistant", text: result.answer },
            ]);
          } catch (error) {
            setMessages((old) => [
              ...old,
              { role: "error", text: error.message },
            ]);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your examination…"
          maxLength={600}
          aria-label="Message"
        />
        <button className="icon" disabled={busy} aria-label="Send message">
          <Send size={18} />
        </button>
      </form>
      <small>Answers use the records your role can access.</small>
    </section>
  );
}
createRoot(document.getElementById("root")).render(<App />);
