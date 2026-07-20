# Engineering Playbook

This document captures the engineering standards, workflows, and practical guidance for contributors.
It is the place to keep team conventions, decision-making habits, and quality guardrails.

## Table of Contents

- [Purpose](#purpose)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing and Validation](#testing-and-validation)
- [Release and Deployment](#release-and-deployment)
- [Documentation Requirements](#documentation-requirements)

## Purpose

Ensure the team shares a common operational approach for coding, reviewing, testing, and deploying.

## Development Workflow

- Open a focused branch for each feature or fix.
- Keep commits small and self-contained.
- Prefer clarity over cleverness in type-safe code.
- Use the repository’s existing architecture: domains, use cases, ports/adapters.

## Coding Standards

- Keep business rules in `src/application/use-cases` and domain services.
- Keep persistence in repository implementations under `src/infrastructure/db/repositories`.
- Keep transport logic in handlers only.
- Preserve explicit error handling and avoid silent failures.
- Keep naming consistent and avoid path aliasing unless already supported by the build.

## Testing and Validation

- Run `npm run typecheck` before pushing changes.
- Prefer small validation checks in use cases.
- Keep runtime errors visible in log output and bot catch handlers.
- Document any schema or migration changes in `docs/DATABASE.md` and `migrations/`.

## Release and Deployment

- Verify production build with `wrangler deploy --dry-run` when changing deployment code.
- Keep deployment instructions current in `docs/DEPLOYMENT.md`.
- Use top-level `CHANGELOG.md` for release notes and stage progress.

## Documentation Requirements

- Update `docs/PROJECT_STATE.md` for every meaningful completed implementation.
- Capture decision-level changes in `docs/DECISIONS.md`.
- Record architecture changes in an ADR under `docs/adr/`.
- Keep `docs/` and root-level documentation synchronized.
