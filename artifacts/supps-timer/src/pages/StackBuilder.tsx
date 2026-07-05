import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Search, Plus, X, ChevronRight, Beaker, Camera, Loader2 } from "lucide-react";
import { useWizard } from "@/lib/WizardContext";
import {
  useListProducts,
  useListPopularProducts,
  useScanProductLabel,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const MAX_SCAN_DIMENSION = 1280;

type DecodedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  close?: () => void;
};

async function decodeImageFile(file: File): Promise<DecodedImage> {
  // Prefer createImageBitmap: it decodes a wider range of formats (including
  // iPhone HEIC on browsers that support it), applies EXIF orientation, and
  // only resolves once the image is fully decoded -- which avoids the mobile
  // race where an <img> fires onload with width/height still 0.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
          close: () => bitmap.close(),
        };
      }
      bitmap.close();
    } catch {
      // Fall through to the <img> path below.
    }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the photo file."));
    reader.readAsDataURL(file);
  });

  const img = new Image();
  const unsupported = new Error(
    "Could not read this photo format. Try a JPEG or PNG, or set your camera to 'Most Compatible'.",
  );
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(unsupported);
    img.src = dataUrl;
  });
  // decode() (where supported) guarantees pixels are ready before we read
  // dimensions, closing the last decode-race gap on older mobile browsers.
  if (typeof img.decode === "function") {
    try {
      await img.decode();
    } catch {
      throw unsupported;
    }
  }

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  return {
    width,
    height,
    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
  };
}

async function compressImageToBase64(
  file: File,
): Promise<{ base64: string; mimeType: string }> {
  const src = await decodeImageFile(file);
  try {
    if (!src.width || !src.height) {
      throw new Error("Photo has no readable dimensions.");
    }
    const scale = Math.min(
      1,
      MAX_SCAN_DIMENSION / Math.max(src.width, src.height),
    );
    const width = Math.max(1, Math.round(src.width * scale));
    const height = Math.max(1, Math.round(src.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported on this device.");
    src.draw(ctx, width, height);

    const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = compressedDataUrl.split(",")[1] ?? "";
    if (!base64) throw new Error("Could not encode the photo.");
    return { base64, mimeType: "image/jpeg" };
  } finally {
    src.close?.();
  }
}

export default function StackBuilder() {
  const [, setLocation] = useLocation();
  const { state, addProduct, removeProduct } = useWizard();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    }
  );

  const scanLabel = useScanProductLabel({
    mutation: {
      onSuccess: (product) => {
        addProduct(product);
        toast({
          title: "Label scanned",
          description: `Added "${product.name}" with ${product.ingredients.length} ingredient${product.ingredients.length !== 1 ? "s" : ""} to your stack.`,
        });
      },
      onError: (err: unknown) => {
        console.error("[scan] request failed", err);
        const message =
          err && typeof err === "object" && "error" in err
            ? String((err as { error?: unknown }).error)
            : "Could not read that label. Try a clearer, well-lit photo.";
        toast({ variant: "destructive", title: "Scan failed", description: message });
      },
    },
  });

  const handleScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    console.info("[scan] photo selected", {
      name: file.name,
      type: file.type || "(none)",
      sizeKB: Math.round(file.size / 1024),
    });

    try {
      const { base64, mimeType } = await compressImageToBase64(file);
      console.info("[scan] compressed, sending", {
        base64Chars: base64.length,
        approxKB: Math.round((base64.length * 3) / 4 / 1024),
        mimeType,
      });
      scanLabel.mutate({ data: { imageBase64: base64, mimeType } });
    } catch (err) {
      console.error("[scan] failed to process photo", err);
      toast({
        variant: "destructive",
        title: "Scan failed",
        description:
          err instanceof Error
            ? err.message
            : "Could not process that photo. Try again.",
      });
    }
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
          Select the supplements you take, or scan a label to add one instantly. We will decompose blends and
          schedule them optimally.
        </p>
      </div>

      <div className="space-y-4">
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
            variant="outline"
            className="shrink-0"
            disabled={scanLabel.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {scanLabel.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
            ) : (
              <Camera className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">{scanLabel.isPending ? "Scanning..." : "Scan a label"}</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleScanFile}
          />
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Camera className="h-3.5 w-3.5 shrink-0" />
          Got a blend or multi-ingredient product? Tap the camera to take a label pic and we will add it for you.
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
