import type { ReactNode } from "react";
import type { Notice } from "./types";
import { pretty } from "./client";
import { ClipboardList, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className={"badge " + String(children).toLowerCase()}>
      {pretty(String(children))}
    </span>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Select({ value, onChange, items, placeholder, required = true }: { value?: string; onChange: (id: string) => void; items: { id: string; name: string }[]; placeholder?: string; required?: boolean }) {
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

export function Blank({ title = "No records yet", children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="blank">
      <ClipboardList size={30} />
      <h3>{title}</h3>
      <p>{children || "Add your first record to get started."}</p>
    </div>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
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

export function Dialog({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
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

export function Toast({ notice, close }: { notice: Notice; close: () => void }) {
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
