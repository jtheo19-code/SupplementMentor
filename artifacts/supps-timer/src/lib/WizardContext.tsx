import React, { createContext, useContext, useState, ReactNode } from "react";
import type { Anchors, Product } from "@workspace/api-client-react";

interface WizardState {
  productIds: string[];
  productsById: Record<string, Product>;
  anchors: Anchors;
}

interface WizardContextType {
  state: WizardState;
  addProduct: (product: Product) => void;
  removeProduct: (id: string) => void;
  setAnchors: (anchors: Anchors) => void;
}

const defaultAnchors: Anchors = {
  wake: "07:00",
  breakfast: "08:00",
  dinner: "19:00",
  bed: "23:00",
  medicationName: "",
  medicationTime: "",
  coffeeTime: "",
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>({
    productIds: [],
    productsById: {},
    anchors: defaultAnchors,
  });

  const addProduct = (product: Product) => {
    setState((prev) => ({
      ...prev,
      productIds: Array.from(new Set([...prev.productIds, product.id])),
      productsById: { ...prev.productsById, [product.id]: product },
    }));
  };

  const removeProduct = (id: string) => {
    setState((prev) => ({
      ...prev,
      productIds: prev.productIds.filter((pid) => pid !== id),
    }));
  };

  const setAnchors = (anchors: Anchors) => {
    setState((prev) => ({ ...prev, anchors }));
  };

  return (
    <WizardContext.Provider value={{ state, addProduct, removeProduct, setAnchors }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (context === undefined) {
    throw new Error("useWizard must be used within a WizardProvider");
  }
  return context;
}
