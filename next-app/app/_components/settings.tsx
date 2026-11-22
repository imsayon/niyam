import type { Account, Institution, Notify, Release, ScreenProps, Session, State, Theme } from "./types";
import { useEffect, useState } from "react";
import { api, errorMessage, pretty, send } from "./client";
import { Building2, Download, Moon, RefreshCw, Sparkles, Sun } from "lucide-react";
import { Badge, Blank, Field, Select, Table } from "./controls";

type ListedAccount = Account & { verified: boolean };
type AuditEntry = { at: string; action: string; actor: string; target: string };
type AiStatus = { enabled: boolean; model: string };

export function Access({ data, act, revision, notify, busy }: ScreenProps) {
  const [rows, setRows] = useState<ListedAccount[]>([]),
    [links, setLinks] = useState<Record<string, string>>({});
  const refresh = () =>
    api<ListedAccount[]>("/accounts")
      .then(setRows)
      .catch((error) => notify(errorMessage(error), true));
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
                      value={links[row.id] ?? ""}
                      onChange={(value) =>
                        setLinks(old => ({ ...old, [row.id]: value }))
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

export function Audit({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  useEffect(() => {
    api<AuditEntry[]>("/audit")
      .then(setRows)
      .catch((error) => notify(errorMessage(error), true));
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

export function SettingsPage({
  account,
  setSession,
  theme,
  setTheme,
  institution,
  setInstitution,
  notify,
  busy,
  act,
}: ScreenProps & { setSession: State<Session>; theme: Theme; setTheme: (value: Theme) => void; institution: Institution | null; setInstitution: State<Institution | null> }) {
  const [institutionDraft, setInstitutionDraft] = useState({ name: "", shortName: "" });
  useEffect(() => {
    if (institution) setInstitutionDraft(institution);
  }, [institution?.name, institution?.shortName]);
  const [status, setStatus] = useState<AiStatus | null>(null),
    [release, setRelease] = useState<Release | null>(null),
    [key, setKey] = useState("");
  useEffect(() => {
    api<AiStatus>("/ai/status")
      .then(setStatus)
      .catch(() => {});
    api<Release>("/releases")
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
              const result = await send<{ account: Account }>(
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
              notify(errorMessage(error), true);
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
        {account.role === "admin" && (
          <section className="panel">
            <div className="panel-title">
              <h3>Institution</h3>
              <Building2 size={19} />
            </div>
            <form
              className="dialog-content"
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  const saved = await send<Institution>("/institution", institutionDraft, "PUT");
                  setInstitution(saved);
                  notify("Institution details saved");
                } catch (error) {
                  notify(errorMessage(error), true);
                }
              }}
            >
              <Field label="Official institution name">
                <input
                  required maxLength={150} value={institutionDraft.name}
                  onChange={(event) => setInstitutionDraft((old) => ({
                    ...old, name: event.target.value,
                  }))}
                />
              </Field>
              <Field label="Short display name">
                <input
                  required maxLength={32} value={institutionDraft.shortName}
                  onChange={(event) => setInstitutionDraft((old) => ({
                    ...old, shortName: event.target.value,
                  }))}
                />
              </Field>
              <button className="button primary">Save institution</button>
              <p className="micro">
                Shared by all signed-in roles. Changes are persisted in PostgreSQL.
              </p>
            </form>
          </section>
        )}
        <section className="panel">
          <div className="panel-title">
            <h3>Appearance</h3>
          </div>
          <div className="dialog-content">
            <div className="theme-options">
              {(["light", "dark"] as const).map((mode) => (
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
            <h3>Assistant settings</h3>
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
                  const model = new FormData(e.currentTarget).get("model");
                  const result = await act(
                    () =>
                      send("/ai/config", {
                        key,
                        model,
                      }),
                    "Assistant settings saved",
                  );
                  if (result) {
                    setKey("");
                    api<AiStatus>("/ai/status").then(setStatus).catch(error => notify(errorMessage(error), true));
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
                <small className="micro">Requires an internet connection</small>
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
