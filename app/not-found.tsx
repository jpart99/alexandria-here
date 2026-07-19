import Link from "next/link";

export default function NotFound() {
  return (
    <main className="returned-shell">
      <header className="returned-header">
        <div>
          <Link href="/" className="returned-brand">Alexandria Here</Link>
        </div>
      </header>
      <section className="returned-masthead recovery-unavailable">
        <p className="eyebrow">No witnessed recovery</p>
        <h1>This path has no surviving witness here.</h1>
        <p className="era-label">Alexandria found no persisted recovery at this address and will not invent one.</p>
        <Link href="/" className="recovery-home-link">Return to Alexandria Here</Link>
      </section>
    </main>
  );
}
