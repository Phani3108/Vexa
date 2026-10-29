---
name: project-completion-gate
description: Completion gate for any software or AI project. Run before the project is called done, and at kickoff to plan it. Audits guardrails, evals, observability, security, human-in-the-loop, architecture diagrams and README from the code only. Use on "done", "ready to ship", "completion check", "audit this repo", "production readiness".
---

# Project Completion Gate

Purpose: decide whether a project is complete, using only what is in the repo.

## Working rules (apply to every output)
- Source of truth is the repo. Every finding cites a file path (and line or symbol where possible).
- If something is not found, write "Not found in repo". Do not infer it exists.
- No assumptions. If intent is unclear, ask the owner before writing it down.
- Plain, humanized language. No superlatives, no confidence the evidence does not support.
- Bulleted, brief. One idea per bullet.
- Push back when the code and the stated goal disagree. Say what, where, and why.
- Documents state decisions and how they are implemented. They do not list options. Open items go in a register with an owner and a date.

## When to run
- Kickoff: use the dimensions below as the plan. Deliver the full architecture package (implementation plan, pitfalls and risks, workflows, waterfall, data flow, state machine, deployment, ER, sequence, swimlane, C4 L1 to L3).
- Before "done": audit what exists. Diagrams must match the code as it is now.

## Dimensions
For each dimension record: Status (Present / Partial / Missing), Evidence (paths), If missing (consequence), Action (one concrete step).

### 1. Guardrails
- Input validation and size/rate limits
- Prompt-injection and untrusted-content handling
- Tool and permission scoping; allow-lists
- Output validation (schema, policy, PII)
- Cost and token ceilings; loop and retry limits
- Defined fallback or refusal behavior

### 2. Evals
- Test set with expected outcomes, stored in the repo
- Metrics tied to the project's goal (accuracy, task success, latency, cost)
- Regression run in CI with a pass threshold that blocks release
- Judge calibration if an LLM grades output
- Conventional unit/integration tests for non-AI code

### 3. Observability
- Structured logs with request or run IDs
- Traces across service and agent steps
- Metrics: latency, errors, token and cost per run
- Alerts on failure and on cost spikes
- Audit trail of actions taken and by whom

### 4. Security
- Secrets handling; none committed
- Authentication and authorization on every entry point
- Dependency and container scanning
- Input sanitisation, upload and URL-fetch limits
- CORS, headers, least privilege for service accounts
- Data retention and deletion; SECURITY.md

### 5. Human in the loop
- Approval gate before irreversible or external actions
- Escalation path when confidence is low or a guardrail trips
- Override and kill switch
- Review queue and record of reviewer decisions

### 6. Architecture diagrams (Mermaid, in the README)
- C4 L1 context, L2 containers, L3 components
- Data flow, sequence, state machine, deployment, ER where the code has them
- Each diagram derived from code; unsupported parts are marked, not drawn

### 7. README
- What it is, how to run, how to test
- Production Readiness section: the six dimensions above, each with status and evidence
- Open items register: item, owner, date
- Verdict: Ready or Not ready, with the blocking items listed

## Verdict
- Ready: no Missing on Guardrails, Security or Human in the loop, and evals gate the release.
- Otherwise Not ready, with blockers listed in order.

## Output format
- Context: what was audited and at which commit
- Finding: one scorecard line per dimension
- Recommendation: blockers first, each with a consequence
- Next step: one action and one owner
