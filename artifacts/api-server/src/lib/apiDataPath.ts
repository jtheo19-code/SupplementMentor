import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveApiDataDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "data"),
    join(here, "../../data"),
    join(process.cwd(), "artifacts/api-server/data"),
    join(process.cwd(), "data"),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, "verifiedProducts.json"))) {
      return dir;
    }
  }

  throw new Error("verifiedProducts.json data directory not found.");
}
