import { Switch, Route, Router as WouterRouter, useLocation, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WizardProvider } from "@/lib/WizardContext";

import NotFound from "@/pages/not-found";
import StackBuilder from "@/pages/StackBuilder";
import DayAnchors from "@/pages/DayAnchors";
import TimingMap from "@/pages/TimingMap";
import LandingPage from "@/pages/LandingPage";
import Terms from "@/pages/Terms";
import ShelfScanReview from "@/pages/ShelfScanReview";
import logoIcon from "@/assets/logo-icon.png";

const queryClient = new QueryClient();

// The app routes wrap the wizard in its container
function AppRouter() {
  const [, setLocation] = useLocation();
  return (
    <div className="max-w-xl mx-auto px-4 py-8 md:py-12">
      <header className="mb-12 border-b pb-4">
        <button
          onClick={() => setLocation("/")}
          className="mb-4 -ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </button>
        <h1 className="text-xl font-medium tracking-tight text-foreground flex items-center gap-2">
          <img src={logoIcon} alt="SupplementMentor" className="w-8 h-8" />
          Supplement<span className="bg-gradient-to-r from-primary to-[hsl(var(--brand-pink))] bg-clip-text text-transparent">Mentor</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-2 font-mono tracking-tight uppercase">
          Clinical Timing Engine
        </p>
      </header>
      <Switch>
        <Route path="/app/scan-shelf/review" component={ShelfScanReview} />
        <Route path="/app" component={StackBuilder} />
        <Route path="/app/anchors" component={DayAnchors} />
        <Route path="/app/map" component={TimingMap} />
        <Route component={NotFound} />
      </Switch>
      <footer className="mt-16 pt-6 border-t flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <img src={logoIcon} alt="SupplementMentor" className="w-5 h-5 opacity-80" />
          <span>&copy; {new Date().getFullYear()} SupplementMentor</span>
        </div>
        <Link href="/terms" className="hover:text-foreground transition-colors underline underline-offset-2">
          Terms &amp; Medical Disclaimer
        </Link>
      </footer>
    </div>
  );
}

function MainRouter() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/terms" component={Terms} />
      <Route path="/app/*" component={AppRouter} />
      <Route path="/app" component={AppRouter} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WizardProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <main className="min-h-[100dvh] w-full bg-background font-sans text-foreground selection:bg-primary/20">
              <MainRouter />
            </main>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </WizardProvider>
    </QueryClientProvider>
  );
}

export default App;
