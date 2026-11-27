# Documentation verification

Choose checks from the claims and files changed. Do not run every tool for every task.

## Contract and examples

- Recheck public exports, generated declarations, package manifest/export map, defaults, tests, and
  packed files for every affected claim.
- Compile TypeScript examples when they claim type safety or contextual inference. Check the actual
  inferred types when they are part of the benefit.
- Use an isolated external consumer fixture for package imports when appropriate. Import the packed
  package, not private source paths.
- Execute representative runtime examples when they claim runtime behavior. Include framework
  versions and setup needed to interpret the result.
- Verify documented defaults, precedence, omitted values, and constraints against implementation
  and tests.
- Use existing repository checks and fixtures before adding new ones. Do not build a documentation
  testing framework for a small package.

## Compatibility, security, and performance

- Trace compatibility claims to an actual runtime, package-import, or type-level test at the stated
  layer. State the tested version and leave other environments unverified.
- Review security examples for realistic application-owned authorization, trust boundaries, and
  nearby warnings. Do not frame convenience as a guarantee.
- Check benchmark method, package/runtime versions, machine or environment, and workload. Remove
  unsupported or non-reproducible numbers.

## Presentation and package-wide consistency

- Check links and anchors, Markdown formatting, and GitHub/npm rendering when available.
- Confirm package name, description, version, exports, npm presentation, README, docs, examples,
  migration guidance, and release notes agree with the current packed artifact.
- Inspect the tarball when packaging boundaries or shipped documentation matter.
- Check that documentation changes do not claim a release or feature that has not shipped.

## Report evidence

Record only checks that ran and their outcomes. Distinguish source inspection, type checking, package
import, runtime execution, measured performance, and rendering checks. Name unverified claims or
environments when they matter; never simulate a result or repeat unrelated checks.
