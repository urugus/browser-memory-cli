import { spawnSync } from "node:child_process";

const SERVICE = "browser-memory-cli";

export const setCredential = (name, value) => {
  const proc = spawnSync(
    "security",
    ["add-generic-password", "-a", name, "-s", SERVICE, "-w", value, "-U"],
    { encoding: "utf8" },
  );

  if (proc.status !== 0) {
    throw new Error(proc.stderr || "failed to save credential");
  }
};

export const getCredential = (name) => {
  const proc = spawnSync("security", ["find-generic-password", "-a", name, "-s", SERVICE, "-w"], {
    encoding: "utf8",
  });

  if (proc.status !== 0) {
    return null;
  }
  return (proc.stdout || "").trim();
};

export const deleteCredential = (name) => {
  const proc = spawnSync("security", ["delete-generic-password", "-a", name, "-s", SERVICE], {
    encoding: "utf8",
  });

  if (proc.status !== 0) {
    throw new Error(proc.stderr || "failed to delete credential");
  }
};
