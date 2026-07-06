import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, AlertTriangle, Info } from "lucide-react";
import { useWizard } from "@/lib/WizardContext";
import { useConfirmShelf } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  clearShelfScanSession,
  createManualReviewRow,
  loadShelfScanSession,
  shelfDetectedToReviewRow,
  SHELF_SCAN_MAX_PRODUCTS,
  type ShelfReviewRow,
} from "@/lib/shelfScanSession";

function formatConfidence(confidence: number | null): string {
  if (confidence === null) return "Manual entry";
  return `${Math.round(confidence * 100)}%`;
}

export default function ShelfScanReview() {
  const [, setLocation] = useLocation();
  const { addProduct } = useWizard();
  const { toast } = useToast();
  const [rows, setRows] = useState<ShelfReviewRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  const confirmShelf = useConfirmShelf({
    mutation: {
      onSuccess: (result) => {
        for (const product of result.products) {
          addProduct(product);
        }
        clearShelfScanSession();
        toast({
          title: "Shelf added to stack",
          description: `Added ${result.products.length} product${result.products.length !== 1 ? "s" : ""} to your stack.`,
        });
        setLocation("/app");
      },
      onError: (err: unknown) => {
        const message =
          err && typeof err === "object" && "error" in err
            ? String((err as { error?: unknown }).error)
            : "Could not save those products. Try again.";
        toast({ variant: "destructive", title: "Could not add to stack", description: message });
      },
    },
  });

  useEffect(() => {
    const detected = loadShelfScanSession();
    if (!detected || detected.length === 0) {
      setLocation("/app");
      return;
    }
    setRows(detected.map(shelfDetectedToReviewRow));
    setInitialized(true);
  }, [setLocation]);

  const includedRows = rows.filter((row) => row.included && row.productName.trim().length > 0);

  const updateRow = (id: string, patch: Partial<ShelfReviewRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const addManualRow = () => {
    if (rows.length >= SHELF_SCAN_MAX_PRODUCTS) return;
    setRows((prev) => [...prev, createManualReviewRow()]);
  };

  const handleConfirm = () => {
    if (includedRows.length === 0) return;
    confirmShelf.mutate({
      data: {
        products: includedRows.map((row) => ({
          productName: row.productName.trim(),
          brand: row.brand,
          ingredients: row.hasIngredientDetails ? row.ingredients : [],
        })),
      },
    });
  };

  const handleCancel = () => {
    clearShelfScanSession();
    setLocation("/app");
  };

  if (!initialized) {
    return (
      <div className="py-24 text-center space-y-4 animate-in fade-in">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
          Loading review
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 text-muted-foreground"
          onClick={handleCancel}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to stack
        </Button>
        <h2 className="text-2xl font-semibold tracking-tight">Review detected supplements</h2>
        <p className="text-muted-foreground mt-2">
          Confirm what we found on your shelf. Edit names, remove mistakes, or add anything we missed.
          Timing maps use ingredient details when available.
        </p>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`rounded-md border p-4 space-y-3 ${
              row.included ? "bg-card" : "bg-muted/30 opacity-80"
            }`}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={row.included}
                onCheckedChange={(checked) =>
                  updateRow(row.id, { included: checked === true })
                }
                aria-label={`Include ${row.productName || "product"}`}
                className="mt-1"
              />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {row.needsReview && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono border-amber-500 text-amber-700 bg-amber-500/10"
                    >
                      Needs review
                    </Badge>
                  )}
                  {!row.hasIngredientDetails && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono border-muted-foreground/40"
                    >
                      Ingredients not detected
                    </Badge>
                  )}
                  <span className="text-xs font-mono text-muted-foreground">
                    {formatConfidence(row.confidence)}
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-muted-foreground">
                    Product name
                  </label>
                  <Input
                    value={row.productName}
                    onChange={(e) => updateRow(row.id, { productName: e.target.value })}
                    placeholder="e.g. Vitamin D3"
                    className="bg-background"
                  />
                </div>

                {row.brand && (
                  <p className="text-sm text-muted-foreground">
                    Brand: <span className="text-foreground">{row.brand}</span>
                  </p>
                )}

                {row.labelEvidence && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{row.labelEvidence}</span>
                  </p>
                )}

                {row.hasIngredientDetails ? (
                  <p className="text-xs text-muted-foreground">
                    {row.ingredients.length} ingredient
                    {row.ingredients.length !== 1 ? "s" : ""} detected for timing analysis.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      Ingredient-level interaction analysis is not available for this product until
                      ingredient data is added.
                    </span>
                  </p>
                )}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeRow(row.id)}
                aria-label="Remove product"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {rows.length < SHELF_SCAN_MAX_PRODUCTS && (
          <Button type="button" variant="outline" className="w-full" onClick={addManualRow}>
            <Plus className="h-4 w-4 mr-2" />
            Add missing product manually
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
        <Button type="button" variant="ghost" onClick={handleCancel} className="sm:w-auto">
          Cancel
        </Button>
        <Button
          type="button"
          className="sm:flex-1"
          disabled={includedRows.length === 0 || confirmShelf.isPending}
          onClick={handleConfirm}
        >
          {confirmShelf.isPending
            ? "Adding to stack..."
            : `Add ${includedRows.length} product${includedRows.length !== 1 ? "s" : ""} to stack`}
        </Button>
      </div>
    </div>
  );
}
