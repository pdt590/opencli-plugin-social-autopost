# Graph Report - opencli-plugin-social-autopost  (2026-11-03)

## Corpus Check
- 59 files · ~28,882 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .example 2)

## Summary
- 300 nodes · 681 edges · 20 communities (12 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6b9b7d1d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- validate.js
- post-flow.js
- uninstall.sh script
- ensure-chrome.sh
- ref_node_path
- package.json
- prune-runs.py
- Local Facebook group posting architecture
- Node 20 CI tests and whitespace checks
- package-local.js
- ref_node_fs
- post-group.test.js
- Independent community extension attribution
- skill-clone.sh
- ref_node_path
- close-chrome.sh
- vitest

## God Nodes (most connected - your core abstractions)
1. `captureScreenshot()` - 20 edges
2. `vitest` - 19 edges
3. `runDoctor()` - 15 edges
4. `runSetup()` - 15 edges
5. `evaluateWithArgs()` - 14 edges
6. `@jackwener/opencli` - 13 edges
7. `preparePost()` - 13 edges
8. `postClone()` - 12 edges
9. `runPost()` - 12 edges
10. `attachImages()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `postGroup()` --indirect_call--> `verifyGroupPageLoaded()`  [INFERRED]
  post-group.js → src/composer.js
- `postPerson()` --indirect_call--> `verifyPersonalProfileLoaded()`  [INFERRED]
  post-person.js → src/personal-profile.js
- `postPerson()` --indirect_call--> `resolvePersonInputs()`  [INFERRED]
  post-person.js → src/validate.js
- `validateGroups()` --calls--> `parseGroupUrl()`  [EXTRACTED]
  scripts/doctor.js → src/validate.js
- `runSetup()` --calls--> `ensureArtifactDir()`  [EXTRACTED]
  scripts/setup.js → src/artifacts.js

## Import Cycles
- None detected.

## Communities (20 total, 8 thin omitted)

### Community 0 - "validate.js"
Cohesion: 0.14
Nodes (21): postGroup(), __test__, postPerson(), postTabs(), @jackwener/opencli, chronologicalFeedUrl(), verifyGroupPageLoaded(), isPersonalProfileUrl() (+13 more)

### Community 1 - "post-flow.js"
Cohesion: 0.13
Nodes (32): captureScreenshot(), assertSafePage(), classifySecurityState(), readPageSecurityState(), SECURITY_PATTERNS, captionVerified(), clickPostButton(), COMPOSER_TRIGGER_LABELS (+24 more)

### Community 3 - "ensure-chrome.sh"
Cohesion: 0.70
Nodes (4): bridge_connected(), chrome_running(), ensure_bridge(), ensure-chrome.sh script

### Community 4 - "ref_node_path"
Cohesion: 0.07
Nodes (38): checkArtifactsWritable(), checkBrowserBridge(), checkConfig(), checkFacebookLogin(), checkNodeVersion(), checkPackageDependencies(), checkPluginVisible(), facebookSessionNextStep() (+30 more)

### Community 5 - "package.json"
Cohesion: 0.10
Nodes (20): author, description, devDependencies, @jackwener/opencli, vitest, engines, node, keywords (+12 more)

### Community 6 - "prune-runs.py"
Cohesion: 0.15
Nodes (14): chrome(), main(), archive(), evidence(), hash_records(), main(), matches(), publication_busy() (+6 more)

### Community 7 - "Local Facebook group posting architecture"
Cohesion: 0.10
Nodes (16): Redacted reproducible bug reports, Non-secret setup support intake, Local readiness and manual browser recovery, Local Facebook group posting architecture, Hermes messaging control layer, OpenCLI plugin and Browser Bridge, Credential and live-post security boundaries, Browser and tab rules (+8 more)

### Community 10 - "package-local.js"
Cohesion: 0.20
Nodes (11): DEFAULT_OUT_DIR, formatPackageResult(), PACKAGE_NAME, packageEntries(), packageLocal(), parseArgs(), readValue(), REPO_ROOT (+3 more)

### Community 11 - "ref_node_fs"
Cohesion: 0.20
Nodes (16): completeFacebookAlbum(), fetchMedia(), isVideoUrl(), parseSource(), postClone(), readDocument(), readInstagram(), savePost() (+8 more)

### Community 17 - "ref_node_path"
Cohesion: 0.19
Nodes (9): install.sh script, command, result, root, patchOpencli(), artifactPath(), ensureArtifactDir(), timestampForPath() (+1 more)

### Community 18 - "close-chrome.sh"
Cohesion: 0.83
Nodes (3): any_chrome(), main_pids(), close-chrome.sh script

### Community 19 - "vitest"
Cohesion: 0.24
Nodes (5): vitest, WAIT_FOR_PREVIEWS_SCRIPT, el(), previews(), tiles()

## Knowledge Gaps
- **7 isolated node(s):** `Independent community extension attribution`, `OpenCLI Apache 2.0 and Hermes MIT notices`, `Hermes messaging control layer`, `OpenCLI plugin and Browser Bridge`, `Redacted reproducible bug reports` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 92 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `validate.js`, `post-flow.js`, `ref_node_path`, `package.json`, `package-local.js`, `ref_node_fs`, `post-group.test.js`, `ref_node_path`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **What connects `Independent community extension attribution`, `OpenCLI Apache 2.0 and Hermes MIT notices`, `Hermes messaging control layer` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `validate.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1365079365079365 - nodes in this community are weakly interconnected._
- **Why does `@jackwener/opencli` connect `validate.js` to `post-flow.js`, `ref_node_fs`, `package.json`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `post-flow.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1289198606271777 - nodes in this community are weakly interconnected._
- **Should `ref_node_path` be split into smaller, more focused modules?**
  _Cohesion score 0.07372549019607844 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._