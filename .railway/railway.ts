import { defineRailway, project, service, github, preserve } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "gameforge-web";

export default defineRailway(() => {
  const gameforge_web = service("gameforge-web", {
    source: github("infinitytec15/desktop-gamer-ia", { branch: "main" }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    // Values stay in Railway; importing this file never exports credentials.
    env: Object.fromEntries(
      [
        "ADMIN_EMAIL",
        "ADMIN_PASSWORD",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_MODEL",
        "APP_URL",
        "BILLING_ENABLED",
        "DATABASE_SSL",
        "DATABASE_URL",
        "DB_POOL_MAX",
        "DESKTOP_DOWNLOAD_URL",
        "LICENSE_PEPPER",
        "LICENSE_PRIVATE_KEY",
        "MP_ACCESS_TOKEN",
        "MP_CANCEL_STATUS",
        "MP_COLLECTOR_ID",
        "MP_LIVE_MODE",
        "MP_WEBHOOK_SECRET",
        "NODE_ENV",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
        "PORT",
        "PROVIDER_ENCRYPTION_KEY",
        "SESSION_SECRET",
        "WORKER_ENABLED",
      ].map((key) => [key, preserve()]),
    ),
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: 1,
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      drainingSeconds: 20,
      overlapSeconds: 20,
    },
  });
  return project("gameforge-ai", {
    resources: [gameforge_web],
  });
});
