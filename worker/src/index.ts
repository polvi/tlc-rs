// Thin TypeScript shell: routing + JSON passthrough to the tlc-core wasm
// module. All checking logic lives in Rust. The service is open (no auth);
// the engine self-limits every run, and Workers' cpu_ms cap is the backstop.

// Workers' CompiledWasm rule imports a `WebAssembly.Module` (uninstantiated),
// so wire the wasm-bindgen glue manually: instantiate against the glue's
// import object, then hand the exports back via __wbg_set_wasm.
import wasmModule from "../build/tlc_wasm_bg.wasm";
import * as bindgen from "../build/tlc_wasm_bg.js";
import { handleMcp } from "./mcp";
import { LANDING_HTML } from "./landing";

const instance = new WebAssembly.Instance(wasmModule, {
  "./tlc_wasm_bg.js": bindgen,
});
bindgen.__wbg_set_wasm(instance.exports);
(instance.exports as { __wbindgen_start?: () => void }).__wbindgen_start?.();
const { parse, check } = bindgen;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return new Response(LANDING_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (request.method !== "POST") {
      return Response.json(
        { status: "bad_request", errors: [{ code: "R0002", category: "request", message: "POST /parse, /check, or /mcp (see GET / for docs)" }] },
        { status: 405 },
      );
    }

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
} satisfies ExportedHandler;
