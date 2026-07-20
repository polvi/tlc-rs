// Thin TypeScript shell: bearer auth + routing + JSON passthrough to the
// tlc-core wasm module. All checking logic lives in Rust.

// Workers' CompiledWasm rule imports a `WebAssembly.Module` (uninstantiated),
// so wire the wasm-bindgen glue manually: instantiate against the glue's
// import object, then hand the exports back via __wbg_set_wasm.
import wasmModule from "../build/tlc_wasm_bg.wasm";
import * as bindgen from "../build/tlc_wasm_bg.js";
import { handleMcp } from "./mcp";

const instance = new WebAssembly.Instance(wasmModule, {
  "./tlc_wasm_bg.js": bindgen,
});
bindgen.__wbg_set_wasm(instance.exports);
(instance.exports as { __wbindgen_start?: () => void }).__wbindgen_start?.();
const { parse, check } = bindgen;

export interface Env {
  API_TOKEN: string;
}

function unauthorized(): Response {
  return Response.json(
    { status: "unauthorized", errors: [{ code: "A0001", category: "auth", message: "missing or invalid bearer token" }] },
    { status: 401 },
  );
}

async function checkAuth(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  const expected = `Bearer ${env.API_TOKEN}`;
  if (header.length !== expected.length) return false;
  const enc = new TextEncoder();
  const a = enc.encode(header);
  const b = enc.encode(expected);
  return crypto.subtle.timingSafeEqual(a, b);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return Response.json(
        { status: "bad_request", errors: [{ code: "R0002", category: "request", message: "POST /parse or POST /check" }] },
        { status: 405 },
      );
    }
    if (!(await checkAuth(request, env))) return unauthorized();

    const body = await request.text();

    // MCP endpoint (stateless Streamable HTTP): JSON-RPC over POST.
    if (url.pathname === "/mcp") {
      return handleMcp(body, { parse, check });
    }

    let result: string;
    switch (url.pathname) {
      case "/parse":
        result = parse(body);
        break;
      case "/check":
        result = check(body);
        break;
      default:
        return Response.json(
          { status: "bad_request", errors: [{ code: "R0003", category: "request", message: `unknown path ${url.pathname}` }] },
          { status: 404 },
        );
    }
    return new Response(result, { headers: { "Content-Type": "application/json" } });
  },
} satisfies ExportedHandler<Env>;
