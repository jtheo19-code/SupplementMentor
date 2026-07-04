import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import timingRouter from "./timing";
import leadsRouter from "./leads";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(timingRouter);
router.use(leadsRouter);
router.use(billingRouter);

export default router;
