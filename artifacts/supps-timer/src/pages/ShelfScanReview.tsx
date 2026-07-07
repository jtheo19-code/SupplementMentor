import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, AlertTriangle, Info, Camera, Globe, SkipForward, Loader2 } from "lucide-react";
import { useWizard } from "@/lib/WizardContext";
import {
  useConfirmShelf,
  useContributeVerifiedProduct,
  useScanProductLabelPreview,
  useSearchWebIngredients,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { compressImageToBase64 } from "@/lib/image-utils";
import {
  clearShelfScanSession,
  createManualReviewRow,
  loadShelfScanSession,
  shelfDetectedToReviewRow,
  SHELF_SCAN_MAX_PRODUCTS,
  shouldShowIngredientVerificationActions,
  type IngredientSource,
  type ShelfReviewRow,
} from "@/lib/shelfScanSession";

interface PendingIngredientConfirmation {
  rowId: string;
  source: Extract<IngredientSource, "label_scan" | "web_search">;
  productName: string;
  sourceLabel: string;
  sourceUrl: string | null;
  ingredients: { name: string; mgAmount: number }[];
}

function formatConfidence(confidence: number | null): string {
  if (confidence === null) return "Manual entry";
  return `${Math.round(confidence * 100)}%`;
}

function extractApiErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;

  const record = err as Record<string, unknown>;
  const data = record.data;
  if (data && typeof data === "object" && "error" in data) {
    const message = (data as { error?: unknown }).error;
    if (message != null && String(message).trim().length > 0) {
      return String(message);
    }
  }

  if ("error" in record) {
    const message = record.error;
    if (message != null && String(message).trim().length > 0) {
      return String(message);
    }
  }

  return fallback;
}

export default function ShelfScanReview() {
  const [, setLocation] = useLocation();
  const { addProduct } = useWizard();
  const { toast } = useToast();
  const [rows, setRows] = useState<ShelfReviewRow[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [activeScanRowId, setActiveScanRowId] = useState<string | null>(null);
  const [activeWebSearchRowId, setActiveWebSearchRowId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingIngredientConfirmation | null>(null);
  const labelFileInputRef = useRef<HTMLInputElement>(null);

  const proSessionId = localStorage.getItem("sm_session_id");
  const requestOptions = proSessionId
    ? { request: { headers: { "x-sm-session-id": proSessionId } } }
    : {};

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
        toast({
          variant: "destructive",
          title: "Could not add to stack",
          description: extractApiErrorMessage(err, "Could not save those products. Try again."),
        });
      },
    },
  });

  const scanLabelPreview = useScanProductLabelPreview({
    ...requestOptions,
    mutation: {
      onSuccess: (result) => {
        if (!activeScanRowId) return;
        const row = rows.find((item) => item.id === activeScanRowId);
        if (!row) return;
        setPendingConfirmation({
          rowId: row.id,
          source: "label_scan",
          productName: result.productName,
          sourceLabel: "Supplement Facts label scan",
          sourceUrl: null,
          ingredients: result.ingredients,
        });
      },
      onError: (err: unknown) => {
        toast({
          variant: "destructive",
          title: "Label scan failed",
          description: extractApiErrorMessage(
            err,
            "Could not read that label. Try a clearer photo of the Supplement Facts panel.",
          ),
        });
      },
    },
  });

  const searchWeb = useSearchWebIngredients({
    ...requestOptions,
    mutation: {
      onSuccess: (result) => {
        if (!activeWebSearchRowId) return;
        const row = rows.find((item) => item.id === activeWebSearchRowId);
        if (!row) return;

        if (result.ingredients.length === 0) {
          toast({
            title: "No web ingredients found",
            description: result.message,
          });
          return;
        }

        setPendingConfirmation({
          rowId: row.id,
          source: "web_search",
          productName: row.productName,
          sourceLabel: result.sourceLabel,
          sourceUrl: result.sourceUrl ?? null,
          ingredients: result.ingredients,
        });
      },
      onError: (err: unknown) => {
        toast({
          variant: "destructive",
          title: "Web search failed",
          description: extractApiErrorMessage(err, "Could not search web sources for that product."),
        });
      },
    },
  });

  const contributeVerified = useContributeVerifiedProduct({
    ...requestOptions,
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

  const handleScanSupplementFacts = (row: ShelfReviewRow) => {
    setActiveScanRowId(row.id);
    labelFileInputRef.current?.click();
  };

  const handleSearchWeb = (row: ShelfReviewRow) => {
    setActiveWebSearchRowId(row.id);
    searchWeb.mutate({
      data: {
        brand: row.brand,
        productName: row.productName,
        verifiedProductId: row.verifiedProductId,
      },
    });
  };

  const handleSkipIngredients = (row: ShelfReviewRow) => {
    updateRow(row.id, {
      ingredientsSkipped: true,
      ingredientsNeedVerification: false,
      ingredients: [],
      hasIngredientDetails: false,
      ingredientSource: "none",
      confirmedSourceLabel: null,
      confirmedSourceUrl: null,
    });
  };

  const handleLabelFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeScanRowId) return;

    const row = rows.find((item) => item.id === activeScanRowId);
    if (!row) return;

    try {
      const { base64, mimeType } = await compressImageToBase64(file);
      scanLabelPreview.mutate({
        data: {
          imageBase64: base64,
          mimeType,
          productNameHint: row.productName,
        },
      });
    } catch (err) {
      console.error("[shelf-review] failed to process label photo", err);
      toast({
        variant: "destructive",
        title: "Could not process photo",
        description: err instanceof Error ? err.message : "Try another photo.",
      });
    }
  };

  const handleConfirmIngredients = async () => {
    if (!pendingConfirmation) return;
    const row = rows.find((item) => item.id === pendingConfirmation.rowId);
    if (!row) return;

    updateRow(row.id, {
      productName: pendingConfirmation.productName || row.productName,
      ingredients: pendingConfirmation.ingredients,
      hasIngredientDetails: true,
      needsReview: false,
      ingredientsNeedVerification: false,
      ingredientsSkipped: false,
      ingredientSource: pendingConfirmation.source,
      confirmedSourceLabel: pendingConfirmation.sourceLabel,
      confirmedSourceUrl: pendingConfirmation.sourceUrl,
    });

    if (pendingConfirmation.source === "label_scan" && row.verifiedProductId) {
      try {
        await contributeVerified.mutateAsync({
          data: {
            verifiedProductId: row.verifiedProductId,
            productName: pendingConfirmation.productName || row.productName,
            brand: row.brand,
            ingredients: pendingConfirmation.ingredients,
          },
        });
      } catch (err) {
        console.error("[shelf-review] contribution failed", err);
      }
    }

    toast({
      title: "Ingredients confirmed",
      description: `${pendingConfirmation.ingredients.length} ingredient${pendingConfirmation.ingredients.length !== 1 ? "s" : ""} will be used for timing on this product.`,
    });
    setPendingConfirmation(null);
    setActiveScanRowId(null);
  };

  const showEnrichmentActions = (row: ShelfReviewRow) =>
    shouldShowIngredientVerificationActions(row);

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

  const isEnrichmentBusy = scanLabelPreview.isPending || searchWeb.isPending;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <input
        ref={labelFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLabelFile}
      />

      <Dialog open={pendingConfirmation !== null} onOpenChange={(open) => !open && setPendingConfirmation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm ingredients</DialogTitle>
            <DialogDescription>
              Review the extracted ingredient list before it is used for timing and interactions.
            </DialogDescription>
          </DialogHeader>
          {pendingConfirmation && (
            <div className="space-y-4">
              <div className="text-sm">
                <p className="font-medium">{pendingConfirmation.productName}</p>
                <p className="text-muted-foreground mt-1">Source: {pendingConfirmation.sourceLabel}</p>
                {pendingConfirmation.sourceUrl && (
                  <a
                    href={pendingConfirmation.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline break-all"
                  >
                    {pendingConfirmation.sourceUrl}
                  </a>
                )}
              </div>
              <ul className="rounded-md border divide-y max-h-48 overflow-y-auto">
                {pendingConfirmation.ingredients.map((ingredient) => (
                  <li key={ingredient.name} className="px-3 py-2 text-sm flex justify-between gap-3">
                    <span>{ingredient.name}</span>
                    <span className="font-mono text-muted-foreground">{ingredient.mgAmount} mg</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPendingConfirmation(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmIngredients}>
              Use these ingredients
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          Confirm what we found on your shelf. Recognized commercial products can have ingredients
          verified by label scan or trusted web search before timing analysis uses them.
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
                  {row.recognizedProduct && !row.ingredientsSkipped && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono border-sky-600 text-sky-700 bg-sky-500/10"
                    >
                      Recognized product
                    </Badge>
                  )}
                  {showEnrichmentActions(row) && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono border-violet-600 text-violet-700 bg-violet-500/10"
                    >
                      Ingredients need verification
                    </Badge>
                  )}
                  {row.hasIngredientDetails &&
                    row.ingredientSource === "verified" &&
                    !row.needsReview && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono border-emerald-600 text-emerald-700 bg-emerald-500/10"
                    >
                      Verified ingredients
                    </Badge>
                  )}
                  {row.hasIngredientDetails && row.ingredientSource === "matched" && !row.needsReview && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono border-teal-600 text-teal-700 bg-teal-500/10"
                    >
                      Matched ingredients
                    </Badge>
                  )}
                  {row.hasIngredientDetails &&
                    (row.ingredientSource === "label_scan" || row.ingredientSource === "web_search") && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono border-blue-600 text-blue-700 bg-blue-500/10"
                    >
                      Confirmed ingredients
                    </Badge>
                  )}
                  {row.ingredientsSkipped && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono border-muted-foreground/40"
                    >
                      Name only
                    </Badge>
                  )}
                  {!row.hasIngredientDetails && !showEnrichmentActions(row) && !row.ingredientsSkipped && (
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

                {row.hasIngredientDetails && !row.needsReview ? (
                  <p className="text-xs text-muted-foreground">
                    {row.ingredients.length} ingredient
                    {row.ingredients.length !== 1 ? "s" : ""}{" "}
                    {row.ingredientSource === "verified"
                      ? "from verified product data"
                      : row.ingredientSource === "matched"
                        ? "matched from supplement library"
                        : `confirmed from ${row.confirmedSourceLabel?.toLowerCase() ?? "your review"}`}{" "}
                    for timing analysis.
                  </p>
                ) : showEnrichmentActions(row) ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        We recognized this commercial product but do not have trusted supplement facts
                        yet. Verify ingredients before they are used for timing or interactions.
                      </span>
                    </p>
                    <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isEnrichmentBusy}
                        onClick={() => handleScanSupplementFacts(row)}
                      >
                        {scanLabelPreview.isPending && activeScanRowId === row.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4 mr-2" />
                        )}
                        Scan Supplement Facts
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isEnrichmentBusy}
                        onClick={() => handleSearchWeb(row)}
                      >
                        {searchWeb.isPending && activeWebSearchRowId === row.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Globe className="h-4 w-4 mr-2" />
                        )}
                        Search web for ingredients
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isEnrichmentBusy}
                        onClick={() => handleSkipIngredients(row)}
                      >
                        <SkipForward className="h-4 w-4 mr-2" />
                        Skip for now
                      </Button>
                    </div>
                  </div>
                ) : row.ingredientsSkipped ? (
                  <p className="text-xs text-muted-foreground">
                    Added as name only. Ingredient-level timing and interactions are not available.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      Ingredient-level interaction analysis is not available for this product until
                      ingredient data is added or confirmed.
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
