import rateLimit, { type Options } from "express-rate-limit";
import type { Request } from "express";

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const HOUR_MS = 60 * 60 * 1000;

const skipPro = (req: Request) => req.isPro === true;

const baseOptions: Partial<Options> = {
  windowMs: HOUR_MS,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPro,
  message: {
    error:
      "You've reached the free usage limit for now. Upgrade to Pro for unlimited access, or try again later.",
  },
};

/**
 * Protects /api/timing-map from direct (non-UI) abuse. Verified Pro callers are
 * skipped; everyone else is capped per IP per hour. In-memory store — no DB
 * table. Note: an in-memory store is per-instance and resets on restart, which
 * is acceptable for this Phase 1 backstop.
 */
export const timingLimiter = rateLimit({
  ...baseOptions,
  limit: intFromEnv("TIMING_MAP_RATE_LIMIT", 20),
});

/**
 * Stricter limit for the expensive AI label-scan endpoint (OpenAI vision).
 * Verified Pro callers are skipped.
 */
export const scanLimiter = rateLimit({
  ...baseOptions,
  limit: intFromEnv("SCAN_LABEL_RATE_LIMIT", 10),
});
