import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Plus,
  Trash2,
  AlertTriangle,
  Info,
  Camera,
  SkipForward,
  Loader2,
  Pencil,
} from "lucide-react";
import { useWizard } from "@/lib/WizardContext";
import {
  useConfirmShelf,
  useContributeVerifiedProduct,
  useRematchShelfRow,
  useScanProductLabelPreview,
  useSearchWebIngredients,
} from "@workspace/api-client-react";
import type { ShelfDetectedProduct } from "@workspace/api-client-react";
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
  applyMatchMetadataToReviewRow,
  clearShelfScanSession,
  createManualReviewRow,
  ingredientSourceLabel,
  isUserConfirmedIngredientSource,
  loadShelfScanSession,
  mapDetectedIngredientSource,
  shelfDetectedToReviewRow,
  SHELF_SCAN_MAX_PRODUCTS,
  shouldAutoWebEnrich,
  shouldShowIngredientVerificationActions,
  type IngredientSource,
  type ShelfReviewRow,
} from "@/lib/shelfScanSession";

interface PendingIngredientConfirmation {
  rowId: string;
  source: Extract<IngredientSource, "label_scan" | "web_search" | "matched" | "verified" | "manual">;
  productName: string;
  sourceLabel: string;
  sourceUrl: string | null;
  ingredients: { name: string; mgAmount: number }[];
}

interface ManualIngredientDraft {
  name: string;
  mgAmount: string;
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

function confirmationSourceLabel(source: PendingIngredientConfirmation["source"]): string {
  switch (source) {
    case "verified":
      return "Verified product data";
    case "matched":
      return "Supplement library match";
    case "label_scan":
      return "Supplement Facts label scan";
    case "web_search":
      return "Trusted web source";
    case "manual":
      return "Manual entry";
    default:
      return "Review";
  }
}

export default function ShelfScanReview() {
  const [, setLocation] = useLocation();
  const { addProduct } = useWizard();
  const { toast } = useToast();
  const [rows, setRows] = useState<ShelfReviewRow[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [activeScanRowId, setActiveScanRowId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingIngredientConfirmation | null>(null);
  const [manualDialogRowId, setManualDialogRowId] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualIngredientDraft[]>([
    { name: "", mgAmount: "" },
  ]);
  const labelFileInputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef(rows);
  const rematchTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const autoWebStartedRef = useRef<Set<string>>(new Set());

  rowsRef.current = rows;

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

  const rematchShelf = useRematchShelfRow(requestOptions);
  const searchWeb = useSearchWebIngredients(requestOptions);
  const scanLabelPreview = useScanProductLabelPreview(requestOptions);
  const contributeVerified = useContributeVerifiedProduct(requestOptions);

  const updateRow = useCallback((id: string, patch: Partial<ShelfReviewRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const openIngredientConfirmation = useCallback(
    (
      rowId: string,
      source: PendingIngredientConfirmation["source"],
      productName: string,
      sourceLabel: string,
      sourceUrl: string | null,
      ingredients: { name: string; mgAmount: number }[],
    ) => {
      setPendingConfirmation({
        rowId,
        source,
        productName,
        sourceLabel,
        sourceUrl,
        ingredients,
      });
    },
    [],
  );

  const handleRematchResult = useCallback(
    (rowId: string, result: ShelfDetectedProduct) => {
      setRows((prev) => {
        const row = prev.find((item) => item.id === rowId);
        if (!row) return prev;

        const metadata = applyMatchMetadataToReviewRow(row, result);
        const source = mapDetectedIngredientSource(result);

        if (result.hasIngredientDetails && result.ingredients.length > 0 && source !== "none") {
          queueMicrotask(() => {
            openIngredientConfirmation(
              rowId,
              source,
              result.productName,
              source === "verified" ? "Verified product data" : "Supplement library match",
              result.enrichment?.sourceUrl ?? null,
              result.ingredients,
            );
          });

          return prev.map((item) =>
            item.id === rowId
              ? {
                  ...metadata,
                  hasIngredientDetails: false,
                  ingredients: [],
                  ingredientSource: "none",
                }
              : item,
          );
        }

        return prev.map((item) =>
          item.id === rowId
            ? {
                ...metadata,
                hasIngredientDetails: false,
                ingredients: [],
                ingredientSource: "none",
              }
            : item,
        );
      });
    },
    [openIngredientConfirmation],
  );

  const runRematch = useCallback(
    async (rowId: string, productName: string) => {
      const row = rowsRef.current.find((item) => item.id === rowId);
      const trimmed = productName.trim();
      if (!row || trimmed.length === 0) return;

      updateRow(rowId, { rematchPending: true });
      try {
        const result = await rematchShelf.mutateAsync({
          data: {
            productName: trimmed,
            brand: row.brand,
            rawOcrLines: row.rawOcrLines,
            detectionConfidence: row.confidence ?? undefined,
          },
        });
        handleRematchResult(rowId, result);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Could not rematch product",
          description: extractApiErrorMessage(err, "Try editing the name again."),
        });
      } finally {
        updateRow(rowId, { rematchPending: false });
      }
    },
    [handleRematchResult, rematchShelf, toast, updateRow],
  );

  const scheduleRematch = useCallback(
    (row: ShelfReviewRow, productName: string) => {
      const existing = rematchTimersRef.current.get(row.id);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        void runRematch(row.id, productName);
      }, 600);
      rematchTimersRef.current.set(row.id, timer);
    },
    [runRematch],
  );

  const shouldRematchOnNameEdit = useCallback((row: ShelfReviewRow) => {
    if (row.ingredientsSkipped) return false;
    if (isUserConfirmedIngredientSource(row.ingredientSource)) return false;
    return !row.hasIngredientDetails || row.needsReview;
  }, []);

  const attemptAutoWebEnrichment = useCallback(
    async (row: ShelfReviewRow) => {
      updateRow(row.id, { autoWebSearchAttempted: true, webEnrichmentState: "searching" });

      try {
        const result = await searchWeb.mutateAsync({
          data: {
            brand: row.brand,
            productName: row.productName,
            verifiedProductId: row.verifiedProductId,
          },
        });

        if (result.ingredients.length > 0) {
          updateRow(row.id, { webEnrichmentState: "idle" });
          openIngredientConfirmation(
            row.id,
            "web_search",
            row.productName,
            result.sourceLabel,
            result.sourceUrl ?? null,
            result.ingredients,
          );
        } else {
          updateRow(row.id, { webEnrichmentState: "not_found" });
        }
      } catch (err) {
        updateRow(row.id, { webEnrichmentState: "not_found" });
        console.error("[shelf-review] auto web enrichment failed", err);
      }
    },
    [openIngredientConfirmation, searchWeb, updateRow],
  );

  useEffect(() => {
    const detected = loadShelfScanSession();
    if (!detected || detected.length === 0) {
      setLocation("/app");
      return;
    }
    setRows(detected.map(shelfDetectedToReviewRow));
    setInitialized(true);
  }, [setLocation]);

  useEffect(() => {
    if (!initialized) return;

    for (const row of rows) {
      if (!shouldAutoWebEnrich(row)) continue;
      if (autoWebStartedRef.current.has(row.id)) continue;
      autoWebStartedRef.current.add(row.id);
      void attemptAutoWebEnrichment(row);
    }
  }, [attemptAutoWebEnrichment, initialized, rows]);

  useEffect(() => {
    return () => {
      for (const timer of rematchTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const includedRows = rows.filter((row) => row.included && row.productName.trim().length > 0);

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

  const handleSkipIngredients = (row: ShelfReviewRow) => {
    updateRow(row.id, {
      ingredientsSkipped: true,
      ingredientsNeedVerification: false,
      ingredients: [],
      hasIngredientDetails: false,
      ingredientSource: "none",
      confirmedSourceLabel: null,
      confirmedSourceUrl: null,
      webEnrichmentState: "idle",
    });
  };

  const openManualIngredientsDialog = (row: ShelfReviewRow) => {
    setManualDialogRowId(row.id);
    setManualDraft([{ name: "", mgAmount: "" }]);
  };

  const handleManualIngredientsSubmit = () => {
    if (!manualDialogRowId) return;

    const row = rows.find((item) => item.id === manualDialogRowId);
    if (!row) return;

    const ingredients = manualDraft
      .map((item) => ({
        name: item.name.trim(),
        mgAmount: Number(item.mgAmount),
      }))
      .filter((item) => item.name.length > 0 && Number.isFinite(item.mgAmount) && item.mgAmount >= 0);

    if (ingredients.length === 0) {
      toast({
        variant: "destructive",
        title: "Add at least one ingredient",
        description: "Enter an ingredient name and amount in milligrams.",
      });
      return;
    }

    setManualDialogRowId(null);
    openIngredientConfirmation(
      row.id,
      "manual",
      row.productName,
      "Manual entry",
      null,
      ingredients,
    );
  };

  const handleLabelFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeScanRowId) return;

    const row = rows.find((item) => item.id === activeScanRowId);
    if (!row) return;

    try {
      const { base64, mimeType } = await compressImageToBase64(file);
      const result = await scanLabelPreview.mutateAsync({
        data: {
          imageBase64: base64,
          mimeType,
          productNameHint: row.productName,
        },
      });

      openIngredientConfirmation(
        row.id,
        "label_scan",
        result.productName,
        "Supplement Facts label scan",
        null,
        result.ingredients,
      );
    } catch (err) {
      console.error("[shelf-review] failed to process label photo", err);
      toast({
        variant: "destructive",
        title: "Label scan failed",
        description: extractApiErrorMessage(
          err,
          "Could not read that label. Try a clearer photo of the Supplement Facts panel.",
        ),
      });
    } finally {
      setActiveScanRowId(null);
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
      webEnrichmentState: "idle",
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
  };

  const showScanSupplementFacts = (row: ShelfReviewRow) =>
    (shouldShowIngredientVerificationActions(row) || row.needsReview) &&
    !row.hasIngredientDetails &&
    !row.ingredientsSkipped;

  const showWebSearchProgress = (row: ShelfReviewRow) =>
    row.webEnrichmentState === "searching" && shouldShowIngredientVerificationActions(row);

  const showFallbackIngredientActions = (row: ShelfReviewRow) =>
    shouldShowIngredientVerificationActions(row) &&
    row.webEnrichmentState === "not_found" &&
    !row.ingredientsSkipped &&
    !row.hasIngredientDetails;

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

  const isEnrichmentBusy =
    scanLabelPreview.isPending || searchWeb.isPending || rematchShelf.isPending;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <input
        ref={labelFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLabelFile}
      />

      <Dialog
        open={pendingConfirmation !== null}
        onOpenChange={(open) => {
          if (!open && pendingConfirmation) {
            if (pendingConfirmation.source === "web_search") {
              updateRow(pendingConfirmation.rowId, { webEnrichmentState: "not_found" });
            }
            setPendingConfirmation(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm ingredients</DialogTitle>
            <DialogDescription>
              Review the ingredient list before it is used for timing and interactions.
            </DialogDescription>
          </DialogHeader>
          {pendingConfirmation && (
            <div className="space-y-4">
              <div className="text-sm">
                <p className="font-medium">{pendingConfirmation.productName}</p>
                <p className="text-muted-foreground mt-1">
                  Source: {confirmationSourceLabel(pendingConfirmation.source)}
                </p>
                <p className="text-muted-foreground">{pendingConfirmation.sourceLabel}</p>
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

      <Dialog
        open={manualDialogRowId !== null}
        onOpenChange={(open) => !open && setManualDialogRowId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add ingredients manually</DialogTitle>
            <DialogDescription>
              Enter supplement facts ingredients and amounts in milligrams. You will confirm before
              they are used for timing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {manualDraft.map((item, index) => (
              <div key={index} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                <Input
                  value={item.name}
                  onChange={(e) =>
                    setManualDraft((prev) =>
                      prev.map((draft, draftIndex) =>
                        draftIndex === index ? { ...draft, name: e.target.value } : draft,
                      ),
                    )
                  }
                  placeholder="Ingredient name"
                />
                <Input
                  value={item.mgAmount}
                  onChange={(e) =>
                    setManualDraft((prev) =>
                      prev.map((draft, draftIndex) =>
                        draftIndex === index ? { ...draft, mgAmount: e.target.value } : draft,
                      ),
                    )
                  }
                  placeholder="mg"
                  inputMode="decimal"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={manualDraft.length === 1}
                  onClick={() =>
                    setManualDraft((prev) => prev.filter((_, draftIndex) => draftIndex !== index))
                  }
                  aria-label="Remove ingredient"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setManualDraft((prev) => [...prev, { name: "", mgAmount: "" }])}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add ingredient
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setManualDialogRowId(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleManualIngredientsSubmit}>
              Review ingredients
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
          Correct uncertain names, confirm matched ingredients, and let recognized products search
          trusted sources automatically before timing analysis uses them.
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
                  {((shouldShowIngredientVerificationActions(row) && row.webEnrichmentState !== "searching") ||
                    row.needsReview) &&
                    !row.hasIngredientDetails &&
                    !row.ingredientsSkipped && (
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
                  {row.hasIngredientDetails && isUserConfirmedIngredientSource(row.ingredientSource) && (
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
                  {!row.hasIngredientDetails &&
                    !shouldShowIngredientVerificationActions(row) &&
                    !row.needsReview &&
                    !row.ingredientsSkipped && (
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
                  <div className="flex gap-2 items-center">
                    <Input
                      value={row.productName}
                      onChange={(e) => {
                        const value = e.target.value;
                        updateRow(row.id, { productName: value });
                        if (shouldRematchOnNameEdit({ ...row, productName: value })) {
                          scheduleRematch({ ...row, productName: value }, value);
                        }
                      }}
                      placeholder="e.g. Vitamin C 1000 mg"
                      className="bg-background"
                    />
                    {row.rematchPending && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {row.needsReview && !row.hasIngredientDetails && (
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Pencil className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        Edit the product name to fix misreads. Matching updates automatically and
                        will ask you to confirm any ingredients found.
                      </span>
                    </p>
                  )}
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
                    {isUserConfirmedIngredientSource(row.ingredientSource)
                      ? `confirmed from ${row.confirmedSourceLabel?.toLowerCase() ?? "your review"}`
                      : ingredientSourceLabel(row.ingredientSource)}{" "}
                    for timing analysis.
                  </p>
                ) : showScanSupplementFacts(row) ||
                  showWebSearchProgress(row) ||
                  showFallbackIngredientActions(row) ||
                  row.needsReview ? (
                  <div className="space-y-3">
                    {showWebSearchProgress(row) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Looking for verified ingredients…
                      </p>
                    )}

                    {shouldShowIngredientVerificationActions(row) &&
                      row.webEnrichmentState === "not_found" && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>No trusted web supplement facts were found automatically.</span>
                        </p>
                      )}

                    {shouldShowIngredientVerificationActions(row) &&
                      row.webEnrichmentState === "idle" &&
                      row.autoWebSearchAttempted && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            We recognized this commercial product but do not have trusted supplement
                            facts yet.
                          </span>
                        </p>
                      )}

                    <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                      {showScanSupplementFacts(row) && (
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
                      )}

                      {(showFallbackIngredientActions(row) || row.needsReview) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isEnrichmentBusy}
                          onClick={() => openManualIngredientsDialog(row)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Add ingredients manually
                        </Button>
                      )}

                      {(showScanSupplementFacts(row) ||
                        showFallbackIngredientActions(row) ||
                        row.needsReview) && (
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
                      )}
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
