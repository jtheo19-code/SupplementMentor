import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WizardProvider } from "@/lib/WizardContext";
import NotFound from "@/pages/not-found";
import StackBuilder from "@/pages/StackBuilder";
import DayAnchors from "@/pages/DayAnchors";
import TimingMap from "@/pages/TimingMap";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={StackBuilder} />
      <Route path="/anchors" component={DayAnchors} />
      <Route path="/map" component={TimingMap} />
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
            <main className="min-h-[100dvh] w-full bg-background font-sans text-foreground pb-24 selection:bg-primary/20">
              <div className="max-w-xl mx-auto px-4 py-8 md:py-12">
                <header className="mb-12 border-b pb-4">
                  <h1 className="text-xl font-medium tracking-tight text-foreground">
                    Supps Timer
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1 font-mono tracking-tight uppercase">
                    Protocol planner
                  </p>
                </header>
                <Router />
              </div>
            </main>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </WizardProvider>
    </QueryClientProvider>
  );
}

export default App;
