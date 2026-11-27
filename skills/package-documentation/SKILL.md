---

name: package-documentation
description: Create, redesign, or review open-source TypeScript package documentation, including READMEs, API references, examples, migration guides, and release docs. Use for consumer-facing documentation work when accuracy, examples, compatibility, or package presentation matters.
---

# Package documentation

Create accurate, task-oriented documentation for standalone `@klnap` TypeScript packages. Treat the
checked-out implementation and packed package as the authority, not earlier prose or plans.

## Workflow

1. Identify the package version and exact source snapshot. Inspect the relevant implementation,
   public exports, declarations, manifest/export map, defaults, tests, consumer fixtures, packed
   files, approved specs, existing docs, and release history. Check upstream framework behavior
   against official docs when the package integrates with it.
2. Separate shipped behavior, unpublished changes, planned work, and verified limitations. Do not
   state an unverified feature, compatibility claim, security guarantee, or performance result as
   fact. Record implementation inconsistencies for a separate engineering decision.
3. Classify the task. For README work, follow the canonical hierarchy in
   [readme-architecture.md](references/readme-architecture.md). For methodology, claims, positioning,
   and writing rules, consult [documentation-standard.md](references/documentation-standard.md).
   For checks, examples, and links, consult [verification.md](references/verification.md). Load only
   the references relevant to this task.
4. Write for the consumer's task and package complexity. Lead with the package's concrete value,
   use native platform APIs, and progress from the smallest useful example to advanced material.
   Keep small packages compact; add supporting docs only when they improve task navigation.
5. Verify material claims and examples against the package contract. Run proportionate checks, then
   report what was verified and what remains unverified.

## Done means

- Every material technical claim maps to inspected evidence or is labeled as intent or limitation.
- Examples use the public package contract and are verified at the level claimed.
- README order, installation commands, compatibility, and links match the current package.
- Documentation depth fits actual complexity; no empty template sections or duplicate authority.
- Relevant formatting, link, type, runtime, packed-artifact, and rendering checks are recorded.
