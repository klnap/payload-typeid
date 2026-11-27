export default {
  containerName: "payload-typeid-test-db",
  envVar: "PAYLOAD_TYPEID_TEST_DATABASE_URL",
  image: "postgres:16-alpine",
  failIfUnavailableInCI: true,
};
