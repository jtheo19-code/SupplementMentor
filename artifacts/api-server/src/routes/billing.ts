import { Router, type IRouter } from "express";
import {
  CreateCheckoutSessionBody,
  CreateCheckoutSessionResponse,
  VerifyCheckoutSessionResponse,
} from "@workspace/api-zod";
import { stripeService } from "../lib/stripeService";

const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID;

const router: IRouter = Router();

router.post("/checkout", async (req, res) => {
  const { email } = CreateCheckoutSessionBody.parse(req.body);

  if (!PRO_PRICE_ID) {
    res.status(400).json({ error: "Pro plan is not configured yet." });
    return;
  }

  const customerId = await stripeService.findOrCreateCustomer(email);
  const origin = `${req.protocol}://${req.get("host")}`;

  const session = await stripeService.createCheckoutSession(
    customerId,
    PRO_PRICE_ID,
    `${origin}/app/map?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    `${origin}/app/map?checkout=cancelled`,
  );

  const data = CreateCheckoutSessionResponse.parse({ url: session.url });
  res.json(data);
});

router.get("/checkout/verify", async (req, res) => {
  const sessionId = String(req.query.sessionId ?? "");
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required." });
    return;
  }

  const active = await stripeService.verifyProAccess(sessionId);
  const data = VerifyCheckoutSessionResponse.parse({ active });
  res.json(data);
});

export default router;
