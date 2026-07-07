import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Search, Plus, X, ChevronRight, Beaker, Camera, Loader2, LayoutGrid } from "lucide-react";
import { useWizard } from "@/lib/WizardContext";
import {
  useListProducts,
  useListPopularProducts,
  useScanProductLabel,
  useScanShelf,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { compressImageToBase64 } from "@/lib/image-utils";
import {
  clearVerifyIngredientsRequest,
  loadVerifyIngredientsRequest,
  saveShelfScanSession,
  type VerifyIngredientsRequest,
} from "@/lib/shelfScanSession";

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

export default function StackBuilder() {
  const [, setLocation] = useLocation();
  const { state, addProduct, removeProduct } = useWizard();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const labelFileInputRef = useRef<HTMLInputElement>(null);
  const shelfFileInputRef = useRef<HTMLInputElement>(null);
  const [verifyRequest, setVerifyRequest] = useState<VerifyIngredientsRequest | null>(null);

  useEffect(() => {
    setVerifyRequest(loadVerifyIngredientsRequest());
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: popularProducts, isLoading: isPopularLoading } = useListPopularProducts();
  const { data: searchResults, isLoading: isSearchLoading } = useListProducts(
    { search: debouncedSearch },
    {
      query: {
        enabled: debouncedSearch.length > 1,
        queryKey: getListProductsQueryKey({ search: debouncedSearch }),
      },
    },
  );

  const proSessionId = localStorage.getItem("sm_session_id");
  const scanRequestOptions = proSessionId
    ? { request: { headers: { "x-sm-session-id": proSessionId } } }
    : {};

  const scanLabel = useScanProductLabel({
    ...scanRequestOptions,
    mutation: {
      onSuccess: (product) => {
        const wasVerifying = verifyRequest !== null;
        if (wasVerifying) {
          clearVerifyIngredientsRequest();
          setVerifyRequest(null);
        }
        addProduct(product);
        toast({
          title: wasVerifying ? "Ingredients submitted for review" : "Label scanned",
          description: wasVerifying
            ? `Submitted Supplement Facts for "${product.name}". They are not globally trusted until approved.`
            : `Added "${product.name}" with ${product.ingredients.length} ingredient${product.ingredients.length !== 1 ? "s" : ""} to your stack.`,
        });
      },
      onError: (err: unknown) => {
        console.error("[scan] request failed", err);
        toast({
          variant: "destructive",
          title: "Scan failed",
          description: extractApiErrorMessage(
            err,
            "Could not read that label. Try a clearer, well-lit photo.",
          ),
        });
      },
    },
  });

  const scanShelf = useScanShelf({
    ...scanRequestOptions,
    mutation: {
      onSuccess: (result) => {
        saveShelfScanSession(result.products);
        setLocation("/app/scan-shelf/review");
      },
      onError: (err: unknown) => {
        console.error("[shelf-scan] request failed", err);
        toast({
          variant: "destructive",
          title: "Shelf scan failed",
          description: extractApiErrorMessage(
            err,
            "Could not read that shelf photo. Try a clearer, well-lit photo.",
          ),
        });
      },
    },
  });

  const isScanning = scanLabel.isPending || scanShelf.isPending;

  const processScanFile = async (
    file: File,
    onCompressed: (payload: { base64: string; mimeType: string }) => void,
  ) => {
    try {
      const { base64, mimeType } = await compressImageToBase64(file);
      onCompressed({ base64, mimeType });
    } catch (err) {
      console.error("[scan] failed to process photo", err);
      toast({
        variant: "destructive",
        title: "Scan failed",
        description:
          err instanceof Error ? err.message : "Could not process that photo. Try again.",
      });
    }
  };

  const handleLabelScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processScanFile(file, ({ base64, mimeType }) => {
      scanLabel.mutate({
        data: {
          imageBase64: base64,
          mimeType,
          verifiedProductId: verifyRequest?.verifiedProductId ?? undefined,
        },
      });
    });
  };

  const handleShelfScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    console.info("[shelf-scan] original file", {
      fileBytes: file.size,
      fileType: file.type,
      fileName: file.name,
    });
    await processScanFile(file, ({ base64, mimeType }) => {
      console.info("[shelf-scan] processed payload", {
        base64Chars: base64.length,
        mimeType,
        processedBytesEstimate: Math.floor((base64.length * 3) / 4),
      });
      scanShelf.mutate({ data: { imageBase64: base64, mimeType } });
    });
  };

  const displayProducts = debouncedSearch.length > 1 ? searchResults : popularProducts;
  const isLoading = debouncedSearch.length > 1 ? isSearchLoading : isPopularLoading;

  const selectedProducts = state.productIds
    .map((id) => state.productsById[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const handleNext = () => {
    if (state.productIds.length > 0) {
      setLocation("/app/anchors");
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Build your stack</h2>
        <p className="text-muted-foreground mt-2">
          Search your supplements, scan a single label, or photograph your whole shelf to add
          multiple products at once.
        </p>
      </div>

      <div className="space-y-4">
        {verifyRequest && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium">Verify ingredients for shelf product</p>
            <p className="text-xs text-muted-foreground">
              Photograph the Supplement Facts panel for{" "}
              <span className="text-foreground font-medium">
                {verifyRequest.brand ? `${verifyRequest.brand} ` : ""}
                {verifyRequest.productName}
              </span>
              . Your scan will be submitted for review before it becomes globally trusted.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                clearVerifyIngredientsRequest();
                setVerifyRequest(null);
              }}
            >
              Cancel verification
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 bg-card border-muted font-medium text-base"
              placeholder="Search supplements..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="default"
            className="shrink-0"
            disabled={isScanning}
            onClick={() => shelfFileInputRef.current?.click()}
          >
            {scanShelf.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
            ) : (
              <LayoutGrid className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">
              {scanShelf.isPending ? "Scanning shelf..." : "Scan My Shelf"}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={isScanning}
            onClick={() => labelFileInputRef.current?.click()}
          >
            {scanLabel.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
            ) : (
              <Camera className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">
              {scanLabel.isPending
                ? "Scanning..."
                : verifyRequest
                  ? "Scan Supplement Facts"
                  : "Scan a label"}
            </span>
          </Button>
          <input
            ref={shelfFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleShelfScanFile}
          />
          <input
            ref={labelFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLabelScanFile}
          />
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
          Photograph up to 12 bottles on your shelf, review what we detect, then add them to your
          stack. Use &quot;Scan a label&quot; for a close-up of one product&apos;s Supplement Facts
          panel.
        </p>

        {selectedProducts.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-mono uppercase text-muted-foreground mb-2">Your stack</p>
            <div className="flex flex-wrap gap-2">
              {selectedProducts.map((product) => (
                <Badge key={product.id} variant="secondary" className="gap-1 pr-1 font-normal text-xs">
                  {product.name}
                  <button
                    type="button"
                    onClick={() => removeProduct(product.id)}
                    className="ml-1 rounded-full hover:bg-background/60 p-0.5"
                    aria-label={`Remove ${product.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <ScrollArea className="h-[400px] border rounded-md bg-card">
          <div className="p-4 space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))
            ) : displayProducts?.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>No supplements found</p>
              </div>
            ) : (
              displayProducts?.map((product) => {
                const isSelected = state.productIds.includes(product.id);
                return (
                  <div
                    key={product.id}
                    className={`p-3 rounded-md border flex items-start justify-between gap-3 transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{product.name}</span>
                        {product.type === "blend" && (
                          <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0">
                            Blend
                          </Badge>
                        )}
                        {product.badge && (
                          <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                            {product.badge}
                          </Badge>
                        )}
                      </div>
                      {product.type === "blend" && product.ingredients.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 font-mono flex items-start gap-1">
                          <Beaker className="h-3 w-3 shrink-0 mt-0.5" />
                          <span className="min-w-0 break-words">
                            {product.ingredients.map((i) => i.name).join(", ")}
                          </span>
                        </p>
                      )}
                    </div>
                    <Button
                      variant={isSelected ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => (isSelected ? removeProduct(product.id) : addProduct(product))}
                      className="shrink-0 h-8"
                    >
                      {isSelected ? (
                        <>
                          <X className="h-4 w-4 mr-1" /> Remove
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" /> Add
                        </>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm font-mono text-muted-foreground">
          {state.productIds.length} item{state.productIds.length !== 1 && "s"} selected
        </div>
        <Button onClick={handleNext} disabled={state.productIds.length === 0} className="w-full sm:w-auto">
          Set schedule anchors
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
