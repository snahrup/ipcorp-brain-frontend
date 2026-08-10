const PREFIX = "/api/work/activity-reconciliation";
const MAX_BODY_BYTES = 1_000_000;

async function readJsonBody(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (Buffer.byteLength(value) > MAX_BODY_BYTES) {
      const error = new Error("The activity request is too large.");
      error.code = "request_too_large";
      error.status = 413;
      throw error;
    }
  }
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    const error = new Error("The activity request body is not valid JSON.");
    error.code = "invalid_json";
    error.status = 400;
    throw error;
  }
}

function response(status, data) {
  return { status, body: { ok: true, data } };
}

function failure(error) {
  return {
    status: Number.isInteger(error?.status) ? error.status : 500,
    body: {
      ok: false,
      code: error?.code || "activity_reconciliation_failed",
      error: error instanceof Error ? error.message : "Activity reconciliation failed.",
      details: error?.details,
    },
  };
}

export function createActivityReconciliationRouter(service) {
  if (!service) throw new TypeError("An activity reconciliation service is required.");
  return {
    async handle(request, url) {
      if (!url.pathname.startsWith(PREFIX)) return null;
      try {
        if (
          request.method === "GET" &&
          (url.pathname === PREFIX || url.pathname === `${PREFIX}/status`)
        ) {
          return response(200, await service.getRun(url.searchParams.get("runId") || undefined));
        }
        if (request.method === "GET" && url.pathname === `${PREFIX}/history`) {
          return response(200, await service.runHistory());
        }
        if (request.method === "GET" && url.pathname === `${PREFIX}/recap`) {
          const run = await service.getRun(url.searchParams.get("runId") || undefined);
          if (!run) {
            const error = new Error("No activity run is available.");
            error.code = "run_not_found";
            error.status = 404;
            throw error;
          }
          return response(200, { runId: run.id, status: run.status, recap: run.recap });
        }
        if (request.method === "POST" && url.pathname === `${PREFIX}/start`) {
          const body = await readJsonBody(request);
          return response(
            202,
            await service.start({
              fresh: body.fresh === true,
              steps: body.steps && typeof body.steps === "object" ? body.steps : undefined,
            })
          );
        }
        if (request.method === "POST" && url.pathname === `${PREFIX}/stop`) {
          const body = await readJsonBody(request);
          return response(202, await service.stop(String(body.runId || "")));
        }
        if (request.method === "POST" && url.pathname === `${PREFIX}/resume`) {
          const body = await readJsonBody(request);
          return response(202, await service.resume(String(body.runId || "")));
        }
        if (request.method === "POST" && url.pathname === `${PREFIX}/jira/apply`) {
          const body = await readJsonBody(request);
          return response(
            200,
            await service.applySelected(
              String(body.runId || ""),
              Array.isArray(body.proposalIds) ? body.proposalIds : [],
              String(body.confirmation || "")
            )
          );
        }
        return {
          status: 404,
          body: { ok: false, code: "route_not_found", error: "Activity route not found." },
        };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
