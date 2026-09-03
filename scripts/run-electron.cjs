const { spawn } = require("node:child_process");
const path = require("node:path");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const mode = process.argv[2] || "dev";
const electronVite = path.join(
  __dirname,
  "..",
  "node_modules",
  "electron-vite",
  "bin",
  "electron-vite.js"
);
const electronBin = require("electron");

const child =
  mode === "start"
    ? spawn(electronBin, [path.join(__dirname, "..")], { stdio: "inherit", env })
    : spawn(process.execPath, [electronVite, mode], { stdio: "inherit", env });

child.on("exit", (code) => process.exit(code ?? 0));
