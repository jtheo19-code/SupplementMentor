import { Router, type IRouter } from "express";
import { CreateLeadBody, CreateLeadResponse } from "@workspace/api-zod";
import { db, leadsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/leads", async (req, res) => {
  const body = CreateLeadBody.parse(req.body);

  const [row] = await db
    .insert(leadsTable)
    .values({ email: body.email })
    .returning();

  const data = CreateLeadResponse.parse({
    id: row!.id,
    email: row!.email,
    createdAt: row!.createdAt.toISOString(),
  });
  res.status(201).json(data);
});

export default router;
