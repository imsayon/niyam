import type { ScreenProps, Save, Cell, Seat, Room } from "./types";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Blank, Field } from "./controls";
import { useState } from "react";

export function Rooms({ data, setModal, drop }: ScreenProps) {
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

export function SeatMap({ cells, seats = [], compact = false, onToggle }: { cells: Cell[]; seats?: Seat[]; compact?: boolean; onToggle?: (id: string) => void }) {
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

export function RoomForm({ row, save, busy }: { row?: Room; save: Save; busy: boolean }) {
  const [cells, setCells] = useState(() => row?.cells || createCells(7, 2, 3));
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
        {([
          ["rows", "Rows", 30],
          ["benches", "Benches per row", 20],
          ["size", "Seats per bench", 20],
        ] as const).map(([key, label, max]) => (
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
          Object.values(dimensions).some((n) => !Number.isInteger(n) || n < 1)
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

function createCells(rows: number, benches: number, size: number): Cell[] {
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
