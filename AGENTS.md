## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## Shell sandbox fallback

- If `functions.exec` / `exec_command` fails before running with a sandbox startup error such as `bwrap: ... RTM_NEWADDR: Operation not permitted`, do not treat that as evidence that a command, runtime, or local service is missing. The shell was blocked before execution.
- Retry the needed read-only inspection or workspace edit through the available `mcp__node_repl__js` tool using Node built-ins, with paths rooted at this repository. Do not use browser UI as a substitute for shell access unless the task specifically requires UI interaction.
- For commands that must actually execute (for example `hermes` or `graphify`), try the command runner once with the appropriate approved sandbox setting if available. If execution remains unavailable, report the exact startup error and the unverified command; do not claim the service is absent. Never weaken sandbox/network protections to work around this error.
