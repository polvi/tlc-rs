// Stateless MCP server (Streamable HTTP transport) exposing the TLA+ checker
// as tools. Tools are pure functions over the wasm engine, so no sessions,
// no SSE streams, no Durable Objects — each POST is an independent JSON-RPC
// exchange, which the MCP spec permits for stateless servers.

type Json = Record<string, unknown>;

interface RpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Json;
}

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "tlc_check",
    description:
      "Model-check a TLA+ specification (safety subset: invariants, [][A]_v action properties, deadlock). " +
      "Runs a finite-state breadth-first search and returns state counts, and on violation the shortest " +
      "counterexample trace. The run self-limits (default 30s worth of exploration); on timeout the result " +
      "includes a state-growth diagnostic explaining the blowup. Keep specs finite: small CONSTANT sets, " +
      "bounded number ranges.",
    inputSchema: {
      type: "object",
      properties: {
        spec: {
          type: "string",
          description: "Full TLA+ module source (---- MODULE Name ---- ... ====)",
        },
        config: {
          type: "string",
          description:
            "TLC configuration text: SPECIFICATION/INIT/NEXT, INVARIANT(S), PROPERTY(IES) for [][A]_v " +
            "properties, CONSTANT assignments (model values allowed), CONSTRAINT, CHECK_DEADLOCK TRUE|FALSE",
        },
        extra_modules: {
          type: "array",
          description: "Additional modules the spec EXTENDS (standard modules are built in)",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              source: { type: "string" },
            },
            required: ["name", "source"],
          },
        },
        timeout_seconds: {
          type: "integer",
          description: "Exploration budget in seconds, 1-30 (default 30)",
        },
      },
      required: ["spec", "config"],
    },
  },
  {
    name: "tlc_parse",
    description:
      "Parse and semantically check a TLA+ module (syntax, name resolution, arity, level checking) " +
      "without model checking. Fast; use to validate a spec edit before running tlc_check.",
    inputSchema: {
      type: "object",
      properties: {
        spec: { type: "string", description: "Full TLA+ module source" },
        extra_modules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              source: { type: "string" },
            },
            required: ["name", "source"],
          },
        },
      },
      required: ["spec"],
    },
  },
];

/** Module name from the `---- MODULE Name ----` header. */
function moduleName(source: string): string | null {
  const m = source.match(/^-{4,}\s*MODULE\s+(\w+)/m);
  return m ? m[1] : null;
}

function rpcResult(id: number | string | null | undefined, result: Json): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: number | string | null | undefined, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

function toolText(status: string, resp: Json): string {
  const human = typeof resp.humanOutput === "string" ? resp.humanOutput : "";
  const summary = human || `status: ${status}`;
  // Full JSON after the summary so the model can read structured details
  // (trace states, diagnostics) without a second call.
  return `${summary}\n\n${JSON.stringify(resp, null, 2)}`;
}

export function handleMcp(
  body: string,
  engine: { parse: (json: string) => string; check: (json: string) => string },
): Response {
  let req: RpcRequest;
  try {
    req = JSON.parse(body);
  } catch {
    return rpcError(null, -32700, "parse error: request body is not JSON");
  }
  // Batch requests are removed in protocol 2025-06-18; reject them plainly.
  if (Array.isArray(req)) {
    return rpcError(null, -32600, "batch requests are not supported");
  }

  switch (req.method) {
    case "initialize":
      return rpcResult(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: "tlc",
          title: "TLA+ Model Checker",
          version: "0.1.0",
        },
        instructions:
          "TLA+ finite model checking (safety subset). Use tlc_parse to validate a spec, tlc_check to " +
          "model-check it. On invariant_violation read the trace in the result; on timeout read the " +
          "diagnostic hint and shrink CONSTANT bounds. Specs must be finite.",
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      // Notifications get 202 with no body per Streamable HTTP.
      return new Response(null, { status: 202 });

    case "ping":
      return rpcResult(req.id, {});

    case "tools/list":
      return rpcResult(req.id, { tools: TOOLS });

    case "tools/call": {
      const params = (req.params ?? {}) as { name?: string; arguments?: Json };
      const args = (params.arguments ?? {}) as {
        spec?: string;
        config?: string;
        extra_modules?: { name: string; source: string }[];
        timeout_seconds?: number;
      };
      if (typeof args.spec !== "string" || args.spec.length === 0) {
        return rpcError(req.id, -32602, "missing required argument: spec");
      }
      const name = moduleName(args.spec);
      if (!name) {
        return rpcResult(req.id, {
          content: [{ type: "text", text: "spec has no `---- MODULE Name ----` header" }],
          isError: true,
        });
      }
      const modules = [
        { name, source: args.spec },
        ...(args.extra_modules ?? []),
      ];

      let raw: string;
      if (params.name === "tlc_parse") {
        raw = engine.parse(JSON.stringify({ modules, mainModule: name }));
      } else if (params.name === "tlc_check") {
        if (typeof args.config !== "string" || args.config.length === 0) {
          return rpcError(req.id, -32602, "missing required argument: config");
        }
        raw = engine.check(
          JSON.stringify({
            modules,
            mainModule: name,
            config: args.config,
            timeoutSeconds: args.timeout_seconds ?? 30,
          }),
        );
      } else {
        return rpcError(req.id, -32602, `unknown tool: ${params.name}`);
      }

      let resp: Json;
      try {
        resp = JSON.parse(raw);
      } catch {
        return rpcResult(req.id, {
          content: [{ type: "text", text: "engine returned malformed output" }],
          isError: true,
        });
      }
      const status = String(resp.status ?? "unknown");
      // A violation/timeout is a *successful* check — the tool did its job.
      // isError is reserved for requests the engine couldn't process at all.
      const isError = status === "config_error" && Array.isArray(resp.errors)
        && (resp.errors as Json[]).some((e) => e.category === "request");
      return rpcResult(req.id, {
        content: [{ type: "text", text: toolText(status, resp) }],
        structuredContent: resp,
        isError,
      });
    }

    default:
      return rpcError(req.id, -32601, `method not found: ${req.method}`);
  }
}
