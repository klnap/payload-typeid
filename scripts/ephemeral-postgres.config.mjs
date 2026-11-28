export default {
  containerName: "payload-typeid-test-db",
  label: "payload-typeid.ephemeral-postgres",
  envVar: "PAYLOAD_TYPEID_TEST_DATABASE_URL",
  // Same pinned image as .github/workflows/ci.yml's postgres service: one server version everywhere.
  image:
    "postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea",
  cleanupDelayMs: 750,
};
