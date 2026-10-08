/**
 * Check that the Impeccable design hook is actually wired into OpenCode.
 *
 * Impeccable installs its hook through per-harness manifests (`.claude/settings.local.json`,
 * `.codex/hooks.json`, `.cursor/hooks.json`). OpenCode has no hook manifest and this
 * repository only carries the Codex one, so the detector had no caller here. The failure
 * was invisible rather than loud: Impeccable suppresses its `MANUAL_DETECTOR_REQUIRED`
 * fallback as soon as it finds *any* installed manifest, so `.codex/hooks.json` silenced
 * the only warning that the hook was not running.
 *
 * Why this is a script and not a Vitest spec
 * ------------------------------------------
 * What needs proving is not a unit of logic but a chain of contracts, and every link has
 * to be the real one: OpenCode actually loading `.opencode/plugins/impeccable.js`, that
 * file's single export being called as a plugin factory, `tool.execute.after` firing with
 * a mutable `output.output`, the real engine binary resolving from the version-pinned
 * cache, that binary returning its documented envelope on stdin, and the reminder landing
 * in a string the model will read. A mocked engine would pass while the wiring was wrong,
 * which is precisely the failure that is being guarded against. So this drives the real
 * plugin against the real binary and asserts on what comes back.
 *
 * It is a standalone script rather than a `*.test.mjs` because it is not part of the
 * application's behaviour and must not be collected by `npm run test`. It sits with
 * `check-workflow-expressions.mjs` and joins it in `verify`.
 *
 * Why it is not a CI gate
 * -----------------------
 * It exercises the real engine binary, and that binary is not a repository artifact. The
 * launcher downloads it once per machine into a user-local cache (`~/.impeccable/bin/<version>/`
 * on Windows), and `.agents/skills/impeccable/scripts/bin/` is git-ignored. A fresh CI
 * runner has none of it, so this check would fail there for a reason that says nothing
 * about the code. Adding it to `ci.yml` would trade a real signal for a permanently red
 * job, which is the exact failure `check-workflow-expressions.mjs` was written after. It
 * stays a local gate, and the engine's absence is reported rather than swallowed.
 *
 * Session isolation
 * -----------------
 * The engine keys its per-file acknowledgement cache by session id in
 * `.impeccable/hook.cache.json`, so an acked file is scanned once and then stays quiet.
 * Left alone, the second run of this script would scan nothing and pass for the wrong
 * reason. Rather than clear that cache, which is live session state, every probe here runs
 * under its own `impeccable-hook-check` session id, and only that bucket is removed
 * afterwards. A real session's entries are never read or written.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { ImpeccableDesignHook } from "../.opencode/plugins/impeccable.js"
import { parseHookReminder, resolveHookCommand, touchedPaths } from "../.opencode/lib/impeccable-hook.js"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const CHECK_SESSION = "impeccable-hook-check"
const CACHE_FILE = path.join(ROOT, ".impeccable", "hook.cache.json")

let failures = 0

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  pass  ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`)
  }
}

function eq(label, actual, expected) {
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

/** Runs the plugin's `tool.execute.after` against a throwaway stub client. */
async function runAfter(tool, args) {
  const logged = []
  const hooks = await ImpeccableDesignHook({
    client: { app: { log: async ({ body }) => void logged.push(body) } },
    directory: ROOT,
    worktree: ROOT,
  })
  const output = { title: "edited", output: "ORIGINAL TOOL RESULT", metadata: {} }
  await hooks["tool.execute.after"]({ tool, sessionID: CHECK_SESSION, callID: "call_1", args }, output)
  return { output, logged }
}

/** Removes only this check's cache bucket, leaving real sessions untouched. */
function dropCheckBucket() {
  try {
    const cache = JSON.parse(readFileSync(CACHE_FILE, "utf8"))
    if (cache?.sessions?.[CHECK_SESSION]) {
      delete cache.sessions[CHECK_SESSION]
      writeFileSync(CACHE_FILE, JSON.stringify(cache))
    }
  } catch {
    /* no cache, or unreadable: nothing to clean */
  }
}

const probes = []

function probe(name, body) {
  const relative = `src/views/student/ImpeccableHookCheck-${name}.vue`
  const target = path.join(ROOT, relative)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, body)
  probes.push(target)
  return relative
}

try {
  console.log("\ntouchedPaths() gating")
  eq("edit yields its filePath", touchedPaths("edit", { filePath: "src/a.vue" }), ["src/a.vue"])
  eq("write yields its filePath", touchedPaths("write", { filePath: "src/a.vue" }), ["src/a.vue"])
  eq("read is gated out", touchedPaths("read", { filePath: "src/a.vue" }), [])
  eq("grep is gated out", touchedPaths("grep", { filePath: "src/a.vue" }), [])
  eq("bash is gated out", touchedPaths("bash", { command: "ls" }), [])
  eq("unknown tool is gated out", touchedPaths("str_replace_anything", { filePath: "src/a.vue" }), [])

  console.log("\ntouchedPaths() apply_patch markers")
  const patch = [
    "*** Begin Patch",
    "*** Add File: src/views/student/NewCard.vue",
    "+<template></template>",
    "*** Update File: src/views/student/Lesson.vue",
    "@@",
    "*** Move to: src/views/student/LessonMoved.vue",
    "*** Delete File: src/views/student/Old.vue",
    "*** End Patch",
  ].join("\n")
  eq("every marker is extracted, deduped, in order", touchedPaths("apply_patch", { patchText: patch }), [
    "src/views/student/NewCard.vue",
    "src/views/student/Lesson.vue",
    "src/views/student/LessonMoved.vue",
    "src/views/student/Old.vue",
  ])
  eq("missing patchText yields nothing", touchedPaths("apply_patch", {}), [])
  eq("patchText with no markers yields nothing", touchedPaths("apply_patch", { patchText: "no markers here" }), [])

  console.log("\nparseHookReminder()")
  eq("empty stdout means nothing to say", parseHookReminder(""), "")
  eq("whitespace-only stdout means nothing to say", parseHookReminder("   \n "), "")
  eq("malformed json means nothing to say", parseHookReminder("not json"), "")
  eq("json without the field means nothing to say", parseHookReminder('{"hookSpecificOutput":{}}'), "")
  eq(
    "the documented envelope is unwrapped",
    parseHookReminder('{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"  hi  "}}'),
    "hi",
  )

  console.log("\nresolveHookCommand()")
  const command = resolveHookCommand(ROOT)
  check("the real engine binary resolves", command !== null, command ? "" : "no engine found")
  check("the resolved engine exists on disk", command ? existsSync(command.command) : false, command?.command ?? "")
  check(
    "on Windows it resolves a binary, not the .cmd launcher",
    command ? !command.command.endsWith(".cmd") : false,
    command?.command ?? "",
  )

  console.log("\nEnd to end through the plugin, against the real engine")
  const clean = probe("clean", `<template>\n  <div class="p-4">Ordinary card</div>\n</template>\n`)
  const cleanRun = await runAfter("edit", { filePath: clean })
  check("a clean first edit is acked", cleanRun.output.output.includes("impeccable"), cleanRun.output.output.slice(0, 200))
  check("the original tool result is preserved", cleanRun.output.output.startsWith("ORIGINAL TOOL RESULT"))

  // A second edit to the same file must stay silent, proving the ack cache is honoured.
  const repeat = await runAfter("edit", { filePath: clean })
  eq("an already-acked file is left alone", repeat.output.output, "ORIGINAL TOOL RESULT")

  const gradient = probe(
    "gradient",
    [
      "<template>",
      '  <h1 class="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">Welcome back</h1>',
      "</template>",
      "",
    ].join("\n"),
  )
  const gradientRun = await runAfter("edit", { filePath: gradient })
  check("a real finding is surfaced to the model", gradientRun.output.output.includes("gradient-text"), gradientRun.output.output.slice(0, 300))
  check("the original tool result survives alongside it", gradientRun.output.output.startsWith("ORIGINAL TOOL RESULT"))

  const readRun = await runAfter("read", { filePath: gradient })
  eq("a read never triggers a scan", readRun.output.output, "ORIGINAL TOOL RESULT")

  const patched = probe("patched", "<template>\n  <div class=\"p-4\">Patched card</div>\n</template>\n")
  const patchRun = await runAfter("apply_patch", {
    patchText: ["*** Begin Patch", `*** Update File: ${patched}`, "@@", "*** End Patch"].join("\n"),
  })
  check("apply_patch paths are recovered from patchText", patchRun.output.output.includes("impeccable"), patchRun.output.output.slice(0, 200))

  console.log("")
  if (failures > 0) {
    console.error(`impeccable hook check: ${failures} failed`)
    process.exitCode = 1
  } else {
    console.log("impeccable hook check: all passed")
  }
} finally {
  for (const file of probes) rmSync(file, { force: true })
  dropCheckBucket()
}