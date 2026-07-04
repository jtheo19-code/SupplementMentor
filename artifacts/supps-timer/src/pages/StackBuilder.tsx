import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Search, Plus, X, ChevronRight, Beaker } from "lucide-react";
import { useWizard } from "@/lib/WizardContext";
import { useListProducts, useListPopularProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export default function StackBuilder() {
  const [, setLocation] = useLocation();
  const { state, addProduct, removeProduct } = useWizard();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

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

  const displayProducts = debouncedSearch.length > 1 ? searchResults : popularProducts;
  const isLoading = debouncedSearch.length > 1 ? isSearchLoading : isPopularLoading;

  const handleNext = () => {
    if (state.productIds.length > 0) {
      setLocation("/anchors");
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Build your stack</h2>
        <p className="text-muted-foreground mt-2">
          Select the supplements you take. We will decompose blends and schedule them optimally.
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 bg-card border-muted font-medium text-base"
            placeholder="Search compounds or blends..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

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
                    className={`p-3 rounded-md border flex items-start justify-between transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="pr-4">
                      <div className="flex items-center gap-2">
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
                        <p className="text-xs text-muted-foreground mt-1 font-mono flex items-center gap-1">
                          <Beaker className="h-3 w-3" />
                          {product.ingredients.map((i) => i.name).join(", ")}
                        </p>
                      )}
                    </div>
                    <Button
                      variant={isSelected ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => (isSelected ? removeProduct(product.id) : addProduct(product.id))}
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
