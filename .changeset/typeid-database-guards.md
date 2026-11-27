---
"@klnap/payload-typeid": minor
---

On PostgreSQL, install database guards for managed tables: generate a TypeID for raw SQL inserts without an ID, reject IDs with the wrong prefix or shape, and reject changes to an existing ID. Guards run on every Payload start and do not apply to other adapters.
