import type { FormEvent } from "react";
import type { Account, Notify, Release, Session, State, Theme } from "./types";
import { useEffect, useState } from "react";
import { api, errorMessage, pretty, send } from "./client";
import { ArrowRight, ArrowUpRight, Check, Download, ShieldCheck, Sun } from "lucide-react";
import { Field } from "./controls";

export const signInRoles = ["admin", "faculty", "student"] as const;
type Role = (typeof signInRoles)[number];

export function Login({ session, login, notify, theme, setTheme }: { session: Session; login: State<Session>; notify: Notify; theme: Theme; setTheme: (value: Theme) => void }) {
  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [release, setRelease] = useState<Release | null>(null);
  const [role, setRole] = useState<Role>("admin");
  useEffect(() => {
    const selected = new URLSearchParams(location.search).get("role");
    if (selected === "faculty" || selected === "student") setRole(selected);
  }, []);
  const googleLogin = role !== "admin" && session?.google;
  useEffect(() => {
    api<Release>("/releases")
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
      if (window.niyamDesktop?.openLogin) {
        const { requestId, verifier, url } = await send<{ requestId: string; verifier: string; url: string }>(
          "/session/desktop/start",
          { role },
        );
        await window.niyamDesktop.openLogin(url);
        for (let attempt = 0; attempt < 270; attempt++) {
          const result = await send<{ pending: true } | { pending?: false; account: Account }>("/session/desktop/exchange", {
            requestId,
            verifier,
          });
          if (!result.pending) {
            login({ ...session, account: result.account });
            setBusy(false);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        throw new Error("Desktop sign-in expired. Please try again.");
      } else {
        const { url } = await send<{ url: string }>("/session/google", { role });
        location.assign(url);
      }
    } catch (error) {
      notify(errorMessage(error), true);
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "login") {
        login({ ...session, ...(await send<{ account: Account }>("/session", { ...body, role })) });
      } else if (mode === "register") {
        await send("/register", body);
        notify("Check your inbox to verify your email. Sign in to continue.");
        setMode("login");
      } else {
        await send("/recovery", body);
        notify("If an active account exists, a reset link has been requested.");
      }
    } catch (error) {
      notify(errorMessage(error), true);
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
              const tab = event.currentTarget.children[next];
              if (tab instanceof HTMLButtonElement) tab.focus();
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

export function AccountLink({ notify }: { notify: Notify }) {
  const [fragment, setFragment] = useState("");
  useEffect(() => {
    const sync = () => setFragment(location.hash.slice(1));
    sync();
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, []);
  const hash = new URLSearchParams(fragment);
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
          setFragment("");
          notify(
            purpose === "reset"
              ? "Password updated. Sign in again."
              : "Email verified. Await administrator approval.",
          );
        } catch (error) {
          notify(errorMessage(error), true);
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
