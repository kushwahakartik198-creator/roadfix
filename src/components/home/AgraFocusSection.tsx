import { Card, CardContent } from "@/components/ui/card";
import { AgraSchematic } from "@/components/home/AgraSchematic";
import { MapPin } from "lucide-react";

export function AgraFocusSection() {
  return (
    <section aria-labelledby="agra-focus-heading" className="relative">
      <Card className="p-8 sm:p-12 overflow-hidden bg-gradient-to-br from-card via-card to-secondary/30">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Copy column */}
            <div className="lg:col-span-6 flex flex-col items-start text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                <span>INITIATIVE TARGET</span>
              </div>

              <h2
                id="agra-focus-heading"
                className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground"
              >
                Built for better roads, starting with Agra.
              </h2>

              <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
                Agra, Uttar Pradesh is RoadFix's initial target city. The platform is designed to
                grow to more cities over time.
              </p>
            </div>

            {/* Schematic visual column */}
            <div className="lg:col-span-6 flex flex-col items-center justify-center">
              <AgraSchematic />
              <p className="mt-3 text-xs text-muted-foreground text-center">
                Illustrative schematic — not live municipal data.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
