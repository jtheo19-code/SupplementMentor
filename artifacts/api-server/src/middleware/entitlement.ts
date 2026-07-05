import type { Request, Response, NextFunction } from "express";
import { stripeService } from "../lib/stripeService";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      isPro?: boolean;
    }
  }
}

export const PRO_SESSION_HEADER = "x-sm-session-id";

/**
 * Resolves whether the caller has active Pro access and stores the result on
 * `req.isPro`. Entitlement is derived from a Stripe Checkout session id sent by
 * the client (header `x-sm-session-id`) and verified against Stripe — never
 * from a client-settable flag. Always calls next(); downstream handlers and
 * rate limiters decide what to do with a non-Pro request.
 */
export async function attachEntitlement(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  req.isPro = false;

  const raw = req.header(PRO_SESSION_HEADER);
  const sessionId = typeof raw === "string" ? raw.trim() : "";

  if (sessionId) {
    try {
      req.isPro = await stripeService.verifyProAccess(sessionId);
    } catch (err) {
      req.log.error({ err }, "Pro entitlement verification failed");
      req.isPro = false;
    }
  }

  next();
}
