# Agent lanes

You share this repo with other agents. The folder the human opened is **theirs**.
Do not coordinate by splitting files in AGENTS.md — isolate with a git worktree.

## Do this without being asked

1. **Before the first edit** (code, config, docs, assets):

   ```bash
   node tools/agent-isolate.mjs <short-slug>
   ```

   Use a slug from the task (`events`, `stunt`, `hud`). The command prints JSON
   with `path`, `branch`, and `port`. **All further reads and writes go in
   `path`** (absolute). Do not keep editing the human checkout.

   If you are already in a worktree (`isolated: true` from
   `node tools/agent-isolate.mjs --status`), skip this.

2. **When the task is done** (from that `path`):

   ```bash
   node tools/agent-isolate.mjs --finish
   ```

   That **commits locally** on `agent/<slug>` and **merges into the human
   folder only if git can do it without a conflict**. It never pushes, never
   rebases master, never runs `npm run world`.

   If `merge.merged` is false, leave the work on the branch and say so in one
   sentence. Do not force anything.

3. **Read-only questions** (explain, search, no file changes) may stay in the
   human folder.

## Do not

- Edit the human checkout and a worktree in the same task.
- `git push`, `--force`, `checkout master` in a lane, or commit in the human folder.
- `npm run world` or `npm run roads` without `--wp6`.
- Take ports **5180** (dev) or **4180** (preview). Use the `port` from isolate
  (`npx vite --port <port> --strictPort`).
- Junction or share `.cache` / `dist`. `node_modules` and `assets/generated`
  are already shared by the isolate script.

## Finish vs snapshot

Grok/Cursor stop hooks may snapshot a dirty lane (`wip(agent): auto snapshot`).
That is only a safety net. **`--finish` is the real end of the task.**
