import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const configuredSecret = process.env.RECOVERY_RATE_LIMIT_SECRET?.trim() || "";
if (configuredSecret && configuredSecret.length < 16) {
  throw new Error("RECOVERY_RATE_LIMIT_SECRET must be empty or contain at least 16 characters.");
}

const vinextCliPath = fileURLToPath(new URL("./cli.js", import.meta.resolve("vinext")));

const child = spawn(
  process.execPath,
  [vinextCliPath, "dev", ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RECOVERY_RATE_LIMIT_SECRET: configuredSecret || randomBytes(32).toString("hex"),
    },
    stdio: "inherit",
    windowsHide: true,
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});
process.exitCode = exitCode;
