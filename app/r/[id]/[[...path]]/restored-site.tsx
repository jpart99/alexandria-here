"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { EvidenceBlock, KnownAbsence, RecoveryEvent, RecoveryResult, RestoredPage, TemporalCandidateWindow } from "../../../../lib/domain";
import { canonicalPathForReceipt } from "../../../../lib/url-safety";

type View = "site" | "timeline" | "witnesses" | "map" | "receipt";

const views: View[] = ["site", "timeline", "witnesses", "map", "receipt"];

const viewLabels: Record<View, string> = {
  site: "Returned site",
  timeline: "Timeline",
  witnesses: "Witnesses",
  map: "What survived",
  receipt: "Recovery receipt",
};

const statusLabels = {
  preserved: "Preserved",
  reconstructed_from_sources: "Reconstructed from sources",
  missing: "Missing",
} as const;

function routeFor(recoveryId: string, path: string) {
  return path === "/" ? `/r/${recoveryId}` : `/r/${recoveryId}${path}`;
}

function formatWitnessDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPublicWarning(warning: string) {
  if (warning.startsWith("model_fallback:")) {
    return "Model planning was unavailable; Alexandria used its deterministic restoration path.";
  }
  if (warning === "block_limit_reached") {
    return "Additional archive content exceeded this recovery’s bounded evidence limit and was not claimed.";
  }
  if (warning === "archive_inventory_partial") {
    return "Part of the archive inventory was unavailable; Alexandria returned only witnesses supplied by the validated responses.";
  }
  if (warning.startsWith("text_truncated:")) {
    const fragment = warning.slice("text_truncated:".length).replace(/_/g, " ");
    return `An archived ${fragment} exceeded Alexandria's 2,000-character block limit; the bounded fragment and its exact warning were preserved.`;
  }
  if (warning === "missing_link_label") {
    return "An archived internal link had no surviving text label; Alexandria retained only its witnessed target path.";
  }
  if (warning.startsWith("capture_failed:")) {
    const captureId = /^capture_failed:([^:]+):/.exec(warning)?.[1];
    return `Selected archive capture${captureId ? ` ${captureId}` : ""} could not be read safely and was excluded.`;
  }
  return "A bounded recovery warning was recorded in the machine receipt; Alexandria made no unsupported claim from it.";
}

type PersistedRecovery = {
  status: "running" | "complete" | "failed";
  stage: RecoveryEvent["stage"];
  detail: string | null;
  error: string | null;
  result: unknown | null;
};

function waitForPoll(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/**
 * New manifests persist every bounded known absence. Legacy receipts are kept
 * byte-for-byte authoritative and derive the same Atlas list only from accepted
 * absence decisions and their cited link blocks.
 */
export function knownAbsencesForResult(result: RecoveryResult): KnownAbsence[] {
  const canonicalPath = (originalUrl: string) => canonicalPathForReceipt(
    originalUrl,
    result.receipt.receiptVersion,
  );
  const blocks = new Map(result.sources.flatMap((source) => source.blocks).map((block) => [block.id, block]));
  const absences = new Map<string, KnownAbsence>();

  const addAbsence = (id: string, path: string, label: string, candidateBlockIds: readonly string[]) => {
    const sourceBlockIds = [...new Set(candidateBlockIds)].filter((blockId) => {
      const block = blocks.get(blockId);
      if (block?.kind !== "link" || !block.targetUrl) return false;
      try {
        return canonicalPath(block.targetUrl) === path;
      } catch {
        return false;
      }
    });
    if (sourceBlockIds.length === 0) return;
    const exactLabel = sourceBlockIds.map((blockId) => blocks.get(blockId)?.exactText || "").find(Boolean);
    const evidencedLabel = label === path || sourceBlockIds.some((blockId) => blocks.get(blockId)?.exactText === label)
      ? label
      : exactLabel || path;
    const existing = absences.get(path);
    absences.set(path, {
      id: existing?.id || id,
      path,
      label: existing?.label || evidencedLabel,
      sourceBlockIds: [...new Set([...(existing?.sourceBlockIds || []), ...sourceBlockIds])],
    });
  };

  const persistedAbsences = Array.isArray(result.manifest.knownAbsences) ? result.manifest.knownAbsences : [];
  for (const absence of persistedAbsences) {
    if (
      !absence
      || typeof absence.id !== "string"
      || typeof absence.path !== "string"
      || typeof absence.label !== "string"
      || !Array.isArray(absence.sourceBlockIds)
    ) continue;
    addAbsence(absence.id, absence.path, absence.label, absence.sourceBlockIds);
  }
  for (const decision of result.receipt.decisions || []) {
    if (decision.kind !== "known_absence" || decision.result !== "accepted") continue;
    const citedLinks = decision.sourceIds.flatMap((blockId) => {
      const block = blocks.get(blockId);
      if (block?.kind !== "link" || !block.targetUrl) return [];
      try {
        return [{ blockId, path: canonicalPath(block.targetUrl), label: block.exactText }];
      } catch {
        return [];
      }
    });
    for (const path of [...new Set(citedLinks.map((link) => link.path))]) {
      const pathLinks = citedLinks.filter((link) => link.path === path);
      addAbsence(
        decision.targetIds[0] || `absence-${path}`,
        path,
        pathLinks.map((link) => link.label).find(Boolean) || path,
        pathLinks.map((link) => link.blockId),
      );
    }
  }
  for (const page of result.manifest.pages.filter((candidate) => candidate.status === "missing")) {
    addAbsence(page.id, page.path, page.title, page.sourceIds);
  }

  return [...absences.values()].slice(0, 8);
}

export function EvidenceBlockView({ block, witness }: { block: EvidenceBlock; witness: boolean }) {
  const content = block.kind === "image"
    ? (
      <figure className="recovered-image">
        {block.assetUrl ? (
          <>
            {/* Archive URLs are evidence-bearing and cannot be rewritten through an image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={block.assetUrl} alt={block.exactText} loading="lazy" referrerPolicy="no-referrer" />
          </>
        ) : null}
        {block.exactText ? <figcaption>{block.exactText}</figcaption> : null}
      </figure>
    )
    : block.kind === "heading"
      ? <h2>{block.exactText}</h2>
      : block.kind === "quote"
        ? <blockquote>{block.exactText}</blockquote>
        : block.kind === "list_item"
          ? <p className="recovered-list-item">{block.exactText}</p>
          : <p>{block.exactText}</p>;

  return (
    <div className={`evidence-block ${witness ? "witness-visible" : ""}`} data-status="preserved">
      {witness && (
        <a className="block-witness" href={block.archiveUrl} target="_blank" rel="noreferrer">
          <span>Preserved</span>
          <time dateTime={block.capturedAt}>{new Date(block.capturedAt).toLocaleDateString()}</time>
        </a>
      )}
      {content}
    </div>
  );
}

export function RestoredSite({ result, page }: { result: RecoveryResult; page: RestoredPage | null }) {
  const [witness, setWitness] = useState(false);
  const [view, setView] = useState<View>("site");
  const [recoveringEra, setRecoveringEra] = useState<string | null>(null);
  const [eraEvents, setEraEvents] = useState<RecoveryEvent[]>([]);
  const [eraError, setEraError] = useState<string | null>(null);
  const [busyEra, setBusyEra] = useState<TemporalCandidateWindow | null>(null);
  const blockMap = useMemo(
    () => new Map(result.sources.flatMap((source) => source.blocks).map((block) => [block.id, block])),
    [result.sources],
  );
  const pageBlocks = page?.blockIds.map((id) => blockMap.get(id)).filter((block): block is EvidenceBlock => Boolean(block)) || [];
  const chronologicalCaptures = useMemo(
    () => [...result.captures].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)),
    [result.captures],
  );
  const timelineBounds = useMemo(() => {
    const start = Date.parse(result.manifest.selectedWindowStart);
    const end = Date.parse(result.manifest.selectedWindowEnd);
    return { start, duration: Math.max(end - start, 1) };
  }, [result.manifest.selectedWindowEnd, result.manifest.selectedWindowStart]);
  const witnessBlocks = useMemo(
    () => result.sources.flatMap((source) => source.blocks.map((block) => ({ block, source }))),
    [result.sources],
  );
  const sourceMap = useMemo(
    () => new Map(result.sources.map((source) => [source.sourceId, source])),
    [result.sources],
  );
  const primaryDecisions = useMemo(
    () => (result.receipt.decisions || []).filter((decision) => decision.kind === "primary_witness" && decision.result === "accepted"),
    [result.receipt.decisions],
  );
  const eraDecision = (result.receipt.decisions || []).find((decision) => decision.kind === "era_selection" && decision.result === "accepted");
  const pageOrderDecision = (result.receipt.decisions || []).find((decision) => decision.kind === "page_order" && decision.result === "accepted");
  const pageWitnessGroups = useMemo(
    () => result.manifest.pages
      .filter((candidate) => candidate.status !== "missing" && candidate.primarySourceId)
      .map((candidate) => ({
        page: candidate,
        primary: sourceMap.get(candidate.primarySourceId || ""),
        supporting: (candidate.supportingSourceIds || candidate.sourceIds.filter((sourceId) => sourceId !== candidate.primarySourceId)).flatMap((sourceId) => {
          const source = sourceMap.get(sourceId);
          return source ? [source] : [];
        }),
        decision: primaryDecisions.find((decision) => decision.targetIds.includes(candidate.id)),
      })),
    [primaryDecisions, result.manifest.pages, sourceMap],
  );
  const temporalCandidates = (result.temporalCandidates || result.receipt.temporalCandidates || []).slice(0, 3);
  const knownAbsences = useMemo(() => knownAbsencesForResult(result), [result]);
  const undisclosedAbsenceCount = Math.max(0, result.receipt.counts.knownAbsences - knownAbsences.length);

  async function pollAlternateRecovery(recoveryId: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const response = await fetch(`/api/recover/${encodeURIComponent(recoveryId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Alexandria could not read the persisted recovery state.");
      const record = await response.json() as PersistedRecovery;
      const update: RecoveryEvent = {
        recoveryId,
        stage: record.stage,
        label: record.stage === "failed" ? "Recovery stopped" : record.stage === "complete" ? "Recovery complete" : "Recovering the alternate era",
        detail: record.detail || "The recovery is continuing from its persisted state.",
      };
      setEraEvents((current) => [...current.filter((item) => item.stage !== update.stage), update]);
      if (record.status === "complete" && record.result) {
        window.location.assign(`/r/${recoveryId}`);
        return;
      }
      if (record.status === "failed") throw new Error(record.error || record.detail || "This era could not be recovered faithfully.");
      await waitForPoll(1_000);
    }
    throw new Error(`Recovery ${recoveryId} is still running. Its persisted state is safe to revisit.`);
  }

  async function recoverAlternateEra(candidate: TemporalCandidateWindow) {
    setRecoveringEra(candidate.year);
    setEraEvents([]);
    setEraError(null);
    setBusyEra(null);
    let activeRecoveryId: string | null = null;
    let pollingStarted = false;

    try {
      const response = await fetch("/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.normalizedUrl, eraYear: candidate.year }),
      });
      if (response.status === 409) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        setBusyEra(candidate);
        setEraError(payload.error || "Another recovery is already assembling its witnesses. Try this era again when it finishes.");
        return;
      }
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "This era recovery could not begin.");
      }

      activeRecoveryId = response.headers.get("x-recovery-id");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const update = JSON.parse(line) as RecoveryEvent;
          activeRecoveryId = update.recoveryId;
          setEraEvents((current) => [...current.filter((item) => item.stage !== update.stage), update]);
          if (update.stage === "failed") throw new Error(update.detail);
          if (update.completed && update.resultPath) {
            window.location.assign(update.resultPath);
            return;
          }
        }
      }

      if (!activeRecoveryId) throw new Error("The recovery stream ended before returning a persisted identifier.");
      pollingStarted = true;
      await pollAlternateRecovery(activeRecoveryId);
    } catch (caught) {
      if (activeRecoveryId && !pollingStarted) {
        try {
          await pollAlternateRecovery(activeRecoveryId);
          return;
        } catch (pollError) {
          setEraError(pollError instanceof Error ? pollError.message : "This era could not be recovered faithfully.");
        }
      } else {
        setEraError(caught instanceof Error ? caught.message : "This era could not be recovered faithfully.");
      }
    } finally {
      setRecoveringEra(null);
    }
  }

  function moveTabFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = views.indexOf(view);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? views.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + views.length) % views.length;
    const nextView = views[next];
    setView(nextView);
    event.currentTarget.querySelector<HTMLButtonElement>(`#tab-${nextView}`)?.focus();
  }

  function openAtlasView(nextView: View) {
    setView(nextView);
    window.requestAnimationFrame(() => document.getElementById(`panel-${nextView}`)?.focus());
  }

  return (
    <main className={`returned-shell ${witness ? "witness-mode" : ""}`}>
      <header className="returned-header">
        <div>
          <Link href="/" className="returned-brand">Alexandria Here</Link>
          <p className="original-address">{result.normalizedUrl}</p>
        </div>
        {result.outcome === "restored" && view === "site" ? (
          <div className="header-actions">
            <button
              className={`seams-button ${witness ? "active" : ""}`}
              onClick={() => setWitness((value) => !value)}
              aria-label={witness ? "Hide the seams" : "Show the seams"}
              aria-pressed={witness}
            >
              <span className="witness-dot" /> {witness ? "Hide the seams" : "Show the seams"}
            </button>
          </div>
        ) : null}
      </header>

      <section className="returned-masthead">
        <p className="eyebrow">{result.outcome === "restored" ? "Witnessed restoration" : "Insufficient connected evidence"}</p>
        <h1>{result.manifest.recoveredTitle}</h1>
        <p className="era-label">{result.manifest.selectedEraLabel}</p>
        <div className="view-tabs" role="tablist" aria-label="Restoration views" onKeyDown={moveTabFocus}>
          {views.map((item) => (
            <button
              id={`tab-${item}`}
              key={item}
              role="tab"
              aria-controls={view === item ? `panel-${item}` : undefined}
              aria-selected={view === item}
              tabIndex={view === item ? 0 : -1}
              onClick={() => setView(item)}
            >
              {item === "site" && result.outcome === "insufficient_evidence" ? "Overview" : viewLabels[item]}
            </button>
          ))}
        </div>
      </section>

      {view === "site" && (
        <div className={`returned-layout ${result.outcome === "insufficient_evidence" ? "overview-layout" : ""}`} id="panel-site" role="tabpanel" aria-labelledby="tab-site" tabIndex={0}>
          {result.outcome === "restored" ? (
            <nav className="restored-nav" aria-label="Recovered site navigation">
              {result.manifest.navigation.map((item) => {
                const target = result.manifest.pages.find((candidate) => candidate.id === item.pageId);
                if (!target) return null;
                return <Link key={item.pageId} href={routeFor(result.id, target.path)} className={page?.id === target.id ? "current" : ""}>{item.label}</Link>;
              })}
              {result.manifest.pages.filter((item) => item.status === "missing").map((missing) => (
                <Link key={missing.id} href={routeFor(result.id, missing.path)} className={page?.id === missing.id ? "current missing-link" : "missing-link"}>{missing.title}</Link>
              ))}
            </nav>
          ) : null}

          <article className="paper-surface">
            {result.outcome === "insufficient_evidence" ? (
              <section className="insufficient-state atlas-overview">
                <p className="eyebrow">Atlas overview</p>
                <p className="status-chip missing">Insufficient evidence</p>
                <h2>No connected edition survives this evidence window.</h2>
                <p>{result.manifest.insufficientReason}</p>
                <div className="overview-evidence-summary" aria-label="Surviving evidence summary">
                  <div><strong>{result.captures.length}</strong><span>capture witnesses</span></div>
                  <div><strong>{witnessBlocks.length}</strong><span>extracted evidence blocks</span></div>
                  <div><strong>{result.receipt.counts.knownAbsences}</strong><span>known absences</span></div>
                  <div><strong>{temporalCandidates.length}</strong><span>coherent windows</span></div>
                </div>
                <p className="overview-boundary">The surviving records remain fully inspectable, but they do not form a connected edition. No replacement text was synthesized.</p>
                <div className="overview-actions" aria-label="Inspect surviving evidence">
                  <button type="button" onClick={() => openAtlasView("witnesses")}>Inspect witnesses</button>
                  <button type="button" onClick={() => openAtlasView("map")}>Open Ghost Map</button>
                  <button type="button" onClick={() => openAtlasView("timeline")}>Inspect timeline</button>
                </div>
              </section>
            ) : page?.status === "missing" ? (
              <section className="missing-state">
                <p className="status-chip missing">Missing</p>
                <h2>{page.title}</h2>
                <p>{page.missingReason}</p>
                <p className="absence-note">The archive witnesses this path but retains no usable body capture. No replacement text was synthesized.</p>
              </section>
            ) : page ? (
              <>
                <div className="page-title-row">
                  <div>
                    <p className={`status-chip ${page.status}`}>{statusLabels[page.status]}</p>
                    <h2>{page.title}</h2>
                  </div>
                  <p className="source-count">
                    {page.sourceIds.length} source witness{page.sourceIds.length === 1 ? "" : "es"}
                    {page.primarySourceId && (page.supportingSourceIds?.length || 0) > 0 ? ` · 1 primary + ${page.supportingSourceIds.length} alternate${page.supportingSourceIds.length === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <div className="recovered-copy">
                  {pageBlocks.map((block) => <EvidenceBlockView key={block.id} block={block} witness={witness} />)}
                </div>
              </>
            ) : null}
          </article>
        </div>
      )}

      {view === "timeline" && (
        <section className="atlas-surface timeline-surface" id="panel-timeline" role="tabpanel" aria-labelledby="tab-timeline" tabIndex={0}>
          <div className="section-intro">
            <p className="eyebrow">Temporal Evidence Graph</p>
            <h2>Evidence windows found in the record</h2>
            <p>
              Alexandria selected <strong>{result.manifest.selectedEraLabel}</strong>. Each candidate is ranked from this recovery’s persisted capture record by the same deterministic reconciliation pass.
            </p>
          </div>

          {temporalCandidates.length > 0 ? (
            <div className="era-candidates" aria-label="Candidate recovery eras">
              {temporalCandidates.map((candidate, index) => (
                <article className={`era-candidate ${candidate.selected ? "selected" : ""}`} key={candidate.id} aria-current={candidate.selected ? "true" : undefined}>
                  <div className="era-candidate-topline">
                    <span>Candidate {String(index + 1).padStart(2, "0")}</span>
                    {candidate.selected && <strong>Selected edition</strong>}
                  </div>
                  <h3>{candidate.year}</h3>
                  <p className="era-window">
                    <time dateTime={candidate.windowStart}>{formatWitnessDate(candidate.windowStart)}</time>
                    <span aria-hidden="true">—</span>
                    <time dateTime={candidate.windowEnd}>{formatWitnessDate(candidate.windowEnd)}</time>
                  </p>
                  <dl className="era-metrics">
                    <div><dt>Score</dt><dd>{candidate.score.score}</dd></div>
                    <div><dt>Captures</dt><dd>{candidate.captureCount}</dd></div>
                    <div><dt>Page coverage</dt><dd>{candidate.pageCoverage}</dd></div>
                  </dl>
                  <p className="era-reason">{candidate.score.reason}</p>
                  {candidate.selected ? (
                    <span className="current-era-action">You are viewing this edition</span>
                  ) : (
                    <button type="button" className="recover-era-button" disabled={recoveringEra !== null} onClick={() => void recoverAlternateEra(candidate)}>
                      {recoveringEra === candidate.year
                        ? `Reading ${candidate.year}…`
                        : candidate.pageCoverage >= 5
                          ? `Recover ${candidate.year} edition`
                          : `Inspect ${candidate.year} evidence`}
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : <p className="atlas-empty">No alternate coherent window survived the deterministic evidence threshold.</p>}

          {(recoveringEra || eraError) && (
            <section className={`era-recovery-status ${busyEra ? "busy" : ""}`} aria-live="polite" aria-atomic="true">
              <p className="eyebrow">{busyEra ? "Recovery room occupied" : recoveringEra ? "Returning another edition" : "Recovery stopped honestly"}</p>
              {eraError ? <p>{eraError}</p> : (
                <>
                  <strong>{eraEvents.at(-1)?.label || `Preparing ${recoveringEra}`}</strong>
                  <p>{eraEvents.at(-1)?.detail || "Alexandria is locating the witnesses for this exact window."}</p>
                </>
              )}
              {busyEra && (
                <div className="era-status-actions">
                  <button type="button" onClick={() => void recoverAlternateEra(busyEra)}>Try {busyEra.year} again</button>
                  <button type="button" onClick={() => { setBusyEra(null); setEraError(null); }}>Keep this edition</button>
                </div>
              )}
            </section>
          )}

          <div className="capture-distribution" aria-labelledby="distribution-heading">
            <div className="distribution-heading">
              <h3 id="distribution-heading">Selected edition · capture distribution</h3>
              <span>Earlier</span><span>Later</span>
            </div>
            <div className="timeline-track" aria-hidden="true">
              {chronologicalCaptures.map((capture) => {
                const position = Math.min(100, Math.max(0, ((Date.parse(capture.capturedAt) - timelineBounds.start) / timelineBounds.duration) * 100));
                return <span key={capture.id} className="capture-marker" style={{ left: `${position}%` }} />;
              })}
            </div>
            {chronologicalCaptures.length > 0 ? (
              <ol className="timeline-list">
                {chronologicalCaptures.map((capture) => (
                <li key={capture.id}>
                  <time dateTime={capture.capturedAt}>{formatWitnessDate(capture.capturedAt)}</time>
                  <div>
                    <a href={capture.archiveUrl} target="_blank" rel="noreferrer">{capture.originalUrl}</a>
                    <span>{capture.sourceId} · {capture.mimeType || "unknown MIME"} · HTTP {capture.statusCode}</span>
                  </div>
                </li>
                ))}
              </ol>
            ) : <p className="atlas-empty">No usable captures were available for a distribution.</p>}
          </div>
        </section>
      )}

      {view === "witnesses" && (
        <section className="atlas-surface witnesses-surface" id="panel-witnesses" role="tabpanel" aria-labelledby="tab-witnesses" tabIndex={0}>
          <div className="section-intro">
            <p className="eyebrow">Block-level evidence</p>
            <h2>Every rendered claim, with its witness</h2>
            <p>This ledger includes preserved blocks from primary and supporting source records. Only manifest-referenced primary blocks render in the returned site; alternates remain evidence. Alexandria exposes capture facts, source identity, hashes, and extraction warnings without adding an interpretation.</p>
          </div>

          {pageWitnessGroups.length > 0 && (
            <section className="page-witness-atlas" aria-labelledby="page-witness-heading">
              <div className="witness-section-heading">
                <div>
                  <p className="eyebrow">Cross-fragment reconciliation</p>
                  <h3 id="page-witness-heading">Primary and alternate witnesses</h3>
                </div>
                <p>Rendered blocks come only from the selected primary. Alternates remain visible as evidence and are never silently blended.</p>
              </div>
              <div className="page-witness-list">
                {pageWitnessGroups.map(({ page: witnessedPage, primary, supporting, decision }) => {
                  if (!primary) return null;
                  return (
                    <article className="page-witness-card" key={witnessedPage.id}>
                      <header>
                        <div>
                          <span>{witnessedPage.path}</span>
                          <h4>{witnessedPage.title}</h4>
                        </div>
                        <strong>{witnessedPage.sourceIds.length} source{witnessedPage.sourceIds.length === 1 ? "" : "s"}</strong>
                      </header>

                      <div className="primary-witness-record">
                        <span className="witness-role">Selected primary</span>
                        <div>
                          <strong>{primary.title}</strong>
                          <time dateTime={primary.capture.capturedAt}>{formatWitnessDate(primary.capture.capturedAt)}</time>
                          <code>{primary.sourceId}</code>
                          <a href={primary.capture.archiveUrl} target="_blank" rel="noreferrer">Open primary capture</a>
                        </div>
                      </div>

                      {supporting.length > 0 && (
                        <div className="alternate-witnesses">
                          <h5>Alternate witnesses ({supporting.length})</h5>
                          <ol>
                            {supporting.map((alternate) => {
                              const mechanicalWarnings = [...new Set([
                                ...alternate.capture.warnings,
                                ...alternate.warnings,
                                ...(alternate.title !== primary.title ? ["Title differs from the selected primary witness."] : []),
                                ...(alternate.capture.digest && primary.capture.digest && alternate.capture.digest !== primary.capture.digest
                                  ? ["Capture digest differs from the selected primary witness."]
                                  : []),
                              ])];
                              return (
                                <li key={alternate.sourceId}>
                                  <div>
                                    <strong>{alternate.title}</strong>
                                    <time dateTime={alternate.capture.capturedAt}>{formatWitnessDate(alternate.capture.capturedAt)}</time>
                                    <code>{alternate.sourceId}</code>
                                    <a href={alternate.capture.archiveUrl} target="_blank" rel="noreferrer">Open alternate capture</a>
                                  </div>
                                  {mechanicalWarnings.length > 0 ? (
                                    <ul className="conflict-warnings" aria-label="Mechanical conflict warnings">
                                      {mechanicalWarnings.map((warning) => <li key={warning}>{warning.replace(/_/g, " ")}</li>)}
                                    </ul>
                                  ) : <span className="no-conflict-warning">No recorded conflict warnings</span>}
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      )}

                      {decision && (
                        <div className="primary-decision">
                          <span>Accepted primary-selection decision</span>
                          <strong>{decision.proposedBy === "gpt-5.6" ? "GPT-5.6 proposal · deterministic validator accepted" : "Deterministic selection accepted"}</strong>
                          <code>{decision.validatorRule}</code>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <div className="witness-summary" aria-label="Witness summary">
            <div><strong>{witnessBlocks.length}</strong><span>extracted evidence blocks</span></div>
            <div><strong>{result.sources.length}</strong><span>source records</span></div>
            <div><strong>{result.receipt.sourceHashes.length}</strong><span>content hashes</span></div>
          </div>

          {witnessBlocks.length > 0 ? (
            <ol className="witness-ledger">
              {witnessBlocks.map(({ block, source }, index) => {
              const warnings = [...new Set([...source.warnings, ...block.warnings])];
              return (
                <li key={block.id}>
                  <div className="witness-order" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
                  <div className="witness-record">
                    <div className="witness-record-heading">
                      <span className="status-chip preserved">Preserved</span>
                      <span>{block.kind.replace("_", " ")}</span>
                    </div>
                    {block.exactText
                      ? <blockquote>{block.exactText}</blockquote>
                      : block.kind === "link"
                        ? <p className="absence-note">No archived link label survived; Alexandria preserved only the witnessed target URL.</p>
                        : <p className="absence-note">No archived alternative text was present; Alexandria preserved only the witnessed asset URL.</p>}
                    <dl>
                      <div><dt>Captured</dt><dd><time dateTime={block.capturedAt}>{formatWitnessDate(block.capturedAt)}</time></dd></div>
                      <div><dt>Source ID</dt><dd><code>{block.sourceId}</code></dd></div>
                      <div><dt>Block hash</dt><dd><code>{block.contentHash}</code></dd></div>
                      <div><dt>Archive</dt><dd><a href={block.archiveUrl} target="_blank" rel="noreferrer">Open witness</a></dd></div>
                    </dl>
                    <div className={`witness-warnings ${warnings.length === 0 ? "clear" : ""}`}>
                      <strong>{warnings.length === 0 ? "No extraction warnings" : `${warnings.length} extraction warning${warnings.length === 1 ? "" : "s"}`}</strong>
                      {warnings.length > 0 && <ul>{warnings.map((warning) => <li key={warning}>{warning.replace(/_/g, " ")}</li>)}</ul>}
                    </div>
                  </div>
                </li>
              );
              })}
            </ol>
          ) : <p className="atlas-empty">No evidence blocks were rendered. Alexandria has not substituted generated content.</p>}
        </section>
      )}

      {view === "map" && (
        <section className="map-surface" id="panel-map" role="tabpanel" aria-labelledby="tab-map" tabIndex={0}>
          <div className="section-intro">
            <p className="eyebrow">Ghost Map</p>
            <h2 id="map-heading">The shape of what remains</h2>
            <p>Solid rooms survived. Hatched rooms were reconstructed from sources. Dashed rooms are known only through surviving references.</p>
          </div>
          <div className="ghost-map">
            {result.manifest.pages.filter((item) => item.status !== "missing").map((item) => (
              <Link key={item.id} href={routeFor(result.id, item.path)} className={`map-node ${item.status}`}>
                <span>{statusLabels[item.status]}</span>
                <strong>{item.title}</strong>
                <code>{item.path}</code>
              </Link>
            ))}
            {knownAbsences.map((absence) => (
              <div key={absence.id} className="map-node missing">
                <span>Missing</span>
                <strong>{absence.label}</strong>
                <code>{absence.path}</code>
              </div>
            ))}
          </div>
          <div className="refused-panel">
            <h3>Where the record breaks</h3>
            <p>Paths and assets witnessed by surviving references but absent from the selected captures.</p>
            <ul>
              {knownAbsences.map((absence) => <li key={absence.id}>Referenced path <code>{absence.path}</code> has no usable selected capture; cited by {absence.sourceBlockIds.length} surviving link block{absence.sourceBlockIds.length === 1 ? "" : "s"}.</li>)}
              {undisclosedAbsenceCount > 0 && <li>{undisclosedAbsenceCount} additional known absence{undisclosedAbsenceCount === 1 ? " is" : "s are"} counted in this legacy receipt, but its persisted evidence does not expose enough cited path detail to display safely.</li>}
              {(result.warnings || []).map((warning) => <li key={warning}>{formatPublicWarning(warning)}</li>)}
              {knownAbsences.length === 0 && result.receipt.counts.knownAbsences === 0 && (result.warnings || []).length === 0 && (
                <li>No unresolved paths or extraction warnings were recorded for this edition.</li>
              )}
            </ul>
          </div>
        </section>
      )}

      {view === "receipt" && (
        <section className="receipt-surface" id="panel-receipt" role="tabpanel" aria-labelledby="tab-receipt" tabIndex={0}>
          <div className="section-intro">
            <p className="eyebrow">Content-addressed record</p>
            <h2 id="receipt-heading">Recovery Receipt</h2>
            <p>A content-addressed audit record of what Alexandria rendered and why. Its hash identifies the exact manifest; its passing validators establish internal consistency—not historical truth.</p>
            <p>Public archival evidence remains subject to its source rights and archive access terms. Alexandria claims neither ownership nor historical completeness.</p>
          </div>
          <a className="receipt-download" href={`/api/recover/${result.id}/receipt`} download>
            Download receipt JSON
          </a>
          <div className="receipt-grid">
            <div><span>Manifest hash</span><code>{result.receipt.manifestHash}</code></div>
            <div><span>Planner</span><strong>{result.receipt.planner === "gpt-5.6" ? "GPT-5.6 + deterministic validator" : "Deterministic fallback"}</strong></div>
            <div><span>Model used</span><strong>{result.receipt.model || "Not invoked"}</strong></div>
            <div><span>Prompt / schema</span><strong>{result.receipt.promptVersion || "Not invoked"} · {result.receipt.modelSchemaVersion || "legacy receipt"}</strong></div>
            <div><span>Era selection</span><strong>{eraDecision?.proposedBy === "deterministic" && pageOrderDecision ? "Deterministic temporal score" : "Legacy combined decision"}</strong></div>
            <div><span>Page order</span><strong>{pageOrderDecision ? (pageOrderDecision.proposedBy === "gpt-5.6" ? "GPT-5.6 proposal · validated" : "Deterministic fallback") : "Not separated in this receipt"}</strong></div>
            <div><span>Rendered blocks</span><strong>{result.receipt.counts.renderedBlocks}</strong></div>
            <div><span>Known absences</span><strong>{result.receipt.counts.knownAbsences}</strong></div>
          </div>
          <h3>Warnings and bounded exclusions</h3>
          {(result.receipt.warnings || []).length > 0 ? (
            <ul className="validation-list receipt-warning-list">
              {result.receipt.warnings.map((warning) => {
                const owners = warning.occurrences.map((occurrence) =>
                  occurrence.blockId || occurrence.sourceId || occurrence.captureId || occurrence.scope);
                return (
                  <li key={warning.raw}>
                    <strong>{formatPublicWarning(warning.raw)}</strong>
                    <span>
                      {warning.occurrences.length} recorded occurrence{warning.occurrences.length === 1 ? "" : "s"}
                      {owners.length ? ` · ${owners.join(", ")}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="receipt-empty">No recovery warnings or bounded exclusions were recorded.</p>}
          {primaryDecisions.length > 0 && (
            <section className="receipt-decisions" aria-labelledby="receipt-decisions-heading">
              <h3 id="receipt-decisions-heading">Accepted primary-witness decisions</h3>
              <p>Mechanical decision records for pages with more than one surviving capture. No alternate content was merged into the rendered primary.</p>
              <ol>
                {primaryDecisions.map((decision) => {
                  const decidedPage = result.manifest.pages.find((candidate) => decision.targetIds.includes(candidate.id));
                  return (
                    <li key={decision.id}>
                      <div>
                        <strong>{decidedPage?.title || decision.targetIds[0]}</strong>
                        <span>{decision.proposedBy === "gpt-5.6" ? "GPT-5.6 proposal" : "Deterministic proposal"} · accepted</span>
                      </div>
                      <dl>
                        <div><dt>Primary source</dt><dd><code>{decision.primarySourceId}</code></dd></div>
                        <div><dt>Alternate sources</dt><dd>{decision.supportingSourceIds?.length || 0}</dd></div>
                        <div><dt>Validator</dt><dd><code>{decision.validatorRule}</code></dd></div>
                      </dl>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          <h3>Mechanical checks</h3>
          {(result.receipt.validationResults || []).length > 0 ? (
            <ul className="validation-list">
              {result.receipt.validationResults.map((validation) => (
              <li key={validation.rule} className={validation.passed ? "passed" : "failed"}>
                <strong>{validation.passed ? "Passed" : "Failed"}</strong>
                <span>{validation.detail}</span>
              </li>
              ))}
            </ul>
          ) : <p className="receipt-empty">No mechanical validation records were persisted in this receipt version.</p>}
          <details>
            <summary>Source captures ({result.captures.length})</summary>
            {result.captures.length > 0 ? (
              <ol className="capture-list">
                {result.captures.map((capture) => (
                <li key={capture.id}><a href={capture.archiveUrl} target="_blank" rel="noreferrer">{capture.originalUrl}</a><time>{new Date(capture.capturedAt).toLocaleString()}</time></li>
                ))}
              </ol>
            ) : <p className="receipt-empty">No usable source captures were persisted.</p>}
          </details>
        </section>
      )}

      <footer className="returned-footer">
        <span>Alexandria Here</span>
        <span>Every returned block keeps its witness.</span>
        <span>Preservation is not endorsement.</span>
      </footer>
    </main>
  );
}
