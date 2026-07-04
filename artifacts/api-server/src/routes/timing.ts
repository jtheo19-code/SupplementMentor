import { Router, type IRouter } from "express";
import { inArray } from "drizzle-orm";
import { GenerateTimingMapBody, GenerateTimingMapResponse } from "@workspace/api-zod";
import { db, productsTable } from "@workspace/db";
import { generateTimingMap } from "../lib/timingEngine";

const router: IRouter = Router();

router.post("/timing-map", async (req, res) => {
  const body = GenerateTimingMapBody.parse(req.body);

  const rows = await db
    .select()
    .from(productsTable)
    .where(inArray(productsTable.id, body.productIds));

  if (rows.length === 0) {
    res.status(400).json({ error: "No valid product ids were provided." });
    return;
  }

  const selected = rows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    badge: p.badge,
    popular: p.popular === "yes",
    ingredients: p.ingredients,
  }));

  const result = generateTimingMap(selected, body.anchors);
  const data = GenerateTimingMapResponse.parse(result);
  res.json(data);
});

export default router;
