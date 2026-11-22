"use client";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <main className="splash" role="alert">
      <h1>Niyam couldn’t load this page.</h1>
      <button className="button" onClick={reset}>Try again</button>
    </main>
  );
}
