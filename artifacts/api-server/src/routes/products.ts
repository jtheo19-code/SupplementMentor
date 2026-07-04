import { Router, type IRouter } from "express";
import { ListProductsQueryParams, ListProductsResponse, ListPopularProductsResponse } from "@workspace/api-zod";
import { SEED_PRODUCTS } from "../lib/seedProducts";

const router: IRouter = Router();

router.get("/products", (req, res) => {
  const { search } = ListProductsQueryParams.parse(req.query);
  const term = search?.trim().toLowerCase();

  const results = SEED_PRODUCTS.filter((p) =>
    term
      ? p.name.toLowerCase().includes(term) ||
        p.ingredients.some((i) => i.name.toLowerCase().includes(term))
      : true,
  ).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    badge: p.badge,
    ingredients: p.ingredients.map((i) => ({ name: i.name, mgAmount: i.mgAmount })),
  }));

  const data = ListProductsResponse.parse(results);
  res.json(data);
});

router.get("/products/popular", (_req, res) => {
  const results = SEED_PRODUCTS.filter((p) => p.popular).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    badge: p.badge,
    ingredients: p.ingredients.map((i) => ({ name: i.name, mgAmount: i.mgAmount })),
  }));

  const data = ListPopularProductsResponse.parse(results);
  res.json(data);
});

export default router;
