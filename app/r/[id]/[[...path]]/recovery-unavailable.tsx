import type { Metadata } from "next";
import Link from "next/link";

type RecoveryStatus = "running" | "complete" | "failed";

function boundedRecoveryStatus(status: string): RecoveryStatus {
  return status === "running" || status === "failed" ? status : "complete";
}

const recoveryStateCopy = {
  running: {
    title: "Recovery in progress",
    eyebrow: "Recovery in progress",
    heading: "Alexandria is still reconciling its witnesses.",
    detail: "This recovery is persisted and has not yet declared an outcome.",
  },
  failed: {
    title: "Recovery stopped",
    eyebrow: "Recovery stopped honestly",
    heading: "This place could not be returned.",
    detail: "Alexandria stopped before making an unsupported historical claim.",
  },
  complete: {
    title: "Recovery unavailable",
    eyebrow: "Witness verification failed",
    heading: "Alexandria will not render an unverified recovery.",
    detail: "The recovery record exists, but its persisted evidence packet could not be verified. Nothing has been substituted.",
  },
} as const;

export function recoveryUnavailableMetadata(status: string): Metadata {
  const boundedStatus = boundedRecoveryStatus(status);
  return {
    title: `${recoveryStateCopy[boundedStatus].title} — Alexandria Here`,
    robots: { index: false, follow: false },
  };
}

export function RecoveryUnavailable({
  id,
  normalizedUrl,
  status,
}: {
  id: string;
  normalizedUrl: string;
  status: string;
}) {
  const copy = recoveryStateCopy[boundedRecoveryStatus(status)];
  return (
    <main className="returned-shell">
      <header className="returned-header">
        <div>
          <Link href="/" className="returned-brand">Alexandria Here</Link>
          <p className="original-address">{normalizedUrl}</p>
        </div>
      </header>
      <section className="returned-masthead recovery-unavailable">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.heading}</h1>
        <p className="era-label">{copy.detail}</p>
        <div className="recovery-unavailable-actions">
          <a href={`/r/${id}`} className="recovery-home-link">Check again</a>
          <Link href="/" className="recovery-home-link">Return to Alexandria Here</Link>
        </div>
      </section>
    </main>
  );
}
