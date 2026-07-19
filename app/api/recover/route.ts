import { z } from "zod";
import { waitUntil } from "cloudflare:workers";
import { createRecoveryRecord, failRecovery, RecoveryBusyError, RecoveryIdCollisionError } from "../../../lib/recovery-store";
import { runRecovery } from "../../../lib/recover";
import { validateSubmittedUrl } from "../../../lib/url-safety";
import { recoveryClientKey, RecoveryRateLimitError, recoveryRateLimitResponse } from "../../../lib/recovery-rate-limit";
import { allocateRecoveryId } from "../../../lib/recovery-id";
import { isJsonMediaType } from "../../../lib/media-type";
import { readBoundedRequestBody } from "../../../lib/request-body";

const RequestSchema = z.object({
  url: z.string().min(1).max(2_048),
  eraYear: z.string().regex(/^\d{4}$/, "Era year must contain exactly four digits.").optional(),
}).strict();
const MAX_REQUEST_BYTES = 4_096;

export async function POST(request: Request) {
  let submittedUrl: string;
  let normalizedUrl: string;
  let requestedEraYear: string | undefined;
  if (!isJsonMediaType(request.headers.get("content-type"))) {
    return Response.json(
      { error: "Send the recovery address as JSON." },
      { status: 415, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  }
  try {
    const rawBody = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
    const body = RequestSchema.parse(JSON.parse(rawBody));
    submittedUrl = body.url;
    normalizedUrl = validateSubmittedUrl(body.url);
    requestedEraYear = body.eraYear;
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || "Enter a valid public website address."
      : error instanceof Error ? error.message : "Enter a valid public website address.";
    return Response.json(
      { error: message },
      { status: 400, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  }

  let clientKeyHash: string;
  try {
    clientKeyHash = await recoveryClientKey(request);
  } catch {
    return Response.json(
      { error: "Recovery admission control is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  }
  let recoveryId: string;
  let createdAt: string;
  try {
    const allocation = await allocateRecoveryId(
      () => crypto.randomUUID(),
      (candidateId) => createRecoveryRecord(candidateId, submittedUrl, normalizedUrl, clientKeyHash),
    );
    recoveryId = allocation.recoveryId;
    createdAt = allocation.value;
  } catch (error) {
    if (error instanceof RecoveryRateLimitError) {
      return recoveryRateLimitResponse(error);
    }
    if (error instanceof RecoveryBusyError) {
      return Response.json(
        { error: error.message },
        { status: 409, headers: { "Cache-Control": "no-store", "Retry-After": "15" } },
      );
    }
    if (error instanceof RecoveryIdCollisionError) {
      return Response.json(
        { error: "Alexandria could not allocate a recovery identifier. Please try again." },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "1", "X-Content-Type-Options": "nosniff" } },
      );
    }
    throw error;
  }
  const encoder = new TextEncoder();
  const recoveryAbort = new AbortController();
  let recoveryTask: Promise<unknown> | null = null;
  let terminal = false;
  const stream = new ReadableStream({
    start(controller) {
      const emit = (event: unknown) => {
        // Cancellation can race with a final persisted stage update. Once the
        // client is gone, do not let an enqueue exception replace the real
        // abort reason or obscure the terminal recovery state.
        if (terminal) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      recoveryTask = runRecovery({
        id: recoveryId,
        submittedUrl,
        normalizedUrl,
        requestedEraYear,
        createdAt,
        emit,
        signal: recoveryAbort.signal,
      });
      // Do not return the recovery promise from ReadableStream.start(). A start
      // promise gates stream readiness, which can buffer every progress event
      // until the recovery is already complete. waitUntil owns the task's Worker
      // lifetime while the stream becomes readable immediately.
      waitUntil(recoveryTask.catch(() => undefined).finally(() => {
        if (!terminal) {
          terminal = true;
          controller.close();
        }
      }));
    },
    cancel() {
      if (terminal) return;
      // When the runtime reports downstream cancellation, persist a terminal
      // state and release the singleton lock instead of leaving every later
      // visitor blocked until TTL.
      terminal = true;
      recoveryAbort.abort(new Error("The recovery connection closed before verification finished."));
      const cancellation = recoveryTask
        ?? failRecovery(recoveryId, "The recovery connection closed before verification finished.");
      return cancellation.then(() => undefined, () => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Recovery-Id": recoveryId,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
