import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = resolve(tmpdir());
const scratch = await mkdtemp(join(temporaryRoot, "persistent-frontier-graph-"));
const consumer = join(scratch, "consumer");

if (!scratch.startsWith(`${temporaryRoot}${sep}`)) {
  throw new Error(`Refusing to manage unsafe package-smoke path: ${scratch}`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}.`,
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
}

try {
  await mkdir(consumer, { recursive: true });
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is required for the package smoke test.");
  run(process.execPath, [npmCli, "pack", "--silent", "--pack-destination", scratch], repository);
  const archive = (await readdir(scratch)).find((name) => name.endsWith(".tgz"));
  if (!archive) throw new Error("npm pack did not create an archive.");

  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
  await copyFile(join(repository, "package-tests", "consumer.ts"), join(consumer, "consumer.ts"));
  await copyFile(join(repository, "package-tests", "runtime.mjs"), join(consumer, "runtime.mjs"));
  await copyFile(join(repository, "package-tests", "tsconfig.json"), join(consumer, "tsconfig.json"));
  run(process.execPath, [npmCli,
    "install",
    "--ignore-scripts",
    "--legacy-peer-deps",
    "--no-package-lock",
    join(scratch, archive),
    "react@19.2.8",
    "react-dom@19.2.8",
    "@types/react@19.2.18",
    "@types/react-dom@19.2.4",
  ], consumer);

  const typescript = join(repository, "node_modules", "typescript", "bin", "tsc");
  run(process.execPath, [typescript, "-p", join(consumer, "tsconfig.json")], consumer);
  run(process.execPath, [join(consumer, "runtime.mjs")], consumer);
  process.stdout.write("Installed package consumer smoke test passed.\n");
} finally {
  await rm(scratch, { force: true, recursive: true });
}
