import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRecoveryRecord } from "../../../../lib/recovery-store";
import { RestoredSite } from "./restored-site";

type RestoredPageParams = Promise<{ id: string; path?: string[] }>;

export async function generateMetadata({ params }: { params: RestoredPageParams }): Promise<Metadata> {
  const { id } = await params;
  const record = await getRecoveryRecord(id);
  if (!record?.result) return { title: "Recovery not found — Alexandria Here" };

  const { result } = record;
  const title = `${result.manifest.recoveredTitle} — Alexandria Here`;
  const description = result.outcome === "restored"
    ? `${result.manifest.selectedEraLabel}. A witnessed restoration with every rendered claim linked to public archive evidence.`
    : `An evidence Atlas for ${result.manifest.recoveredTitle}: what survived, what did not connect, and its content-addressed recovery receipt.`;
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
  if (!record?.result) notFound();
  const requestedPath = path?.length ? `/${path.join("/")}` : "/";
  const page = record.result.manifest.pages.find((candidate) => candidate.path === requestedPath)
    || (requestedPath === "/" ? record.result.manifest.pages[0] : undefined);
  if (record.result.outcome === "insufficient_evidence" && requestedPath !== "/") notFound();
  if (!page && record.result.outcome === "restored") notFound();
  return <RestoredSite result={record.result} page={page || null} />;
}
