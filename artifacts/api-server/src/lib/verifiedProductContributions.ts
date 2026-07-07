import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { StoredIngredient } from "@workspace/db";
import { parseRawIngredients } from "./scanIngredients";
import { resolveApiDataDir } from "./apiDataPath";

const contributionsPath = join(resolveApiDataDir(), "verifiedProductContributions.json");

export type ContributionStatus = "pending_review" | "approved" | "rejected";

export interface VerifiedProductContribution {
  id: string;
  verifiedProductId: string;
  brand: string | null;
  productName: string;
  ingredients: { name: string; mgAmount: number }[];
  supplementFactsText: string | null;
  frontLabelImage: string | null;
  backLabelImage: string | null;
  supplementFactsImage: string | null;
  submittedAt: string;
  status: ContributionStatus;
  reviewedAt: string | null;
}

interface ContributionsFile {
  schemaVersion: number;
  contributions: VerifiedProductContribution[];
}

function readContributionsFile(): ContributionsFile {
  try {
    const raw = readFileSync(contributionsPath, "utf8");
    return JSON.parse(raw) as ContributionsFile;
  } catch {
    return { schemaVersion: 1, contributions: [] };
  }
}

function writeContributionsFile(file: ContributionsFile): void {
  writeFileSync(contributionsPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export function submitVerifiedProductContribution(input: {
  verifiedProductId: string;
  brand: string | null;
  productName: string;
  ingredients: StoredIngredient[];
  supplementFactsText?: string | null;
}): VerifiedProductContribution {
  const file = readContributionsFile();
  const contribution: VerifiedProductContribution = {
    id: randomUUID(),
    verifiedProductId: input.verifiedProductId,
    brand: input.brand,
    productName: input.productName.trim(),
    ingredients: input.ingredients.map((ing) => ({ name: ing.name, mgAmount: ing.mgAmount })),
    supplementFactsText: input.supplementFactsText ?? null,
    frontLabelImage: null,
    backLabelImage: null,
    supplementFactsImage: null,
    submittedAt: new Date().toISOString(),
    status: "pending_review",
    reviewedAt: null,
  };
  file.contributions.push(contribution);
  writeContributionsFile(file);
  return contribution;
}

export function listPendingContributions(): VerifiedProductContribution[] {
  return readContributionsFile().contributions.filter((c) => c.status === "pending_review");
}

export function getApprovedContributionIngredients(
  verifiedProductId: string,
): StoredIngredient[] | null {
  const approved = readContributionsFile().contributions
    .filter((c) => c.verifiedProductId === verifiedProductId && c.status === "approved")
    .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))[0];

  if (!approved) return null;
  return parseRawIngredients(approved.ingredients);
}
