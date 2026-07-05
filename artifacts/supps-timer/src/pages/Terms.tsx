import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function Terms() {
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-[100dvh] w-full bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <header className="mb-10 border-b pb-6">
          <Link
            href="/"
            className="mb-4 -ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <img src={logoIcon} alt="SupplementMentor" className="w-8 h-8" />
            Terms &amp; Medical Disclaimer
          </h1>
          <p className="text-xs text-muted-foreground mt-2 font-mono uppercase tracking-tight">
            Last updated {lastUpdated}
          </p>
        </header>

        <div className="space-y-10">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Important: read this first
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              SupplementMentor is an informational tool only. It does not provide medical advice
              and is not a substitute for the judgment of your doctor or pharmacist. It does not
              diagnose, treat, cure, or prevent any disease or condition.
            </p>
            <p className="text-sm text-foreground font-medium leading-relaxed">
              If SupplementMentor flags a possible interaction between a supplement and one of your
              medications, do not stop or change your prescribed medication. Instead, hold off on
              the supplement and talk to your medical provider for guidance. Your medications are
              managed by your prescriber, never by this app.
            </p>
          </div>

          <Section title="1. Not medical advice">
            <p>
              The content, timing maps, interaction flags, citations, and audits provided by
              SupplementMentor are for general informational and educational purposes only. They do
              not constitute medical, pharmacological, or professional health advice, and no
              doctor-patient or provider-patient relationship is created by your use of this app.
            </p>
            <p>
              Always seek the advice of a qualified physician, pharmacist, or other healthcare
              provider with any questions you have about a medical condition, medication, or
              supplement. Never disregard professional medical advice or delay seeking it because of
              something you read here.
            </p>
          </Section>

          <Section title="2. Does not diagnose, treat, or cure">
            <p>
              SupplementMentor does not diagnose, treat, cure, or prevent any disease, illness, or
              health condition. These statements have not been evaluated by any regulatory
              authority. Any decisions you make about supplements, dosing, or timing are your own
              responsibility and should be reviewed with your healthcare provider.
            </p>
          </Section>

          <Section title="3. Interaction flags: avoid the supplement, not your medication">
            <p>
              SupplementMentor may flag potential interactions between the supplements in your stack
              and the medications you enter. These flags are conservative, informational signals
              based on published pharmacology, not a personalized clinical assessment of your
              situation.
            </p>
            <p className="text-foreground font-medium">
              If a flag appears, the safe default is to avoid or pause the flagged supplement, not
              to alter your prescribed medication. Then seek clarity from your medical provider
              before making any change. Do not start, stop, increase, decrease, or reschedule any
              prescription medication based on this app.
            </p>
          </Section>

          <Section title="4. No guarantee of completeness or accuracy">
            <p>
              Interaction and timing data can never be exhaustive. The absence of a flag does not
              mean a combination is safe, and the presence of a flag does not mean harm will occur.
              We make no warranty, express or implied, regarding the accuracy, completeness, or
              suitability of the information for your individual circumstances.
            </p>
          </Section>

          <Section title="5. Use at your own risk">
            <p>
              You use SupplementMentor at your own risk. To the fullest extent permitted by law,
              SupplementMentor and its creators are not liable for any loss, injury, or damages
              arising from your use of, or reliance on, the information provided by this app.
            </p>
          </Section>

          <Section title="6. Emergencies">
            <p>
              This app is not for medical emergencies. If you think you are having a medical
              emergency or a serious adverse reaction, call your local emergency number or contact a
              poison control center immediately.
            </p>
          </Section>

          <Section title="7. Your responsibilities">
            <p>
              You are responsible for the accuracy of the supplements, medications, and schedule you
              enter. You agree to use SupplementMentor only for lawful, personal, informational
              purposes and to confirm any changes to your routine with a qualified professional.
            </p>
          </Section>

          <Section title="8. Changes to these terms">
            <p>
              We may update these Terms and this Medical Disclaimer from time to time. Continued use
              of SupplementMentor after changes are posted means you accept the updated terms.
            </p>
          </Section>

          <p className="text-xs text-muted-foreground pt-4 border-t">
            By using SupplementMentor you acknowledge that you have read, understood, and agreed to
            these Terms and this Medical Disclaimer.
          </p>
        </div>

        <footer className="mt-16 pt-6 border-t flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <img src={logoIcon} alt="SupplementMentor" className="w-5 h-5 opacity-80" />
          <span>&copy; {new Date().getFullYear()} SupplementMentor</span>
        </footer>
      </div>
    </div>
  );
}
