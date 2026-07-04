import React, { useState } from "react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/WizardContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, ArrowLeft, Plus, X } from "lucide-react";
import type { Anchors, Medication } from "@workspace/api-client-react";

export default function DayAnchors() {
  const [, setLocation] = useLocation();
  const { state, setAnchors } = useWizard();
  const [localAnchors, setLocalAnchors] = useState<Anchors>({
    ...state.anchors,
    medications: state.anchors.medications ?? [],
  });

  const medications = localAnchors.medications ?? [];

  const handleChange = (field: keyof Anchors, value: string) => {
    setLocalAnchors((prev) => ({ ...prev, [field]: value }));
  };

  const addMedication = () => {
    setLocalAnchors((prev) => ({
      ...prev,
      medications: [...(prev.medications ?? []), { name: "", time: "" }],
    }));
  };

  const updateMedication = (index: number, field: keyof Medication, value: string) => {
    setLocalAnchors((prev) => ({
      ...prev,
      medications: (prev.medications ?? []).map((med, i) =>
        i === index ? { ...med, [field]: value } : med,
      ),
    }));
  };

  const removeMedication = (index: number) => {
    setLocalAnchors((prev) => ({
      ...prev,
      medications: (prev.medications ?? []).filter((_, i) => i !== index),
    }));
  };

  const handleNext = () => {
    setAnchors({
      ...localAnchors,
      medications: (localAnchors.medications ?? [])
        .map((m) => ({ ...m, name: m.name.trim() }))
        .filter((m) => m.name && m.time),
    });
    setLocation("/app/map");
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={() => setLocation("/app")}>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Fixed Medications</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addMedication}
                className="h-8"
              >
                <Plus className="h-4 w-4 mr-1" /> Add medication
              </Button>
            </div>

            {medications.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Add any medications you take at a set time so we can space minerals safely around them.
              </p>
            )}

            {medications.map((med, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`med-name-${index}`} className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Name</Label>
                  <Input
                    id={`med-name-${index}`}
                    placeholder="e.g. Levothyroxine"
                    value={med.name}
                    onChange={(e) => updateMedication(index, "name", e.target.value)}
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label htmlFor={`med-time-${index}`} className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Time</Label>
                  <Input
                    id={`med-time-${index}`}
                    type="time"
                    value={med.time}
                    onChange={(e) => updateMedication(index, "time", e.target.value)}
                    className="font-mono"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMedication(index)}
                  className="text-muted-foreground shrink-0"
                  aria-label="Remove medication"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
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
