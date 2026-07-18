import type { Metadata } from "next";
import Link from "next/link";
import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = {
  title: "Alexandria Here — The lost web, present again",
  description: "Return a vanished public site from surviving archive witnesses, with every claim, gap, and decision exposed.",
  openGraph: {
    title: "Alexandria Here — The lost web, present again",
    description: "Witnessed restoration for the lost web: returned sites when evidence connects, honest absence when it does not.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Alexandria Here — The lost web, present again",
    description: "Witnessed restoration for the lost web, with every claim and gap exposed.",
  },
};

export default function Home() {
  const configuredReference = process.env.NEXT_PUBLIC_REFERENCE_RECOVERY_PATH || "";
  const referencePath = /^\/r\/[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(configuredReference)
    ? configuredReference
    : null;
  return (
    <main className="landing-shell">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="brand-mark" aria-hidden="true">AH</div>
        <p className="eyebrow">A witnessed restoration engine</p>
        <h1 id="hero-title">Alexandria Here</h1>
        <p className="tagline">The lost web, present again.</p>
        <p className="hero-copy">
          Enter a vanished address. Alexandria returns the most coherent site its surviving public witnesses can support—and nothing they cannot.
        </p>
        <RecoveryForm />
        {referencePath ? (
          <Link className="reference-recovery-link" href={referencePath}>
            View a witnessed recovery <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        <div className="trust-line">
          <span className="witness-dot" />
          Nothing here is claimed without a witness.
        </div>
      </section>

      <aside className="landing-aside" aria-label="How Alexandria works">
        <p className="aside-number">01</p>
        <h2>Not a screenshot.<br />A returned place.</h2>
        <p>
          Alexandria reads public archive captures, reconciles their timelines, and rebuilds only what can still be demonstrated.
        </p>
        <dl className="principles">
          <div><dt>Preserved</dt><dd>Exact archived evidence</dd></div>
          <div><dt>Reconstructed</dt><dd>Only witnessed structure</dd></div>
          <div><dt>Missing</dt><dd>Absence shown honestly</dd></div>
        </dl>
      </aside>
    </main>
  );
}
