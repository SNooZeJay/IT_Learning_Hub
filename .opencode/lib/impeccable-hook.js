/**
 * Wire the Impeccable design detector into OpenCode.
 *
 * Why this file exists
 * --------------------
 * Impeccable ships its detector as a stdin/stdout CLI (`impeccable hook`) meant for
 * harnesses with a PostToolUse event. It installs its manifest per harness: Claude Code
 * reads `.claude/settings.local.json`, Codex reads `.codex/hooks.json`, Cursor reads
 * `.cursor/hooks.json`. This repository has the Codex manifest and none of the others,
 * which made the hook look installed while being unreachable from OpenCode.
 *
 * OpenCode has no hook manifest at all. Its only extension point for this is a plugin
 * subscribing to `tool.execute.after`, so that is what this module feeds.
 *
 * The gap was silent rather than loud, which is what made it worth closing. Impeccable
 * decides whether to emit its `MANUAL_DETECTOR_REQUIRED` fallback instruction by looking
 * for *any* installed manifest, and `.codex/hooks.json` satisfied that check. So in
 * OpenCode the automatic hook never fired and the manual reminder was suppressed too:
 * `impeccable context` emits the instruction in a directory with no manifest, and stays
 * quiet in this one. Editing a Vue file here was scanned by nothing and reported nothing.
 *
 * Why the logic is not in `.opencode/plugins/`
 * --------------------------------------------
 * OpenCode treats *every* export of a file in the plugin directory as a plugin and calls
 * it. Exporting a helper from there would have OpenCode invoke `touchedPaths()` as a
 * plugin. So the logic lives here, one directory up, and the plugin file is a thin
 * adapter that exports exactly one plugin function.
 */

import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

/**
 * Tools that change file contents, and therefore the only ones worth scanning.
 *
 * The gating has to happen here. The detector does not filter on tool name: handed any
 * envelope carrying a `file_path` it scans the file, and `read`, `grep`, `glob` and
 * `bash` all carry one. Without this set, every read in a session would cost a detector
 * pass. Measured with a wiped cache and a fresh target per tool, all ten tool names
 * scanned.
 */
const EDIT_TOOLS = new Set(["edit", "write", "apply_patch"])

/**
 * A single `apply_patch` can touch many files, and each costs a detector pass. Five is
 * enough for a real patch and bounds the worst case; the plugin logs when it truncates.
 */
export const MAX_FILES_PER_CALL = 5

/** Engine calls are milliseconds-fast. A hung detector must never stall an edit. */
const DEFAULT_TIMEOUT_MS = 5000

/**
 * Which files a tool call actually changed.
 *
 * `edit` and `write` carry `filePath`. `apply_patch` does not: OpenCode documents its
 * paths as marker lines inside `patchText`, relative to the project root. Feeding the
 * raw args to the detector returns nothing at all, so the markers are parsed here.
 *
 * @param {string} tool
 * @param {Record<string, unknown> | undefined} args
 * @returns {string[]} relative-or-absolute paths, deduplicated; empty when nothing changed
 */
export function touchedPaths(tool, args) {
  if (!EDIT_TOOLS.has(tool)) return []

  if (tool === "apply_patch") {
    const text = typeof args?.patchText === "string" ? args.patchText : ""
    // One regex, not one per marker type, so the paths come back in the order the patch
    // lists them. A move target is a path too, and matching it separately would reorder
    // the results: a file moved and then updated later in the same patch has to be
    // scanned after the move, not before it.
    //
    // Built per call rather than shared: a module-level /g regex carries `lastIndex`
    // between calls, and a hook running on every edit is the wrong place for that state.
    const marker = /^\*\*\* (?:(?:Add|Update|Delete) File|Move to):[ \t]*(.+?)[ \t]*$/gm
    const found = [...text.matchAll(marker)]
      .map((match) => match[1])
      .filter((candidate) => typeof candidate === "string" && candidate.trim() !== "")
    return [...new Set(found)]
  }

  const filePath = args?.filePath ?? args?.file_path
  return typeof filePath === "string" && filePath.trim() !== "" ? [filePath] : []
}

/**
 * The detector's stdin envelope. Shaped like the Codex `PostToolUse` payload, which is
 * the contract the CLI was written against: `session_id` keys its per-session ack cache
 * (omitting it collapses every session into one `"unknown"` bucket), and `tool_input`
 * carries the path.
 *
 * @param {{ sessionID?: string, tool: string, filePath: string }} input
 */
export function buildEnvelope({ sessionID, tool, filePath }) {
  return {
    session_id: sessionID,
    tool_name: tool,
    tool_input: { file_path: filePath },
  }
}

/**
 * Find the detector engine.
 *
 * On Windows this resolves the engine binary directly and mirrors the order in the
 * bundled `impeccable.cmd` launcher: `IMPECCABLE_BIN`, a sibling `scripts/bin/`, the
 * unversioned user binary, then the version-pinned cache read from `scripts/VERSION`.
 * Resolving the `.exe` rather than invoking the `.cmd` is deliberate. `child_process
 * .spawn` throws `EINVAL` on a `.cmd` unless `shell: true` is set, and `shell: true`
 * neither quotes the command path nor escapes the args, so a repository checked out
 * under a path containing a space fails with `'...\\sp' is not recognized`. Spawning the
 * binary directly has neither problem and needs no quoting at all.
 *
 * The one behaviour not reproduced is the launcher's first-run download. It has already
 * run in this environment, and a session where it never has gets a logged warning rather
 * than a silent no-op.
 *
 * @param {string} directory project root
 * @returns {{ command: string, args: string[] } | null} null when no engine is installed
 */
export function resolveHookCommand(directory) {
  const scriptsDir = path.join(directory, ".agents", "skills", "impeccable", "scripts")
  const env = process.env
  const home = env.USERPROFILE || env.HOME || ""

  if (process.platform !== "win32") {
    const launcher = path.join(scriptsDir, "impeccable")
    return existsSync(launcher) ? { command: launcher, args: ["hook"] } : null
  }

  const usable = (candidate) => (candidate && existsSync(candidate) ? candidate : null)
  const arch = env.PROCESSOR_ARCHITECTURE === "ARM64" ? "arm64" : "x64"

  const engine =
    usable(env.IMPECCABLE_BIN) ||
    usable(path.join(scriptsDir, "bin", `windows-${arch}`, "impeccable.exe")) ||
    usable(path.join(home, ".impeccable", "bin", "impeccable.exe")) ||
    usable(path.join(home, ".impeccable", "bin", readVersion(scriptsDir), "impeccable.exe"))

  return engine ? { command: engine, args: ["hook"] } : null
}

function readVersion(scriptsDir) {
  try {
    return readFileSync(path.join(scriptsDir, "VERSION"), "utf8").trim()
  } catch {
    return ""
  }
}

/**
 * Run one detector pass and return its raw stdout.
 *
 * Every failure path resolves to `""`. A detector that cannot start, crashes, hangs or
 * times out must not be able to fail an edit, so nothing here rejects or throws.
 *
 * @returns {Promise<string>} stdout, or "" on any failure or timeout
 */
export function runHook(command, { cwd, envelope, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command.command, command.args, {
        cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "ignore"],
      })
    } catch {
      resolve("")
      return
    }

    let stdout = ""
    let settled = false
    let timer

    const settle = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }

    timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* already gone */
      }
      settle("")
    }, timeoutMs)

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.on("error", () => settle(""))
    child.on("close", () => settle(stdout))

    // The engine may exit before reading stdin; that is not our error to raise.
    child.stdin.on("error", () => {})
    try {
      child.stdin.end(JSON.stringify(envelope))
    } catch {
      settle("")
    }
  })
}

/**
 * Pull the reminder out of a detector response.
 *
 * Silence is the common case and means "nothing to say": the detector acks a clean file
 * once per session and stays quiet after, and stays entirely quiet for plain `.ts`/`.js`
 * unless something fires. Returning "" lets the caller leave the tool result untouched
 * rather than appending an empty block.
 */
export function parseHookReminder(stdout) {
  const trimmed = typeof stdout === "string" ? stdout.trim() : ""
  if (trimmed === "") return ""

  try {
    const reminder = JSON.parse(trimmed)?.hookSpecificOutput?.additionalContext
    return typeof reminder === "string" ? reminder.trim() : ""
  } catch {
    return ""
  }
}