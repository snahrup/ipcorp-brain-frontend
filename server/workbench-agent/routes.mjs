import { classifyAction, normalizeAvailableActions, validateSemanticAction } from "./actions.mjs";
import { checkServiceReadiness } from "./adapters.mjs";
import { normalizeDestination } from "./destinations.mjs";
import {
  errorPayload,
  readJsonBody,
  sendJson,
  WorkbenchAgentError,
  writeNdjson,
} from "./protocol.mjs";
import { executeConfirmedReview, runAgentTurn } from "./sdk-runner.mjs";
import { createOwnerSessionStore } from "./sessions.mjs";

const DEFAULT_ORIGINS = new Set([
  "http://127.0.0.1:5217",
  "http://localhost:5217",
  "https://ip-corp-brain.nahrup.ngrok.app",
]);

function checkOrigin(request, allowedOrigins, allowMissing = false) {
  const origin = request.headers.origin;
  if (!origin) {
    if (allowMissing) return undefined;
    throw new WorkbenchAgentError(403, "Origin is required.", "origin_required");
  }
  if (!allowedOrigins.has(origin)) {
    throw new WorkbenchAgentError(403, "Origin is not allowed.", "origin_denied");
  }
  return origin;
}

function allowCors(response, origin, allowedOrigins) {
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
}

export function createWorkbenchAgentRouter(options = {}) {
  const allowedOrigins = options.allowedOrigins || DEFAULT_ORIGINS;
  const sessionStore = options.sessionStore || createOwnerSessionStore(options.sessionOptions);
  const agentRunner = options.agentRunner || runAgentTurn;
  const executeReview = options.executeReview || executeConfirmedReview;
  const deps = options.deps || {};
  const readiness = options.readiness || (() => checkServiceReadiness(deps));

  async function handle(request, response, url = new URL(request.url || "/", "http://127.0.0.1")) {
    if (!url.pathname.startsWith("/api/workbench-agent")) {
      return false;
    }

    let origin;
    try {
      const isSafeStatusRead =
        request.method === "GET" && url.pathname === "/api/workbench-agent/status";
      origin = checkOrigin(request, allowedOrigins, isSafeStatusRead);
      if (request.method === "OPTIONS") {
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        response.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, x-workbench-agent-request"
        );
        return sendJson(response, 204, {}, origin, allowedOrigins);
      }

      if (request.method === "GET" && url.pathname === "/api/workbench-agent/status") {
        return sendJson(
          response,
          200,
          {
            ok: true,
            data: await readiness(),
            meta: {
              service: "workbench-agent",
              sessionRequired: true,
              microsoft365Writes: "not advertised by this service",
              enterpriseMaintenance: "local owner session only",
            },
          },
          origin,
          allowedOrigins
        );
      }

      if (request.method === "POST" && url.pathname === "/api/workbench-agent/session") {
        const { session, cookie } = sessionStore.createSession(origin);
        response.setHeader("Set-Cookie", cookie);
        return sendJson(
          response,
          201,
          {
            ok: true,
            data: {
              requestToken: session.requestToken,
              expiresAt: new Date(session.expiresAt).toISOString(),
            },
          },
          origin,
          allowedOrigins
        );
      }

      if (request.method === "POST" && url.pathname === "/api/workbench-agent/chat") {
        const session = sessionStore.requireSession(request);
        const body = await readJsonBody(request);
        const availableActions = normalizeAvailableActions(body.availableActions);
        const clientSections =
          body.destinationSections && typeof body.destinationSections === "object"
            ? body.destinationSections
            : {};

        if (body.requestedDestination) {
          normalizeDestination(body.requestedDestination, clientSections);
        }
        const requestedAction = body.requestedActionKey
          ? validateSemanticAction(body.requestedActionKey, availableActions)
          : null;

        response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        allowCors(response, origin, allowedOrigins);
        response.writeHead(200);

        if (requestedAction) {
          const classification = classifyAction(requestedAction);
          const requestedActionValue =
            body.requestedActionValue === undefined ? undefined : String(body.requestedActionValue);
          const requestedActionArgs = { actionKey: requestedAction.key };
          if (requestedActionValue !== undefined) {
            requestedActionArgs.value = requestedActionValue;
          }
          if (classification.mode === "auto") {
            writeNdjson(response, {
              type: "action",
              actionKey: requestedAction.key,
              value: requestedActionValue,
            });
            writeNdjson(response, { type: "done", ok: true });
            response.end();
            return true;
          }
          const review = sessionStore.createReview(session, {
            toolName: "workbench.page-action",
            actionKind: requestedAction.kind,
            args: requestedActionArgs,
            target: requestedAction.target,
            title: requestedAction.label,
            preview: requestedAction.summary || requestedAction.label,
          });
          writeNdjson(response, { type: "review", review });
          writeNdjson(response, { type: "done", ok: true });
          response.end();
          return true;
        }

        const context = {
          availableActions,
          clientSections,
          history: Array.isArray(session.history) ? session.history : [],
          message: String(body.message || "").slice(0, 20_000),
          section: body.section ? String(body.section).slice(0, 120) : "",
          session,
          sessionStore,
          view: body.view ? String(body.view).slice(0, 80) : "",
        };
        const abortController = new AbortController();
        let completed = false;
        const abort = () => {
          if (!completed) {
            abortController.abort();
          }
        };
        request.on("aborted", abort);
        response.on("close", abort);
        try {
          for await (const event of agentRunner(context, { ...deps, abortController })) {
            writeNdjson(response, event);
          }
        } catch (error) {
          writeNdjson(response, { type: "error", ...errorPayload(error) });
        } finally {
          completed = true;
          request.off("aborted", abort);
          response.off("close", abort);
        }
        response.end();
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/workbench-agent/confirm") {
        const session = sessionStore.requireSession(request);
        const body = await readJsonBody(request);
        const record = sessionStore.consumeReview(
          session,
          body.reviewId,
          body.toolName === undefined ? undefined : String(body.toolName || ""),
          body.args,
          body.target
        );
        const receipt = await executeReview(record, deps);
        return sendJson(
          response,
          200,
          {
            ok: true,
            data: {
              reviewId: record.id,
              toolName: record.toolName,
              executedAt: new Date(record.usedAt).toISOString(),
              receipt,
            },
          },
          origin,
          allowedOrigins
        );
      }

      return sendJson(
        response,
        404,
        { ok: false, error: "Workbench agent route not found." },
        origin,
        allowedOrigins
      );
    } catch (error) {
      const payload = errorPayload(error);
      return sendJson(response, error.status || 500, payload, origin, allowedOrigins);
    }
  }

  return { handle, sessionStore };
}
