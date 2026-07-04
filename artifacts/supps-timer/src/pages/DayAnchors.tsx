import React, { useState } from "react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/WizardContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, ArrowLeft } from "lucide-react";
import type { Anchors } from "@workspace/api-client-react";

export default function DayAnchors() {
  const [, setLocation] = useLocation();
  const { state, setAnchors } = useWizard();
  const [localAnchors, setLocalAnchors] = useState<Anchors>(state.anchors);

  const handleChange = (field: keyof Anchors, value: string) => {
    setLocalAnchors((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    setAnchors(localAnchors);
    setLocation("/map");
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to stack
        </Button>
        <h2 className="text-2xl font-semibold tracking-tight">Anchor your day</h2>
        <p className="text-muted-foreground mt-2">
          Set your baseline schedule. We use these times to place your supplements around meals and sleep to maximize absorption and minimize side effects.
        </p>
      </div>

      <div className="space-y-6 bg-card p-6 rounded-md border">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="wake" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Wake time</Label>
            <Input
              id="wake"
              type="time"
              value={localAnchors.wake}
              onChange={(e) => handleChange("wake", e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="breakfast" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Breakfast</Label>
            <Input
              id="breakfast"
              type="time"
              value={localAnchors.breakfast}
              onChange={(e) => handleChange("breakfast", e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dinner" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Dinner</Label>
            <Input
              id="dinner"
              type="time"
              value={localAnchors.dinner}
              onChange={(e) => handleChange("dinner", e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bed" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Bed time</Label>
            <Input
              id="bed"
              type="time"
              value={localAnchors.bed}
              onChange={(e) => handleChange("bed", e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        <div className="pt-6 border-t space-y-6">
          <h3 className="text-sm font-medium tracking-tight">Optional Anchors</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="coffeeTime" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">First Coffee</Label>
              <Input
                id="coffeeTime"
                type="time"
                value={localAnchors.coffeeTime || ""}
                onChange={(e) => handleChange("coffeeTime", e.target.value)}
                className="font-mono"
              />
              <p className="text-[10px] text-muted-foreground">For caffeine/L-theanine interactions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="medicationName" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Fixed Medication</Label>
              <Input
                id="medicationName"
                placeholder="e.g. Levothyroxine"
                value={localAnchors.medicationName || ""}
                onChange={(e) => handleChange("medicationName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="medicationTime" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Medication Time</Label>
              <Input
                id="medicationTime"
                type="time"
                value={localAnchors.medicationTime || ""}
                onChange={(e) => handleChange("medicationTime", e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end pt-4">
        <Button onClick={handleNext} className="w-full sm:w-auto">
          Generate Map
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
