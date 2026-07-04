import { Router, type IRouter } from "express";
import { GenerateTimingMapBody, GenerateTimingMapResponse } from "@workspace/api-zod";
import { SEED_PRODUCTS } from "../lib/seedProducts";
import { generateTimingMap } from "../lib/timingEngine";

const router: IRouter = Router();

router.post("/timing-map", (req, res) => {
  const body = GenerateTimingMapBody.parse(req.body);

  const selected = SEED_PRODUCTS.filter((p) => body.productIds.includes(p.id));
  if (selected.length === 0) {
    res.status(400).json({ error: "No valid product ids were provided." });
    return;
  }

  const result = generateTimingMap(selected, body.anchors);
  const data = GenerateTimingMapResponse.parse(result);
  res.json(data);
});

export default router;
