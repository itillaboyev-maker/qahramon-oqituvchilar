# Architectural Decision Records (ADR)

This directory stores architecture decision records for significant technical choices.
Each file should explain the context, decision, consequences, and current status.

## ADR Workflow

- Create a new ADR whenever an architecture-level decision is made.
- Reference the decision ID and update `docs/DECISIONS.md` if the decision affects product or architecture policy.
- Do not overwrite existing ADRs; append new ones when the decision evolves.

## File Naming

Use a clear timestamped or incremental format, for example:

- `0001-use-cases-vs-domain-services.md`
- `0002-teacher-identity-resolution.md`

## Template

Use a simple structure:

```md
# ADR 000X — Short descriptive title

## Status

Proposed / Accepted / Superseded

## Context

Describe the problem or tradeoff.

## Decision

State the chosen approach.

## Consequences

List the expected impact and any follow-up work.
```

## Notes

- Keep ADRs concise and actionable.
- Link ADRs from `docs/DECISIONS.md` when they affect higher-level project decisions.
- Keep this README current as ADR practices evolve.
