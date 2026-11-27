---
"@klnap/payload-typeid": patch
---

Fix PostgreSQL guard installation: objects are qualified with the adapter schemaName (a same-named table in public is no longer modified), DDL runs only for missing or differing objects so a runtime role without owner rights can start, and the database guards are checked against an explicit schema test suite.
