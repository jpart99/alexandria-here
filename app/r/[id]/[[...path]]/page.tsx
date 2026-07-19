import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { displayRecoveredTitle } from "../../../../lib/recovery-display";
import { getRecoveryRecord } from "../../../../lib/recovery-store";
import { RestoredSite } from "./restored-site";

type RestoredPageParams = Promise<{ id: string; path?: string[] }>;

export async function generateMetadata({ params }: { params: RestoredPageParams }): Promise<Metadata> {
  const { id } = await params;
  const record = await getRecoveryRecord(id);
  if (!record) return { title: "Recovery not found — Alexandria Here" };
  if (!record.result) {
    const state = record.status === "running"
      ? "Recovery in progress"
      : record.status === "failed"
        ? "Recovery stopped"
        : "Recovery unavailable";
    return {
      title: `${state} — Alexandria Here`,
      robots: { index: false, follow: false },
    };
  }

  const { result } = record;
  const recoveredTitle = displayRecoveredTitle(result);
  const title = `${recoveredTitle} — Alexandria Here`;
  const description = result.outcome === "restored"
    ? `${result.manifest.selectedEraLabel}. A witnessed restoration with every rendered claim linked to public archive evidence.`
    : `An evidence Atlas for ${recoveredTitle}: what survived, what did not connect, and its content-addressed recovery receipt.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function RestoredPage({
  params,
}: {
  params: RestoredPageParams;
}) {
  const { id, path } = await params;
  const record = await getRecoveryRecord(id);
  if (!record) notFound();
  if (!record.result) {
    const running = record.status === "running";
    const failed = record.status === "failed";
    return (
      <main className="returned-shell">
        <header className="returned-header">
          <div>
            <Link href="/" className="returned-brand">Alexandria Here</Link>
            <p className="original-address">{record.normalizedUrl}</p>
          </div>
        </header>
        <section className="returned-masthead recovery-unavailable">
          <p className="eyebrow">{running ? "Recovery in progress" : failed ? "Recovery stopped honestly" : "Witness verification failed"}</p>
          <h1>{running ? "Alexandria is still reconciling its witnesses." : failed ? "This place could not be returned." : "Alexandria will not render an unverified recovery."}</h1>
          <p className="era-label">
            {running
              ? "This recovery is persisted and has not yet declared an outcome."
              : failed
                ? "Alexandria stopped before making an unsupported historical claim."
                : "The recovery record exists, but its persisted evidence packet could not be verified. Nothing has been substituted."}
          </p>
          <div className="recovery-unavailable-actions">
            <a href={`/r/${id}`} className="recovery-home-link">Check again</a>
            <Link href="/" className="recovery-home-link">Return to Alexandria Here</Link>
          </div>
        </section>
      </main>
    );
  }
  const requestedPath = path?.length ? `/${path.join("/")}` : "/";
  const page = record.result.manifest.pages.find((candidate) => candidate.path === requestedPath)
    || (requestedPath === "/" ? record.result.manifest.pages[0] : undefined);
  if (record.result.outcome === "insufficient_evidence" && requestedPath !== "/") notFound();
  if (!page && record.result.outcome === "restored") notFound();
  return <RestoredSite result={record.result} page={page || null} />;
}
