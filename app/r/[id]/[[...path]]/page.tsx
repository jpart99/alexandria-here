import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { displayRecoveredTitle } from "../../../../lib/recovery-display";
import { isRecoveryId } from "../../../../lib/recovery-id";
import { getRecoveryRecord } from "../../../../lib/recovery-store";
import { RecoveryUnavailable, recoveryUnavailableMetadata } from "./recovery-unavailable";
import { RestoredSite } from "./restored-site";

type RestoredPageParams = Promise<{ id: string; path?: string[] }>;

export async function generateMetadata({ params }: { params: RestoredPageParams }): Promise<Metadata> {
  const { id } = await params;
  if (!isRecoveryId(id)) return { title: "Recovery not found — Alexandria Here" };
  const record = await getRecoveryRecord(id);
  if (!record) return { title: "Recovery not found — Alexandria Here" };
  if (!record.result) return recoveryUnavailableMetadata(record.status);

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
  if (!isRecoveryId(id)) notFound();
  const record = await getRecoveryRecord(id);
  if (!record) notFound();
  if (!record.result) {
    return <RecoveryUnavailable id={id} normalizedUrl={record.normalizedUrl} status={record.status} />;
  }
  const requestedPath = path?.length ? `/${path.join("/")}` : "/";
  const page = record.result.manifest.pages.find((candidate) => candidate.path === requestedPath)
    || (requestedPath === "/" ? record.result.manifest.pages[0] : undefined);
  if (record.result.outcome === "insufficient_evidence" && requestedPath !== "/") notFound();
  if (!page && record.result.outcome === "restored") notFound();
  return <RestoredSite result={record.result} page={page || null} />;
}
