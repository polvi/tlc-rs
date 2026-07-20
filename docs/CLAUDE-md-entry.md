# Replacement CLAUDE.md entry

The service is also an MCP server (already registered in Claude Code at user
scope as `tlc` — tools `tlc_check` and `tlc_parse`), so the agent can call it
natively without any shell wrapper. Re-register anytime with:

    claude mcp add --scope user --transport http tlc \
      https://tlc.proc.io/mcp \
      --header "Authorization: Bearer $(cat ~/Code/tlc-rs/.tlc-api-token)"

Replace the TLA+ entry in your project's CLAUDE.md with:

---

In a separate agent, keep the specs/ directory up to date using TLA+. This
involves updating the .tla file whenever the architecture changes, then
validating with the hosted checker: call the `tlc_check` MCP tool with the
spec source and TLC config (or use the CLI fallback
`~/Code/tlc-rs/tools/tlc specs/Spec.tla specs/Spec.cfg`).

(`tlc` is `~/Code/tlc-rs/tools/tlc`; service at https://tlc.proc.io; token in `$TLC_API_TOKEN`, stored in `~/Code/tlc-rs/.tlc-api-token`.) The output is JSON:

- `.status == "ok"` — spec checked clean; note `.stats.distinctStates`.
- `"invariant_violation"` / `"deadlock"` — read `.violation.trace` (shortest
  counterexample) and either fix the spec or report the architecture bug.
- `"timeout"` — the state space blew up. Read `.diagnostic.hint` and
  `.diagnostic.levelGrowth`; shrink CONSTANT bounds or add a CONSTRAINT.
  Keep specs finite.
- `"parse_error"` / `"semantic_error"` — fix the spec; errors carry
  module/line/column.
- `"unsupported_feature"` — fall back to the local jar:
  `java -jar ~/Downloads/tla2tools.jar` (kill after 30s).

The service self-limits at 30 seconds — no kill logic needed. Do this in the
background and do not block the user's UI.
