import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/WizardContext";
import { useGenerateTimingMap, useCreateLead } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Clock, Info, CheckCircle2, Lock } from "lucide-react";
import { timeTo12h } from "@/lib/time-utils";

export default function TimingMap() {
  const [location, setLocation] = useLocation();
  const { state } = useWizard();
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  const { data: map, mutate: generateMap, isPending: isGenerating } = useGenerateTimingMap();
  const { mutate: submitEmail, isPending: isSubmitting } = useCreateLead();

  useEffect(() => {
    if (state.productIds.length === 0) {
      setLocation("/");
      return;
    }
    
    // Using a ref to prevent double execution in dev
    let mounted = true;
    if (mounted && !map && !isGenerating) {
      generateMap({ data: { productIds: state.productIds, anchors: state.anchors } });
    }
    return () => { mounted = false };
  }, [state, generateMap, map, setLocation, isGenerating]);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    submitEmail(
      { data: { email } },
      {
        onSuccess: () => setEmailSubmitted(true),
      }
    );
  };

  if (isGenerating || !map) {
    return (
      <div className="py-24 text-center space-y-4 animate-in fade-in">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
          Computing protocol
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={() => setLocation("/anchors")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Edit anchors
        </Button>
        <h2 className="text-2xl font-semibold tracking-tight">Your Protocol</h2>
        <p className="text-muted-foreground mt-2">
          Evidence-based chronological sequence based on your anchors.
        </p>
      </div>

      <div className="relative">
        <div className="absolute left-8 top-4 bottom-4 w-px bg-border hidden sm:block" />
        <div className="space-y-8">
          {map.slots.map((slot, index) => (
            <div key={index} className="relative sm:pl-16">
              <div className="hidden sm:flex absolute left-8 top-1.5 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-primary bg-background" />
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4 mb-3">
                <span className="text-lg font-mono tracking-tight font-medium text-foreground">
                  {timeTo12h(slot.time)}
                </span>
                <span className="text-sm text-muted-foreground uppercase tracking-wider font-mono">
                  {slot.context}
                </span>
              </div>
              
              <div className="space-y-3">
                {slot.pills.map((pill, pIndex) => (
                  <div key={pIndex} className={`p-4 rounded-md border ${pill.isAnchor ? 'bg-secondary/50 border-border/50' : 'bg-card border-border'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {pill.isAnchor ? <Clock className="h-4 w-4 text-muted-foreground" /> : null}
                          {pill.label}
                        </div>
                        {pill.reason && (
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                            {pill.reason}
                          </p>
                        )}
                        {pill.source && (
                          <div className="mt-2 text-xs font-mono text-muted-foreground flex items-center gap-1.5">
                            <Info className="h-3 w-3" />
                            {pill.source}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {slot.note && (
                <p className="text-sm text-muted-foreground mt-3 italic">
                  Note: {slot.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {map.audit.length > 0 && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-medium mb-4">Stack Audit</h3>
          <p className="text-sm text-muted-foreground mb-4">
            We found overlapping ingredients across your selected products.
          </p>
          <div className="space-y-3">
            {map.audit.map((item, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-secondary/30 rounded-md border text-sm">
                <div>
                  <span className="font-medium">{item.ingredientName}</span>
                  <span className="text-muted-foreground ml-2">in {item.products.join(", ")}</span>
                </div>
                <span className="font-mono font-medium">{item.totalMg}mg</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-primary/20 bg-primary/5 p-6 sm:p-8 rounded-lg text-center mt-16">
        {emailSubmitted ? (
          <div className="space-y-3 animate-in fade-in zoom-in-95">
            <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
            <h3 className="text-lg font-medium">Map secured</h3>
            <p className="text-sm text-muted-foreground">
              We'll notify you if new evidence updates the recommendations for your stack.
            </p>
          </div>
        ) : (
          <div className="max-w-md mx-auto space-y-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary mb-2">
              <Lock className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-medium">Save your protocol</h3>
            <p className="text-sm text-muted-foreground pb-2">
              Enter your email to get a permanent link and be notified of evidence updates affecting these compounds.
            </p>
            <form onSubmit={handleEmailSubmit} className="flex gap-2">
              <Input
                type="email"
                placeholder="Email address"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-card"
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
