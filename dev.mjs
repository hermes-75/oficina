import { spawn } from "node:child_process";

const children = [
  spawn("node", ["server/hermes-bridge.mjs"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
  spawn("npx", ["vite", "--host", "0.0.0.0", "--port", "5174"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
];

function stopAll(signal) {
  for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => {
  stopAll("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll("SIGTERM");
  process.exit(0);
});
