// Landing page served at GET / — no auth required (read-only, static).

export const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tlc.proc.io — hosted TLA+ model checking</title>
<style>
  :root {
    --bg: #faf9f6; --fg: #1a1a1a; --dim: #6b6b6b; --accent: #0d5c4d;
    --card: #ffffff; --border: #e4e1da; --code-bg: #f0eee8;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #12130f; --fg: #e8e6e1; --dim: #9a988f; --accent: #5fd4b0;
      --card: #1b1c17; --border: #2e2f28; --code-bg: #22231d;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; letter-spacing: -.01em; }
  h1 code { font-size: 1.35rem; }
  h2 { font-size: 1.05rem; margin: 2.6rem 0 .6rem; color: var(--accent); }
  p { margin: .7rem 0; }
  .tag { color: var(--dim); margin: 0 0 2rem; }
  code, pre {
    font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .86em;
  }
  code { background: var(--code-bg); padding: .12em .35em; border-radius: 4px; }
  pre {
    background: var(--code-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: .9rem 1rem; overflow-x: auto; line-height: 1.5;
  }
  pre code { background: none; padding: 0; }
  .fact-row { display: flex; gap: .75rem; flex-wrap: wrap; margin: 1.4rem 0; }
  .fact {
    flex: 1 1 10rem; background: var(--card); border: 1px solid var(--border);
    border-radius: 8px; padding: .8rem .95rem;
  }
  .fact b { display: block; font-size: 1.25rem; color: var(--accent); }
  .fact span { color: var(--dim); font-size: .82rem; }
  a { color: var(--accent); }
  .dim { color: var(--dim); }
  footer { margin-top: 4rem; color: var(--dim); font-size: .82rem;
    border-top: 1px solid var(--border); padding-top: 1rem; }
</style>
</head>
<body>
<main>
  <h1><code>tlc.proc.io</code> — hosted TLA+ model checking</h1>
  <p class="tag">A ground-up Rust rewrite of the TLA+ tools (SANY + TLC, safety
  subset), compiled to a 509&nbsp;KB WebAssembly module and served from
  Cloudflare's edge. No JVM. No install. An MCP server your coding agent can
  call natively.</p>

  <div class="fact-row">
    <div class="fact"><b>97/107</b><span>exact-parity conformance vs Java TLC
      (verdict, state counts, trace length)</span></div>
    <div class="fact"><b>509 KB</b><span>whole checker as wasm — parser, level
      checker, evaluator, BFS engine</span></div>
    <div class="fact"><b>&le;30 s</b><span>self-limiting runs with a
      state-blowup diagnostic on timeout</span></div>
  </div>

  <h2>What it does</h2>
  <p>You write a TLA+ specification of your system and a small config; the
  service exhaustively explores every reachable state, checking your
  invariants and <code>[][A]_v</code> action properties on each transition.
  If a property can be violated, you get the <em>shortest</em> counterexample
  trace — the exact step-by-step scenario that breaks your design. If the
  state space explodes, you get a per-level growth profile and a hint about
  which constant to shrink, instead of a hung process.</p>

  <h2>Use it from Claude (MCP)</h2>
  <p>The service speaks the Model Context Protocol at <code>/mcp</code>
  (Streamable HTTP, stateless). One command registers it in Claude Code:</p>
  <pre><code>claude mcp add --scope user --transport http tlc \\
  https://tlc.proc.io/mcp \\
  --header "Authorization: Bearer $TLC_API_TOKEN"</code></pre>
  <p>Two tools appear: <code>tlc_check</code> (full model check — pass the
  module source and TLC config, get state counts, traces, diagnostics) and
  <code>tlc_parse</code> (fast syntax + semantic + level check). Your agent
  keeps the spec next to the code, updates it when the architecture changes,
  and verifies every change in seconds — a formal-methods reviewer on tap.</p>

  <h2>Use it from anything else (REST)</h2>
  <pre><code>curl -s https://tlc.proc.io/check \\
  -H "Authorization: Bearer $TLC_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"modules":[{"name":"Spec","source":"---- MODULE Spec ----\\n..."}],
       "config":"INIT Init\\nNEXT Next\\nINVARIANT TypeOK",
       "timeoutSeconds":30}'</code></pre>
  <p>Response is JSON: <code>status</code> (<code>ok</code>,
  <code>invariant_violation</code>, <code>deadlock</code>,
  <code>timeout</code>, …), <code>stats</code>, a <code>violation.trace</code>
  when something breaks, and a <code>diagnostic</code> with per-level state
  growth when the space blows up.</p>

  <h2>Why this is cool</h2>
  <p>Model checkers have always meant "install a JVM, download a jar, babysit
  a process." This one is a stateless function at the edge: the entire
  checker — a hand-written parser faithful to SANY's column-sensitive
  junction-list grammar, a value system whose 64-bit fingerprints are
  bit-identical to Java TLC's, and a breadth-first search engine — boots in
  microseconds inside a V8 isolate near you.</p>
  <p>Correctness isn't asserted, it's measured: every build is differentially
  tested against the reference Java implementation on a mined conformance
  suite, matching its verdicts, exact state counts, and counterexample depths.
  Where the two disagree, the discrepancy is documented and traced to an
  upstream bug, not shrugged off.</p>
  <p>And because it's MCP, the checker composes with agents: "keep the spec in
  sync with the architecture and prove my invariants still hold" becomes a
  background loop, not a chore.</p>

  <h2>Scope</h2>
  <p class="dim">Safety subset: invariants, deadlock, box-action properties
  (<code>[][A]_v</code>), CONSTANT/CONSTRAINT, model values, EXTENDS-based
  modules (Naturals, Integers, Sequences, FiniteSets, TLC, Bags built in).
  Not supported: liveness/fairness, symmetry, parameterized INSTANCE,
  ENABLED. Keep specs finite — small constant sets, bounded ranges.</p>

  <footer>Access requires a bearer token. Built in Rust from
  <a href="https://github.com/tlaplus/tlaplus">tlaplus/tlaplus</a> reference
  semantics; checked differentially against TLC 2.19.</footer>
</main>
</body>
</html>`;
