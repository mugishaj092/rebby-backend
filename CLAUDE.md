# CLAUDE.md

**Read `AGENTS.md` first, in full — it is the source of truth for this repository** (golden rules, context files, folder structure, layering, workflow, definition of done).

## Skills — use them proactively, don't wait to be asked

Skills exist to keep engineering discipline consistent across sessions. **Invoke the relevant skill automatically at the point in the workflow where it belongs — do not wait for the user to type `/architect`, `/review`, etc. manually.**

### The Engineering Loop

```
/remember restore  →  /architect  →  Build  →  /review  →  Ship
                                         ↓
                                    /imprint (after every UI component)
                                         ↑
                                    /recover (when something breaks)
```

| Skill | Auto-invoke when |
|---|---|
| `remember` (restore) | Start of every session — restore context from `memory.md` before doing anything else. |
| `architect` | Before starting any non-trivial feature/task, to think it through and produce a plan to confirm before coding. |
| `review` | Immediately after finishing any feature, before marking it done. |
| `remember` (save) | End of every session, or before context is lost/compacted. |
| `recover` | The moment something breaks or a debugging loop stalls — diagnose before re-prompting for another patch. |

Full trigger detail and rationale live in `AGENTS.md` §8.

### Domain skills

Also check `.claude/skills/` for a skill relevant to the specific library or task at hand (`prisma-client-api`, `prisma-database-setup`, `clerk-backend-api`, `clerk-setup`, `cloudinary-*`, `generate-swagger-docs`, `nodejs-backend-patterns`, …) and follow its guidance whenever you touch that part of the stack — invoke it because the task calls for it, not because the user asked by name.

**`rebby-backend` (`.claude/skills/rebby-backend/`, including its `references/*.md` like `golden-rules.md`) is this project's own skill and always takes priority.** If any other skill's guidance — engineering-loop skills included — conflicts with it, `rebby-backend` wins.
