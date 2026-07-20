# Execution Master

This document defines the delivery cadence, milestone tracking, risk controls, and execution checklist for operational progress.

## Table of Contents

- [Purpose](#purpose)
- [Delivery Cadence](#delivery-cadence)
- [Milestones](#milestones)
- [Risk and Issue Management](#risk-and-issue-management)
- [Roles and Responsibilities](#roles-and-responsibilities)
- [Execution Checklist](#execution-checklist)

## Purpose

Keep the team aligned on what is being delivered, when, and how progress is measured.

## Delivery Cadence

- Use staged progress for major capabilities.
- Review `docs/ROADMAP.md` and `docs/PROJECT_STATE.md` at each milestone.
- Keep the backlog ordered around production readiness.

## Milestones

- MVP completion
- Media pipeline completion
- Moderator workflow hardening
- Production launch readiness
- Post-launch stabilization

## Risk and Issue Management

- Track known issues in `docs/PROJECT_STATE.md`.
- Escalate unresolved defects before deployment.
- Keep architecture impact small and documented.

## Roles and Responsibilities

- Engineers: implement use-cases, tests, and docs updates.
- Reviewers: validate architecture, code quality, and doc sync.
- Release owner: coordinate deploy checks and update `CHANGELOG.md`.

## Execution Checklist

- Verify work with type checking and dry-run build.
- Update project state and changelog on completion.
- Document any architecture decision in `docs/adr/`.
- Review docs for accuracy before merge.
