---
"@klnap/payload-typeid": patch
---

Test infrastructure only: `bun run test:postgres` provisions a disposable PostgreSQL container when no database URL is set, and fails with a diagnostic instead of running without a database. No runtime change.
