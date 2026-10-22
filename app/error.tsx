"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading">
      <h1>Something went wrong</h1>
      <p>Your reports are safe. Please try loading the page again.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
