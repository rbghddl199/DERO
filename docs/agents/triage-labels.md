# Triage Labels

_Read this when a skill asks for a triage label, or when writing the `Status:` line of a ticket._

**Triage as a workflow is inactive.** There is no external request channel — no external tracker, no incoming issues from anyone but the maintainer — so nothing arrives needing triage. The five roles survive only as the **status vocabulary of local tickets** (`docs/agents/issue-tracker.md`).

This file is written in English (HARNESS-RULES §3 "문서 언어"). **Output language: Korean.**

| Label in mattpocock/skills | Our string | Meaning |
| -------------------------- | ----------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`    | needs maintainer review |
| `needs-info`               | `needs-info`      | waiting on more info from the reporter |
| `ready-for-agent`          | `ready-for-agent` | fully specified — an AFK agent can start |
| `ready-for-human`          | `ready-for-human` | needs a human to implement |
| `wontfix`                  | `wontfix`         | will not be handled |

In practice a ticket is `ready-for-agent`, `ready-for-human` or `deferred` (a local addition for work parked on an external gate). When a skill mentions a role, write the string in the middle column into the ticket's `Status:` line.

If a request channel ever reappears, this file is where the mapping to that channel's labels goes.
