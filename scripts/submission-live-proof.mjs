process.env.ALEXANDRIA_BASE_URL = "https://alexandria-here.cinemaexile.chatgpt.site";
process.env.ALEXANDRIA_REFERENCE_RECOVERY_PATH = "/r/18026989-33be-4011-86ee-19e1754cb22c";
process.env.ALEXANDRIA_REQUIRE_EXACT_REFERENCE_PROOF = "1";

await import("./production-smoke.mjs");
