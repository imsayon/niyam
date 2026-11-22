export function fixture() {
  const date = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const rooms = ["A-101", "A-102", "B-201"].map((name, index) => ({
    id: "room-" + index,
    name,
    building: index < 2 ? "Academic Block A" : "Academic Block B",
    invigilators: 2,
    cells: Array.from({ length: 42 }, (_, i) => ({
      id: "seat-" + (i + 1),
      bench: "B" + (Math.floor(i / 3) + 1),
      position: (i % 3) + 1,
      row: Math.floor(i / 6) + 1,
      col: (i % 6) + 1,
      blocked: index === 0 && i < 3,
      accessible: i < 6,
    })),
  }));
  const first = [
    "Aarav",
    "Aditi",
    "Amrita",
    "Ananya",
    "Dev",
    "Ishaan",
    "Kavya",
    "Meera",
    "Nisha",
    "Rohan",
  ];
  const last = [
    "Rao",
    "Shetty",
    "Iyer",
    "Nair",
    "Patil",
    "Hegde",
    "Menon",
    "Shah",
    "Das",
    "Kulkarni",
    "Kumar",
    "Bhat",
  ];
  const papers = [
    {
      id: "paper-3",
      code: "CS301",
      name: "Data Structures",
      semester: 3,
      department: "CSE",
    },
    {
      id: "paper-5",
      code: "CS501",
      name: "Database Systems",
      semester: 5,
      department: "CSE",
    },
    {
      id: "paper-7",
      code: "CS701",
      name: "Distributed Systems",
      semester: 7,
      department: "CSE",
    },
  ];
  const students = Array.from({ length: 120 }, (_, i) => ({
    id: "student-" + (i + 1),
    code: "DEMO" + String(i + 1).padStart(3, "0"),
    name: first[i % 10] + " " + last[Math.floor(i / 10)],
    semester: papers[Math.floor(i / 40)].semester,
    department: "CSE",
    email: "student" + (i + 1) + "@example.test",
  }));
  const faculty = Array.from({ length: 12 }, (_, i) => ({
    id: "faculty-" + (i + 1),
    code: "FAC" + String(i + 1).padStart(3, "0"),
    name: "Prof. " + first[i % 10] + " " + last[i],
    department: "CSE",
    email: "faculty" + (i + 1) + "@example.test",
    available: true,
  }));
  return {
    events: [
      {
        id: "demo-event",
        name: "End-Semester Examinations",
        cycle: "Evaluation cycle",
        status: "configured",
        publishedRunId: null,
      },
    ],
    sittings: [
      {
        id: "demo-sitting",
        eventId: "demo-event",
        name: "Morning sitting",
        date,
        start: "09:30",
        end: "12:00",
        status: "scheduled",
        roomIds: rooms.map((room) => room.id),
        papers,
      },
    ],
    rooms,
    faculty,
    students,
    enrollments: students.map((student, i) => ({
      id: "enr-" + (i + 1),
      sittingId: "demo-sitting",
      paperId: papers[Math.floor(i / 40)].id,
      studentId: student.id,
      accessible: i === 0,
    })),
    leaves: [
      {
        id: "leave-demo",
        facultyId: "faculty-12",
        from: date,
        to: date,
        reason: "Personal leave",
        status: "pending",
      },
    ],
    runs: [],
    imports: [],
    references: [],
  };
}
