"use client";

import { FormEvent, useState } from "react";
import type { RecoveryEvent } from "../lib/domain";

const stageOrder = [
  "Finding captures",
  "Reading surviving pages",
  "Rebuilding paths",
  "Verifying witnesses",
  "Returning the site",
];

const stageLabels: Record<RecoveryEvent["stage"], string> = {
  finding_captures: "Finding captures",
  reading_surviving_pages: "Reading surviving pages",
  rebuilding_paths: "Rebuilding paths",
  verifying_witnesses: "Verifying witnesses",
  returning_the_site: "Returning the site",
  complete: "Recovery complete",
  failed: "Recovery stopped",
};

type PersistedRecovery = {
  id: string;
  status: "running" | "complete" | "failed";
  stage: RecoveryEvent["stage"];
  detail: string | null;
  error: string | null;
  resultJson?: string | null;
  result?: unknown | null;
};

function waitForPoll(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function RecoveryForm() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<RecoveryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(false);
    setEvents([]);
    setRunning(true);
    let activeRecoveryId: string | null = null;
    let pollingStarted = false;
    try {
      const response = await fetch("/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (response.status === 409) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        setBusy(true);
        setError(payload.error || "Another recovery is already assembling its witnesses. Try again when it finishes.");
        setRunning(false);
        return;
      }
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "The recovery could not begin.");
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
          setEvents((current) => [...current.filter((item) => item.stage !== update.stage), update]);
          if (update.stage === "failed") throw new Error(update.detail);
          if (update.completed && update.resultPath) {
            window.location.assign(update.resultPath);
            return;
          }
        }
      }
      if (activeRecoveryId) {
        pollingStarted = true;
        await pollPersistedRecovery(activeRecoveryId);
      }
      else throw new Error("The recovery stream ended before it returned an identifier.");
    } catch (caught) {
      if (activeRecoveryId && !pollingStarted) {
        try {
          pollingStarted = true;
          await pollPersistedRecovery(activeRecoveryId);
          return;
        } catch (pollError) {
          setError(pollError instanceof Error ? pollError.message : "The recovery stopped unexpectedly.");
        }
      } else {
        setError(caught instanceof Error ? caught.message : "The recovery stopped unexpectedly.");
      }
      setRunning(false);
    }
  }

  async function pollPersistedRecovery(recoveryId: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const response = await fetch(`/api/recover/${encodeURIComponent(recoveryId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("The persisted recovery state could not be read.");
      const record = await response.json() as PersistedRecovery;
      const update: RecoveryEvent = {
        recoveryId,
        stage: record.stage,
        label: stageLabels[record.stage],
        detail: record.detail || "The recovery is continuing from persisted state.",
      };
      setEvents((current) => [...current.filter((item) => item.stage !== update.stage), update]);
      if (record.status === "complete" && (record.resultJson || record.result)) {
        window.location.assign(`/r/${recoveryId}`);
        return;
      }
      if (record.status === "failed") throw new Error(record.error || record.detail || "The recovery stopped.");
      await waitForPoll(1_000);
    }
    throw new Error(`Recovery ${recoveryId} is still running. Its persisted state is safe to revisit.`);
  }

  const current = events.at(-1);
  return (
    <div className="recovery-form-wrap">
      <form id="recovery-form" className="recovery-form" onSubmit={submit}>
        <label htmlFor="vanished-url">Enter a vanished address.</label>
        <div className="input-row">
          <input
            id="vanished-url"
            name="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.org"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={running}
            aria-invalid={Boolean(error)}
            aria-describedby={["recovery-input-hint", error ? "recovery-error" : running ? "recovery-progress-detail" : null].filter(Boolean).join(" ")}
            required
          />
          <button type="submit" disabled={running}>{running ? "Returning…" : "Return it"}</button>
        </div>
        <p className="recovery-input-hint" id="recovery-input-hint">Public HTTP(S) only. Alexandria reads surviving archive witnesses—not the live origin.</p>
      </form>

      {running && (
        <section className="recovery-progress" role="status" aria-live="polite" aria-label="Recovery progress">
          <div className="progress-track" aria-hidden="true">
            {stageOrder.map((label, index) => {
              const reached = events.some((item) => item.label === label);
              return <span key={label} className={reached ? "reached" : index === 0 ? "waiting" : ""} />;
            })}
          </div>
          <p className="progress-label">{current?.label || "Preparing the recovery"}</p>
          <p className="progress-detail" id="recovery-progress-detail">{current?.detail || "The first witness is being located."}</p>
        </section>
      )}
      {error && (
        <div className={`form-error-card ${busy ? "busy" : ""}`} id="recovery-error" role="alert">
          <p>{error}</p>
          {busy && <button type="submit" form="recovery-form">Try this address again</button>}
        </div>
      )}
    </div>
  );
}
