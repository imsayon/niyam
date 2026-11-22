import type { ScreenProps } from "./types";
import type { CSSProperties } from "react";
import { Armchair, ArrowRight, ArrowUpRight, Building2, CalendarDays, Check, Clock, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { Badge, Blank } from "./controls";

export function Overview({ data, sessions, event, run, go, setModal }: ScreenProps) {
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
  const capacityStyle: CSSProperties & { "--progress": string } = {
    "--progress": Math.min(100, capacity ? (used / capacity) * 100 : 0) + "%",
  };
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
            {([
              ["Exam configured", sessions.length > 0],
              ["Candidates enrolled", count > 0],
              ["Allocation generated", !!run],
              ["Plan published", !!event?.publishedRunId],
            ] as const).map(([title, done]) => (
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
        {([
          [
            data.students.length,
            "Registered candidates",
            GraduationCap,
            "students",
          ],
          [data.faculty.length, "Faculty members", Users, "faculty"],
          [data.rooms.length, "Examination rooms", Building2, "rooms"],
          [sessions.length, "Exam sittings", CalendarDays, "events"],
        ] as const).map(([value, label, Icon, page]) => (
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
              style={capacityStyle}
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
