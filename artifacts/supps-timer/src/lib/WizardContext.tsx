import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { Anchors, Product } from "@workspace/api-client-react";

interface WizardState {
  productIds: string[];
  productsById: Record<string, Product>;
  anchors: Anchors;
}

// Persist wizard state for the tab so it survives a full page reload, most
// importantly the Stripe Checkout redirect round-trip. Without this, returning
// from checkout resets the in-memory stack to empty, which bounces the map page
// back to /app before the checkout session can be verified and Pro granted.
const WIZARD_STORAGE_KEY = "sm_wizard";

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
  medications: [],
  coffeeTime: "",
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

function loadInitialState(): WizardState {
  const empty: WizardState = {
    productIds: [],
    productsById: {},
    anchors: defaultAnchors,
  };
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    return {
      productIds: Array.isArray(parsed.productIds) ? parsed.productIds : [],
      productsById:
        parsed.productsById && typeof parsed.productsById === "object"
          ? parsed.productsById
          : {},
      anchors: { ...defaultAnchors, ...(parsed.anchors ?? {}) },
    };
  } catch {
    return empty;
  }
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(loadInitialState);

  useEffect(() => {
    try {
      sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage unavailable (private mode / quota) — non-fatal.
    }
  }, [state]);

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
