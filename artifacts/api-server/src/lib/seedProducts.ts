import type { StoredIngredient } from "@workspace/db";

export interface SeedProduct {
  id: string;
  name: string;
  type: "standalone" | "blend";
  badge: string | null;
  ingredients: StoredIngredient[];
  popular: boolean;
}
