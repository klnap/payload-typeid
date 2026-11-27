# Documentation standard

Apply these methods as concrete decisions, not as slogans. Use the smallest documentation structure
that fully answers the consumer's questions.

## Evidence and claim levels

Before writing, identify the exact commit or worktree state and package version. Inspect the evidence
that governs the claim:

- Implementation and tests establish actual behavior.
- Public exports and generated declarations establish the supported TypeScript surface.
- `package.json`, its export map, and the packed artifact establish installable entry points and
  distributed files.
- Configuration code and tests establish defaults, precedence, and the meaning of omitted values.
- Consumer fixtures establish package-level imports and type inference in realistic projects.
- Approved specifications establish intended behavior only when implementation status is clear.
- Upstream implementation and official documentation establish framework behavior and compatibility.
- Existing docs and release history provide context, not proof of current behavior.

Label evidence accurately: source behavior, type compatibility, package import compatibility, runtime
behavior, measured performance, architectural intent, known limitation, or unverified environment.
Do not turn an intended feature into an available feature. Do not infer runtime or framework support
from a mock, type-check, or source-level test alone.

## User needs and structure

Use Diátaxis to distinguish learning tutorials, task-oriented how-to guides, factual reference, and
explanation of concepts or design. Use Jobs to Be Done to name the task readers arrive to complete.
Use progressive disclosure to put the fastest useful path first and defer detail until needed.

Apply the inverted pyramid: state the outcome or constraint first, then the steps, then rationale and
edge cases. Use Docs as Code: review documentation with the source, version it with the package,
validate examples and links, and keep one authoritative location for each fact.

Treat documentation as part of developer experience. Remove setup friction, preserve native
framework conventions, explain the next action, and make failure modes recoverable. Use executable
documentation where a check can prove the claim. Use plain language: familiar words, active voice,
short paragraphs, descriptive headings, and concrete verbs.

## Product positioning

Explain the consumer problem before implementation details. State who the package serves, what it
does, why it exists, and what value it adds over the native platform. Describe a real limitation or
cost in existing approaches; never exaggerate one to make the package appear necessary.

Describe general-purpose packages for their actual audience. Do not narrow positioning to one
application-specific use case unless the package itself is specific to it. Present features as
consumer outcomes, not a list of internal modules, helpers, or types. Support claims with behavior
and examples instead of adjectives such as “enterprise-grade,” “battle-tested,” or “blazing-fast.”

Use a Why? section when the package's value is not obvious. Before-and-after examples must solve the
same problem with equivalent requirements and security.

## Examples and native integrations

Start with the package's central value using the least configuration and code that works. Prefer
ordinary consumer code, native framework APIs, sensible defaults, and contextual TypeScript
inference. Introduce common customization before advanced configuration, extension points, or
framework integration.

Mark conceptual snippets as illustrative. Call an example complete or runnable only when its imports,
setup, and required application-owned functions are present and checked. Avoid unexplained helpers,
artificial wrappers, deprecated APIs, and advanced generic parameters in first-use examples.

For framework integrations, use established framework terminology. Identify what the package adds,
what the framework still owns, and which native APIs remain available. Keep integration minimal and
state compatibility only for versions and environments supported by evidence.

## API, configuration, compatibility

Document the actual public API. For public options, describe type, default, purpose, runtime semantics,
constraints, precedence, and practical use where relevant. Distinguish omission from explicit `false`,
zero, empty arrays, empty objects, and other values when behavior differs.

Separate source-level, declaration/type-level, package-import, and runtime compatibility. State
actual Node.js and runtime requirements, peer dependencies, supported frameworks and environments,
and known limitations. A mocked test cannot prove a runtime integration.

Do not change runtime architecture to simplify prose. Report an implementation inconsistency as an
engineering question rather than documenting an invented contract.

## Security and performance

Use application-owned authentication and authorization in security examples. State trust boundaries
and material limitations beside the relevant example. Convenience APIs are not security guarantees.
Never choose a misleadingly insecure example merely to save lines.

Do not invent benchmark results, diagnostics, or security assurances. Include performance measurements
only when they help a consumer choose or operate the package; state versions, environment, workload,
and method. Distinguish measured results from architectural intent.

## Language and maintenance

Write professional English for consumers. Use consistent terminology, purposeful tables, descriptive
headings, and concise paragraphs. Avoid marketing fluff, excess badges or emoji, decorative banners,
wall-of-text sections, and repeated explanations.

Keep one authoritative version of each claim. Update README, manifest description, exports, npm
presentation, examples, supporting docs, migration material, and release notes together when affected.
Do not create a heading or file only to match a checklist.

For substantial redesigns, inspect mature projects that solve a relevant problem. Compare information
hierarchy, first use, motivation, examples, navigation, and doc architecture. Transfer principles,
not wording or brand identity. Skip ecosystem research for small corrections.
