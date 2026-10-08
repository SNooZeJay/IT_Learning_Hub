/**
 * The Impeccable design detector hook, as an OpenCode plugin.
 *
 * Impeccable installs its hook through per-harness manifests (`.claude/settings.local.json`,
 * `.codex/hooks.json`, `.cursor/hooks.json`, and so on). OpenCode has no hook manifest,
 * and this repository only carries the Codex one, so the detector had no caller here and
 * its `MANUAL_DETECTOR_REQUIRED` fallback was suppressed at the same time. Editing a Vue
 * file scanned nothing and reported nothing.
 *
 * This is that missing caller: on every edit, hand the changed file to the detector and
 * append whatever it says to the tool result, which is the slot OpenCode exposes for
 * context injection (`output.output` is a mutable string, the counterpart of the
 * `additionalContext` Codex feeds back on PostToolUse).
 *
 * Deliberately post-edit only. Impeccable also runs a deeper pass on the harness `Stop`
 * event over every file touched in a session. OpenCode's `event` hook is observe-only and
 * cannot inject into context, so wiring that pass means going through
 * `experimental.chat.messages.transform` on the next turn instead. Deferred: the per-edit
 * loop is the part that fires while work is happening, and it is the part that was
 * entirely missing. The deep pass stays manual, via `impeccable detect --json <paths>`.
 *
 * All logic lives in `../lib/impeccable-hook.js` because OpenCode invokes every export of
 * a file in this directory as a plugin, which rules out exporting helpers from here.
 */

import {
  MAX_FILES_PER_CALL,
  buildEnvelope,
  parseHookReminder,
  resolveHookCommand,
  runHook,
  touchedPaths,
} from "../lib/impeccable-hook.js"

export const ImpeccableDesignHook = async ({ client, directory, worktree }) => {
  const cwd = worktree || directory

  const log = (level, message, extra) =>
    client.app.log({ body: { service: "impeccable-hook", level, message, extra } })

  const command = resolveHookCommand(cwd)
  if (!command) {
    await log(
      "warn",
      "Impeccable engine not found, so the design hook is inactive for this session. " +
        "Run `impeccable hooks on` or `impeccable detect --json <paths>` manually.",
      { cwd },
    )
    return {}
  }

  return {
    "tool.execute.after": async (input, output) => {
      try {
        const files = touchedPaths(input.tool, input.args)
        if (files.length === 0) return

        const reminders = []
        for (const filePath of files.slice(0, MAX_FILES_PER_CALL)) {
          const reminder = parseHookReminder(
            await runHook(command, {
              cwd,
              envelope: buildEnvelope({ sessionID: input.sessionID, tool: input.tool, filePath }),
            }),
          )
          if (reminder !== "") reminders.push(reminder)
        }

        if (files.length > MAX_FILES_PER_CALL) {
          await log("warn", `Patch touched ${files.length} files; scanned the first ${MAX_FILES_PER_CALL}.`, {
            tool: input.tool,
            callID: input.callID,
            skipped: files.slice(MAX_FILES_PER_CALL),
          })
        }

        // Nothing to say is the common case: a clean file is acked once per session, and
        // a quiet one stays quiet. Appending an empty block would only cost a turn.
        if (reminders.length === 0) return

        output.output = `${output.output}\n\n${reminders.join("\n\n")}`
      } catch (error) {
        // Never let a detector fault surface as a failed edit.
        await log("error", "Design hook threw; edit unaffected.", {
          tool: input.tool,
          callID: input.callID,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}