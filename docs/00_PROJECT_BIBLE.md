# Project Bible

This is the engineering knowledge base manifest for the Qahramon O‘qituvchilar repository.
It defines the project purpose, core principles, documentation expectations, and the operating rules
for maintaining the repo over time.

## Table of Contents

- [Purpose](#purpose)
- [Scope](#scope)
- [Core Principles](#core-principles)
- [Documentation Policy](#documentation-policy)
- [Engineering Workflow](#engineering-workflow)
- [Key Artifacts](#key-artifacts)
- [Constitution](#constitution)

## Purpose

This file exists to keep the team aligned on product intent, architecture discipline, and how
engineering work is translated into living project documentation.

## Scope

This repository contains the Qahramon O‘qituvchilar platform: Telegram bots, backend services,
database schema, and operational tooling for the national teacher recognition archive.

## Core Principles

- Ship safely and iteratively.
- Keep business logic in UseCases, not transport handlers.
- Preserve existing documentation; add new docs only when needed.
- Treat documentation as part of the product.
- Maintain a single source of truth for architecture and project state.

## Documentation Policy

Documentation is part of the product. Every meaningful code change must update PROJECT_STATE.md,
CHANGELOG.md and, when architecture changes, create or update an ADR.

From now on, whenever you complete an implementation:

1. Update PROJECT_STATE.md.
2. Update CHANGELOG.md.
3. Update ADR if architecture changed.
4. Keep documentation synchronized with the repository.

## Engineering Workflow

- Use the existing `docs/` folder as the primary knowledge base.
- Reuse existing docs when they are already present.
- Create missing files only; do not overwrite existing documentation.
- Write professional, concise content.
- Keep placeholders meaningful and actionable.

## Key Artifacts

- `docs/00_PROJECT_BIBLE.md`
- `docs/01_PROJECT_STATE.md`
- `docs/02_ENGINEERING_PLAYBOOK.md`
- `docs/03_EXECUTION_MASTER.md`
- `docs/04_AI_HANDOFF.md`
- `docs/decisions/CHANGELOG.md`
- `docs/decisions/DECISIONS.md`
- `docs/decisions/ROADMAP.md`
- `docs/adr/README.md`

## Constitution

From now on, `docs/00_PROJECT_BIBLE.md` is the Constitution of this repository.

- Never rewrite this file.
- Never summarize it.
- Never replace existing chapters.
- Only append new approved chapters.
- Preserve numbering, terminology, style and cross references.
- When a new chapter is provided, insert it in the correct location while preserving the entire document.
- Whenever a new chapter is approved:
  1. Insert it into the correct location in `docs/00_PROJECT_BIBLE.md`.
  2. Preserve all previous chapters exactly.
  3. Update the table of contents if needed.
  4. Update internal cross references if needed.
  5. Never change the meaning of previously approved content.
  6. Keep the document publication quality at all times.
