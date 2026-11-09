import { Card, CardContent } from "@/components/ui/card";
import { Camera, FileText, ShieldCheck } from "lucide-react";

interface StepItem {
  number: string;
  title: string;
  description: string;
  icon: typeof Camera;
}

const STEPS: readonly StepItem[] = [
  {
    number: "01",
    title: "Spot and document",
    description: "Citizens photograph and report potholes.",
    icon: Camera,
  },
    {
      number: "02",
      title: "Submit and track",
      description:
        "Citizens receive a complaint reference and can follow its progress ward by ward, from report to resolution.",
      icon: FileText,
    },
  {
    number: "03",
    title: "Work towards safer roads",
    description: "Reports can support verification and coordinated maintenance.",
    icon: ShieldCheck,
  },
];

export function HowItWorksSection() {
  return (
    <section aria-labelledby="how-it-works-heading" className="relative">
      <div className="text-center max-w-3xl mx-auto">
        <h2
          id="how-it-works-heading"
          className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground"
        >
          How RoadFix works
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          A clear, citizen-focused path to capturing road damage and following municipal resolution.
        </p>
      </div>

      <ol className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 list-none p-0 m-0">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.number} className="h-full">
              <Card variant="interactive" className="h-full flex flex-col p-6">
                <CardContent className="p-0 flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-6">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <span
                      className="text-xs font-bold tracking-wider text-muted-foreground font-mono-tech px-2.5 py-1 rounded bg-secondary border border-border"
                      aria-hidden="true"
                    >
                      {step.number}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-foreground tracking-tight">{step.title}</h3>

                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
