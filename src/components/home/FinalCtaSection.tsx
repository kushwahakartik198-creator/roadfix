import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Search } from "lucide-react";

export function FinalCtaSection() {
  return (
    <section aria-labelledby="final-cta-heading" className="relative pb-8 sm:pb-12">
      <Card className="relative overflow-hidden border border-border bg-gradient-to-b from-card to-background p-8 sm:p-12 text-center shadow-glow">
        <CardContent className="p-0 max-w-3xl mx-auto flex flex-col items-center">
          <h2
            id="final-cta-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground"
          >
            Every safer road starts with a report.
          </h2>

          <p className="mt-4 text-base text-muted-foreground max-w-xl">
            Help build a transparent, verifiable record of road hazards to assist municipal teams in
            prioritizing road repairs.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 w-full sm:w-auto">
            <Button
              asChild
              size="lg"
              className="min-h-[48px] px-8 text-base font-semibold shadow-glow"
            >
              <Link to="/report" className="inline-flex items-center justify-center gap-2">
                <span>Report a pothole</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="min-h-[48px] px-8 text-base font-medium"
            >
              <Link to="/track" className="inline-flex items-center justify-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span>Track your complaint</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
