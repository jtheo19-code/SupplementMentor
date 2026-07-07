/**
 * Correct common shelf-label OCR misreads before deterministic identity matching.
 */
import { hasVitaminB12Evidence, hasVitaminD3Evidence } from "./shelfIdentityEvidence";

export function normalizeShelfOcrLines(lines: string[]): string[] {
  return lines.map((line) => normalizeShelfOcrLine(line));
}

function normalizeShelfOcrLine(line: string): string {
  let text = line.trim();
  if (!text) return text;

  if (hasVitaminB12Evidence(text) || hasVitaminD3Evidence(text)) {
    return text;
  }

  // Solgar Vitamin C 1000 mg is often misread as "VITAMIN 10000 MCG" (dropped C, extra zero, MG→MCG).
  text = text.replace(/\bvitamin\s+10000\s+mcg\b/gi, "VITAMIN C 1000 MG");
  text = text.replace(/\bvitamin\s+1000\s+mcg\b/gi, "VITAMIN C 1000 MG");

  return text;
}
