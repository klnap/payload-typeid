# README architecture

Use this canonical information hierarchy for standalone `@klnap` package READMEs. It orders
information; it does not require ten separate headings.

1. **Identity** — Package title and concise, one-sentence product description. Do not add an
   “Identity” heading.
2. **Quick example** — Minimal, realistic demonstration of the package's primary value. Place it
   immediately after the introduction, before installation and detailed explanation.
3. **Why?** — The actual developer problem, motivation, and reason the package exists.
4. **Features** — Key capabilities expressed as consumer benefits.
5. **Installation** — Separate Bun and npm installation commands.
6. **Usage** — Practical examples progressing from basic integration to advanced use cases. Combine
   Getting Started, Core Usage, and Advanced Usage here when useful.
7. **Configuration** — Relevant options, defaults, semantics, precedence, and constraints.
8. **Compatibility** — Verified runtime requirements, framework compatibility, peer dependencies,
   environments, and limitations.
9. **Documentation** — Relevant links to concepts, guides, API, security, or migration material.
10. **License** — License information.

## Scale and disclosure

Omit sections that provide no meaningful consumer value. Avoid redundant explanations, duplicate
examples, and headings that exist only to satisfy this list.

Keep a small library's complete useful documentation in its README. Small Payload plugins may do the
same. Use supporting docs for complex packages, including revalidation and next-proxy-chain, when
separate pages improve navigation and maintenance.

For a small library, include the complete public API in Usage unless a separate API reference improves
navigation. Do not add a detached API section just to create another heading.

The README introduces the package and provides essential use. Supporting docs can hold architecture
and semantics, task guides, complete API reference, security boundaries, and migration instructions.
Add only the files justified by reader tasks. Keep runnable examples in examples when they serve as
real integrations rather than short snippets.

## First screen

The package title and one-sentence description identify the package and consumer outcome. Follow
them immediately with the shortest realistic example that demonstrates its central value. Keep
installation, motivation, and detailed options after that first-use proof.

Use native framework APIs and ordinary application code. Include only setup required for the example
to work. Explain application-owned functions and mark a conceptual snippet when it is not complete.
