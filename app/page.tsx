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
      <header className="landing-header">
        <Link className="landing-brand" href="/">Alexandria Here</Link>
        <nav aria-label="Landing navigation">
          {referencePath ? <Link href={referencePath}>Example recovery</Link> : null}
          <Link href="#evidence-contract-title">How it works</Link>
        </nav>
      </header>
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="landing-frame">
          <div className="landing-copy-block">
            <h1 id="hero-title">Return a vanished address.</h1>
            <p className="tagline">The lost web, present again.</p>
            <RecoveryForm />
            {referencePath ? (
              <Link className="reference-recovery-link" href={referencePath}>
                View a witnessed recovery <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="landing-evidence" aria-labelledby="evidence-contract-title">
        <div className="evidence-intro">
          <h2 id="evidence-contract-title">Not a screenshot.<br />A returned place.</h2>
          <p>
            Alexandria returns only what surviving public evidence can support. It reconciles those witnesses into a coherent, navigable edition; every unsupported gap stays visible.
          </p>
        </div>
        <div className="evidence-contract">
          <dl className="evidence-states">
            <div className="preserved"><dt>Preserved</dt><dd>Exact archived block</dd></div>
            <div className="reconstructed"><dt>Reconstructed from sources</dt><dd>Witnessed structure only</dd></div>
            <div className="missing"><dt>Missing</dt><dd>Absence shown honestly</dd></div>
          </dl>
        </div>
      </section>
    </main>
  );
}
