import type { ScreenProps } from "./types";
import { Armchair, CalendarDays, Download, Users } from "lucide-react";

export function Reports({ event, run }: ScreenProps) {
  return (
    <div className="report-cards">
      {([
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
      ] as const).map(([id, title, Icon, description]) => (
        <section className="panel report-card" key={id}>
          <Icon size={30} />
          <h2>{title}</h2>
          <p>{description}</p>
          {run && event ? (
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
