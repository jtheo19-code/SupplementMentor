import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/WizardContext";
import { 
  useGenerateTimingMap, 
  useCreateLead, 
  useCreateCheckoutSession,
  useVerifyCheckoutSession
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Clock, Info, CheckCircle2, Lock, Zap, AlertTriangle, AlertOctagon } from "lucide-react";
import { timeTo12h } from "@/lib/time-utils";
import { useToast } from "@/hooks/use-toast";

export default function TimingMap() {
  const [, setLocation] = useLocation();
  const { state } = useWizard();
  
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  
  // Paywall State. Pro access is derived from a verified Stripe checkout
  // session id (set only after server-side verification), never a
  // client-settable flag. The server re-verifies this id on every gated request.
  const [proSessionId, setProSessionId] = useState<string | null>(() =>
    localStorage.getItem("sm_session_id"),
  );
  const isPro = proSessionId !== null;
  const [generations, setGenerations] = useState(() => parseInt(localStorage.getItem("sm_generations") || "0", 10));
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallEmail, setPaywallEmail] = useState("");

  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const sessionId = searchParams.get("session_id");

  // Verify Pro checkout
  const {
    data: verifyData,
    isSuccess: verifyResolved,
    isError: verifyError,
  } = useVerifyCheckoutSession(
    { sessionId: sessionId! },
    { query: { enabled: !!sessionId, queryKey: ['verify', sessionId!] } }
  );

  // Checkout succeeded and verified: grant Pro.
  useEffect(() => {
    if (verifyData?.active && sessionId) {
      localStorage.setItem("sm_session_id", sessionId);
      setProSessionId(sessionId);
      setShowPaywall(false);
      // Strip ?session_id
      window.history.replaceState({}, document.title, window.location.pathname);
      // If the stack was lost (e.g. new tab), send the now-Pro user back to
      // the builder instead of leaving them stuck on an empty map page.
      if (state.productIds.length === 0) {
        setLocation("/app");
      }
    }
  }, [verifyData, sessionId, state.productIds.length, setLocation]);

  // Checkout return that fails verification (expired/invalid session or a
  // transient error): don't leave the user stuck on a spinner. Clear the
  // params, inform them, and return to the builder.
  useEffect(() => {
    if (!sessionId || isPro) return;
    if (verifyError || (verifyResolved && !verifyData?.active)) {
      window.history.replaceState({}, document.title, window.location.pathname);
      toast({
        title: "Checkout not completed",
        description:
          "We couldn't confirm your subscription. If you were charged, contact support; otherwise please try again.",
        variant: "destructive",
      });
      setLocation("/app");
    }
  }, [sessionId, isPro, verifyError, verifyResolved, verifyData, setLocation, toast]);

  const { data: map, mutate: generateMap, isPending: isGenerating } = useGenerateTimingMap(
    proSessionId
      ? { request: { headers: { "x-sm-session-id": proSessionId } } }
      : undefined,
  );
  const { mutate: submitEmail, isPending: isSubmitting } = useCreateLead();
  const { mutate: createCheckout, isPending: isCheckingOut } = useCreateCheckoutSession();

  const generatedRef = useRef(false);

  useEffect(() => {
    // Returning from checkout but not yet verified as Pro: wait. The verify /
    // verify-failure effects own navigation here, so we neither paywall,
    // generate (and burn a free credit), nor bounce prematurely.
    if (sessionId && !isPro) {
      return;
    }

    if (state.productIds.length === 0) {
      setLocation("/app");
      return;
    }
    
    if (generatedRef.current || map || isGenerating || showPaywall) {
      return;
    }

    if (!isPro && generations >= 2) {
      setShowPaywall(true);
      return;
    }

    generatedRef.current = true;
    generateMap({ data: { productIds: state.productIds, anchors: state.anchors } });
    
    if (!isPro) {
      const nextCount = generations + 1;
      setGenerations(nextCount);
      localStorage.setItem("sm_generations", nextCount.toString());
    }
  }, [state, generateMap, map, isGenerating, isPro, generations, showPaywall, setLocation, sessionId]);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    submitEmail(
      { data: { email } },
      { onSuccess: () => setEmailSubmitted(true) }
    );
  };

  const handleUpgrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paywallEmail) return;
    createCheckout(
      { data: { email: paywallEmail } },
      {
        onSuccess: (res) => {
          if (res.url) {
            window.location.href = res.url;
          }
        }
      }
    );
  };

  if (showPaywall && !map) {
    return (
      <div className="py-12 animate-in fade-in zoom-in-95">
        <div className="max-w-md mx-auto bg-card border-2 border-primary rounded-2xl p-8 shadow-2xl text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-primary" />
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-serif mb-3">Generation Limit Reached</h2>
          <p className="text-muted-foreground mb-8">
            You've used your 2 free timing maps. Upgrade to Pro for unlimited generation, automated interaction auditing, and continuous updates.
          </p>
          <div className="bg-secondary/50 rounded-xl p-4 mb-8 text-left border">
            <ul className="space-y-3">
              <li className="flex items-center text-sm"><CheckCircle2 className="w-4 h-4 text-primary mr-2" /> Unlimited maps</li>
              <li className="flex items-center text-sm"><CheckCircle2 className="w-4 h-4 text-primary mr-2" /> Live routine auditing</li>
              <li className="flex items-center text-sm"><CheckCircle2 className="w-4 h-4 text-primary mr-2" /> Literature citations</li>
            </ul>
          </div>
          <form onSubmit={handleUpgrade} className="space-y-3">
            <Input 
              type="email" 
              placeholder="Enter email address" 
              required
              value={paywallEmail}
              onChange={(e) => setPaywallEmail(e.target.value)}
              className="h-12 text-center"
            />
            <Button type="submit" className="w-full h-12 text-base" disabled={isCheckingOut}>
              {isCheckingOut ? "Loading..." : "Upgrade to Pro - $10.99/mo"}
            </Button>
          </form>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/app")} className="text-muted-foreground">
              Return to start
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={() => setLocation("/app/anchors")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Edit anchors
        </Button>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-serif tracking-tight">Clinical Protocol</h2>
          {isPro && (
            <div className="text-[10px] uppercase font-mono font-bold px-2 py-1 bg-primary text-primary-foreground rounded">
              PRO
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-2">
          Evidence-based chronological sequence mapped to your biological anchors.
        </p>
      </div>

      {map.contraindications.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-serif flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" /> Interaction Warnings
          </h3>
          {map.contraindications.map((c, index) => {
            const isAvoid = c.severity === "avoid";
            return (
              <div
                key={index}
                className={`rounded-md border p-4 ${
                  isAvoid
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-amber-500/40 bg-amber-500/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  {isAvoid ? (
                    <AlertOctagon className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded ${
                          isAvoid
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-amber-500 text-white"
                        }`}
                      >
                        {isAvoid ? "Avoid" : "Caution"}
                      </span>
                      <span className="font-medium break-words">{c.effect}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1.5 break-words">
                      <span className="font-medium text-foreground">{c.substances.join(" + ")}</span>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed break-words">
                      {c.mechanism}
                    </p>
                    {c.source && (
                      <div className="mt-2.5 text-xs font-mono text-muted-foreground flex items-start gap-1.5">
                        <Info className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="min-w-0 break-words">{c.source}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground leading-relaxed">
            This is not medical advice. These flags are informational only. If an interaction is
            flagged, pause the supplement, not your prescribed medication, and seek clarity from your
            medical provider before making any change.
          </p>
        </div>
      )}

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
                  <div key={pIndex} className={`p-4 rounded-md border ${pill.isAnchor ? 'bg-secondary/50 border-border/50' : 'bg-card border-border shadow-sm'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium flex items-center gap-2 break-words">
                          {pill.isAnchor ? <Clock className="h-4 w-4 text-muted-foreground shrink-0" /> : null}
                          {pill.label}
                        </div>
                        {pill.reason && (
                          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed break-words">
                            {pill.reason}
                          </p>
                        )}
                        {pill.source && (
                          <div className="mt-2.5 text-xs font-mono text-muted-foreground flex items-start gap-1.5">
                            <Info className="h-3 w-3 shrink-0 mt-0.5" />
                            <span className="min-w-0 break-words">{pill.source}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {slot.note && (
                <p className="text-sm text-muted-foreground mt-3 italic bg-accent/50 p-3 rounded-md border border-accent">
                  Note: {slot.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {map.audit.length > 0 && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-serif mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> Stack Audit
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            We found overlapping ingredients across your selected products.
          </p>
          <div className="space-y-3">
            {map.audit.map((item, index) => (
              <div key={index} className="flex justify-between items-start gap-3 p-3 bg-secondary/30 rounded-md border text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium break-words">{item.ingredientName}</span>
                  <span className="text-muted-foreground ml-2 break-words">in {item.products.join(", ")}</span>
                </div>
                <span className="font-mono font-medium shrink-0">{item.totalMg}mg</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Protocol block (separate from paywall) */}
      <div className="border border-primary/20 bg-primary/5 p-6 sm:p-8 rounded-lg text-center mt-16 shadow-inner">
        {emailSubmitted ? (
          <div className="space-y-3 animate-in fade-in zoom-in-95">
            <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
            <h3 className="text-lg font-serif">Protocol Secured</h3>
            <p className="text-sm text-muted-foreground">
              We'll notify you if new clinical evidence updates the recommendations for your stack.
            </p>
          </div>
        ) : (
          <div className="max-w-md mx-auto space-y-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary mb-2">
              <Lock className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-serif">Save your protocol</h3>
            <p className="text-sm text-muted-foreground pb-2">
              Enter your email to save this map and be notified of evidence updates affecting these compounds.
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

function ShieldCheck(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}