---
"@klnap/payload-typeid": minor
---

Manage every collection by default. Registering `typeId()` gives each collection a TypeID prefix derived from its slug using Payload's singularization. Set `custom.typeId` to a string to override, or to `false` to opt out. Central `typeId({ collections })` entries apply when a collection omits `custom.typeId`.

Breaking: this replaces the explicit opt-in from 0.2.0. Registering the plugin changes the ID type of every collection that does not opt out. Migrate existing data or set `custom.typeId: false` on those collections before upgrading.
