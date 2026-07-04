import { pgTable, text, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ingredientSchema = z.object({
  name: z.string(),
  mgAmount: z.number(),
  mineralClass: z.enum(["iron", "zinc", "magnesium", "calcium"]).nullable().optional(),
  fatSoluble: z.boolean().nullable().optional(),
  timingWindow: z
    .enum(["empty_stomach", "with_meal", "evening", "flexible"])
    .nullable()
    .optional(),
  avoidNearMedicationHours: z.number().nullable().optional(),
  pairWith: z.string().nullable().optional(),
});

export type StoredIngredient = z.infer<typeof ingredientSchema>;

export const productsTable = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["standalone", "blend"] }).notNull(),
  badge: text("badge"),
  ingredients: jsonb("ingredients").$type<StoredIngredient[]>().notNull(),
  popular: text("popular").notNull().default("no"),
});

export const insertProductSchema = createInsertSchema(productsTable);
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type ProductRow = typeof productsTable.$inferSelect;
