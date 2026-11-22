// This is an unchanged extraction of the existing Niyam role-scoping function.
// Maintain equivalence tests until all native endpoints replace Express.
export function scoped(data, account) {
  if (account.role === "admin") return data;
  const events = data.events.filter(
    (event) => event.publishedRunId && event.status !== "archived",
  );
  const published = new Set(events.map((event) => event.publishedRunId));
  const schedules = [];
  for (const run of data.runs.filter((run) => published.has(run.id))) {
    const event = events.find((event) => event.id === run.eventId);
    for (const session of run.sessions) {
      const { id, name, date, start, end } = session;
      if (account.role === "student") {
        const seat = session.seats.find(
          (seat) => seat.studentId === account.roster_id,
        );
        if (seat)
          schedules.push({
            id,
            event: event.name,
            name,
            date,
            start,
            end,
            revision: run.id,
            seat,
          });
      } else {
        const duties = session.duties.filter(
          (duty) => duty.facultyId === account.roster_id,
        );
        for (const duty of duties) {
          const seats = session.seats
            .filter((seat) => seat.roomId === duty.roomId)
            .map(({ student, code, paper, bench, position }) => ({
              student,
              code,
              paper: paper.code,
              bench,
              position,
            }));
          schedules.push({
            id,
            event: event.name,
            name,
            date,
            start,
            end,
            revision: run.id,
            duty,
            seats,
          });
        }
      }
    }
  }
  schedules.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return {
    schedules,
    leaves:
      account.role === "faculty"
        ? data.leaves.filter((leave) => leave.facultyId === account.roster_id)
        : [],
  };
}
