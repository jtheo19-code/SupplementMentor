import React, { useState } from "react";
import { Link } from "wouter";
import { useCreateCheckoutSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowRight, Beaker, Clock, ShieldCheck, Zap, HeartPulse, Activity, AlertTriangle } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import logoFull from "@/assets/logo-full.png";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const { mutate: createCheckout, isPending: isCheckingOut } = useCreateCheckoutSession();

  const handleProCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    createCheckout({ data: { email } }, {
      onSuccess: (res) => {
        if (res.url) {
          window.location.href = res.url;
        }
      }
    });
  };

  return (
    <div className="w-full">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-background/80 backdrop-blur-md z-50 border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <img src={logoIcon} alt="SupplementMentor" className="w-9 h-9" />
            <span className="tracking-tight text-lg text-foreground">Supplement<span className="bg-gradient-to-r from-primary to-[hsl(var(--brand-pink))] bg-clip-text text-transparent">Mentor</span></span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/app" className="text-sm font-medium hover:text-primary transition-colors hidden sm:block">
              Try Free
            </Link>
            <Link href="/app">
              <Button size="sm" className="font-medium">
                Launch App
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-28 pb-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
        <div className="max-w-6xl mx-auto flex flex-col items-center relative z-10 mb-10">
          <img src={logoFull} alt="SupplementMentor" className="h-40 sm:h-56 w-auto object-contain drop-shadow-xl" />
          <div className="mt-3 flex items-center justify-center w-64 max-w-full">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-primary/50" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary mx-2" />
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-primary/50" />
          </div>
          <p className="mt-3 text-base sm:text-lg text-black tracking-wide text-center">
            Your Personalized Supplement Timing Map.
          </p>
        </div>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="max-w-2xl relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-medium mb-6 uppercase tracking-wider">
              <Activity className="w-3.5 h-3.5" />
              Clinical Protocol Generator
            </div>
            <h1 className="text-5xl lg:text-7xl font-serif leading-[1.1] text-foreground mb-6">
              Stop guessing <br/>
              <span className="text-primary italic">when</span> to take your stack.
            </h1>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-xl">
              Most supplements interact. Combining the wrong compounds nullifies absorption,
              while precise chronological timing multiplies efficacy. We build the clinical timeline
              for your exact stack &mdash; and we go further: SupplementMentor cross-checks your entire
              stack against your prescription medications and flags any dangerous interactions before
              they reach your body, with the mechanism and the citation behind every warning.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/app">
                <Button size="lg" className="h-14 px-8 text-base w-full sm:w-auto shadow-xl shadow-primary/20">
                  Build Your Protocol <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground font-mono flex items-center justify-center sm:justify-start px-2">
                2 free maps • No signup required
              </p>
            </div>
          </div>
          
          {/* Abstract Hero Visual */}
          <div className="relative z-10 h-[400px] lg:h-[500px] w-full rounded-2xl bg-card border shadow-2xl p-6 flex flex-col justify-center">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] rounded-2xl pointer-events-none opacity-50" />
            
            <div className="space-y-4">
              {/* Mock Timeline item */}
              <div className="flex gap-4 p-4 rounded-xl bg-background border shadow-sm items-center opacity-70 transform -translate-x-4">
                <div className="font-mono text-sm font-medium w-16 text-muted-foreground">08:00</div>
                <div className="h-8 w-1 bg-primary/20 rounded-full" />
                <div className="flex-1">
                  <div className="font-medium text-sm">L-Theanine + Coffee</div>
                  <div className="text-xs text-muted-foreground font-mono mt-1">Synergistic pairing</div>
                </div>
              </div>
              
              <div className="flex gap-4 p-5 rounded-xl bg-primary border border-primary-border shadow-lg shadow-primary/20 items-center transform scale-105 z-10">
                <div className="font-mono text-sm font-medium w-16 text-primary-foreground/80">08:30</div>
                <div className="h-10 w-1.5 bg-primary-foreground/30 rounded-full" />
                <div className="flex-1">
                  <div className="font-medium text-base text-primary-foreground">Vitamin D3 + K2</div>
                  <div className="text-xs text-primary-foreground/70 font-mono mt-1">Take with fat source (Breakfast)</div>
                </div>
              </div>

              <div className="flex gap-4 p-4 rounded-xl bg-background border shadow-sm items-center opacity-70 transform translate-x-2">
                <div className="font-mono text-sm font-medium w-16 text-muted-foreground">14:00</div>
                <div className="h-8 w-1 bg-destructive/20 rounded-full" />
                <div className="flex-1">
                  <div className="font-medium text-sm">Iron (Empty Stomach)</div>
                  <div className="text-xs text-destructive font-mono mt-1">Separated from Calcium block</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6 bg-secondary/30 border-y">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-4">Precision scheduling, automated.</h2>
            <p className="text-muted-foreground text-lg">We cross-reference your stack against clinical pharmacokinetics to determine the optimal timing for every capsule.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card p-8 rounded-2xl border shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                <Beaker className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-medium mb-3">1. Build your stack</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Input your supplements, vitamins, and medications. Upload a label photo for blend products so we can identify ingredients more accurately.
              </p>
            </div>
            
            <div className="bg-card p-8 rounded-2xl border shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-medium mb-3">2. Anchor your day</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Provide your waking, meal, and sleep times. These biological anchors dictate absorption windows for fat-soluble and water-soluble compounds.
              </p>
            </div>
            
            <div className="bg-card p-8 rounded-2xl border shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-medium mb-3">3. Get your map</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Receive a precise chronological schedule. We separate antagonists (like Calcium and Iron) and pair synergists, backing every placement with clinical reasoning.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Science & Method */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-3xl md:text-4xl font-serif text-foreground">
              The invisible problem in your routine.
            </h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <ShieldCheck className="w-6 h-6 text-primary shrink-0 mt-1" />
                <div>
                  <h4 className="font-medium text-lg mb-1">Absorption Conflicts</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">Taking zinc with coffee? The tannins block absorption. Calcium with magnesium? They compete for the same receptors. The order matters more than the dose.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <HeartPulse className="w-6 h-6 text-primary shrink-0 mt-1" />
                <div>
                  <h4 className="font-medium text-lg mb-1">Unintentional Overdosing</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">Our audit engine identifies overlapping ingredients across your stack, preventing toxic accumulation of compounds like Vitamin B6 or Selenium.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <AlertTriangle className="w-6 h-6 text-primary shrink-0 mt-1" />
                <div>
                  <h4 className="font-medium text-lg mb-1">Dangerous Interactions</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">Add your prescriptions and we flag serious contraindications with your stack, from serotonin syndrome (SSRIs with 5-HTP or St. John's wort) to vitamin K undercutting warfarin, each with the mechanism and a citation.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-card border rounded-2xl p-8 shadow-sm">
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-6">Live Safety Check</h3>
            <div className="space-y-4">
              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-destructive text-destructive-foreground">Avoid</span>
                  <span className="font-medium text-destructive">Serotonin Syndrome Risk</span>
                </div>
                <p className="text-xs text-muted-foreground">Detected 5-HTP alongside Lexapro (SSRI). Combining serotonergic compounds can raise serotonin to dangerous levels. Consult your prescriber.</p>
              </div>
              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-destructive">Excessive Zinc Detected</span>
                  <span className="font-mono text-sm font-medium text-destructive">65mg total</span>
                </div>
                <p className="text-xs text-muted-foreground">Found across "Athletic Greens" (15mg) and "ZMA" (50mg). Exceeds daily tolerable upper limit.</p>
              </div>
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-primary">Optimization Identified</span>
                </div>
                <p className="text-xs text-muted-foreground">Moved Curcumin to 19:00 (Dinner) to pair with dietary fats for 300% increased bioavailability.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 px-6 bg-secondary/50 border-t" id="pricing">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-4">Clear, transparent pricing.</h2>
          <p className="text-muted-foreground">Try the engine for free. Upgrade when your routine evolves.</p>
        </div>

        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          {/* Free Tier */}
          <div className="bg-card rounded-2xl border p-8 shadow-sm flex flex-col">
            <div className="mb-6">
              <h3 className="text-2xl font-medium mb-2">Standard</h3>
              <div className="text-4xl font-serif">$0</div>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex gap-3 text-sm text-muted-foreground">
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                2 free protocol generations
              </li>
              <li className="flex gap-3 text-sm text-muted-foreground">
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                Basic interaction checking
              </li>
              <li className="flex gap-3 text-sm text-muted-foreground">
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                Label photo scanning
              </li>
            </ul>
            <Link href="/app">
              <Button variant="outline" className="w-full h-12 text-base">Launch App</Button>
            </Link>
          </div>

          {/* Pro Tier */}
          <div className="bg-card rounded-2xl border-2 border-primary p-8 shadow-xl relative flex flex-col">
            <div className="absolute top-0 right-8 -translate-y-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-mono font-bold uppercase tracking-wider rounded-full">
              Most Popular
            </div>
            <div className="mb-6">
              <h3 className="text-2xl font-medium mb-2">Pro</h3>
              <div className="text-4xl font-serif">$10.99<span className="text-lg text-muted-foreground font-sans">/mo</span></div>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex gap-3 text-sm text-muted-foreground">
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                Unlimited protocol generations
              </li>
              <li className="flex gap-3 text-sm text-muted-foreground">
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                Continuous stack auditing
              </li>
              <li className="flex gap-3 text-sm text-muted-foreground">
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                Clinical literature citations
              </li>
              <li className="flex gap-3 text-sm text-muted-foreground">
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                Unlimited label scanning
              </li>
            </ul>
            <form onSubmit={handleProCheckout} className="space-y-3">
              <Input 
                type="email" 
                placeholder="Enter email to upgrade" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-background"
              />
              <Button type="submit" className="w-full h-12 text-base" disabled={isCheckingOut}>
                {isCheckingOut ? "Loading checkout..." : "Subscribe to Pro"}
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6 max-w-3xl mx-auto">
        <h2 className="text-3xl font-serif text-center mb-12">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger className="text-left font-medium">How is this different from a normal habit tracker?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              We aren't a checklist. SupplementMentor is a clinical routing engine. You tell us what you take, and we compute exactly <em>when</em> you should take it based on absorption pathways, compound antagonists, and biological anchors.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger className="text-left font-medium">Do you support proprietary blends?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              Upload a label photo for blend products (like Athletic Greens or Animal Pak) so we can identify their ingredients more accurately, which lets our audit engine catch overlapping compounds across your stack.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger className="text-left font-medium">What if I take prescription medications?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              You can set a fixed medication anchor in Step 2. The engine will forcefully separate absorption-blocking supplements (like calcium or iron) from your medication window, and it flags serious pharmacodynamic interactions between your stack and your prescriptions, such as serotonin syndrome or reduced warfarin efficacy, with a not-medical-advice disclaimer and citations.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-6 bg-card text-center">
        <div className="flex items-center justify-center gap-2 font-medium mb-6">
          <img src={logoIcon} alt="SupplementMentor" className="w-8 h-8" />
          <span className="tracking-tight text-lg text-foreground">Supplement<span className="bg-gradient-to-r from-primary to-[hsl(var(--brand-pink))] bg-clip-text text-transparent">Mentor</span></span>
        </div>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
          This tool is for informational purposes only and does not constitute medical advice. 
          Consult a physician before altering your supplement or medication routine.
        </p>
        <div className="text-xs text-muted-foreground font-mono">
          &copy; {new Date().getFullYear()} SupplementMentor. All rights reserved.
        </div>
        <div className="mt-4">
          <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            Terms &amp; Medical Disclaimer
          </Link>
        </div>
      </footer>
    </div>
  );
}

function CheckCircle(props: any) {
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
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}