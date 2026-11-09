import { Card, CardContent } from "@/components/ui/card";
import { Users, Search, Eye, MapPin, Workflow } from "lucide-react";

export function WhyRoadFixSection() {
  return (
    <section aria-labelledby="why-roadfix-heading" className="relative">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h2
          id="why-roadfix-heading"
          className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground"
        >
          Why RoadFix
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Transforming scattered citizen complaints into structured, actionable municipal data.
        </p>
      </div>

      {/* Asymmetric Bento-style layout (collapses to 1 column on mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Large Feature Tile 1: Citizen Participation (spans 2 columns on tablet/desktop) */}
        <Card
          variant="interactive"
          className="md:col-span-2 lg:col-span-2 p-6 sm:p-8 flex flex-col justify-between bg-gradient-to-br from-card via-card to-secondary/40"
        >
          <CardContent className="p-0 flex flex-col justify-between h-full">
            <div>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 mb-6">
                <Users className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                Citizen participation
              </h3>
              <p className="mt-3 text-base text-muted-foreground max-w-xl leading-relaxed">
                Residents are often the first to notice damaged roads. RoadFix gives them a clear
                way to document what they see.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-border/50 text-xs text-primary font-medium tracking-wide">
              Empowering Agra's communities through verified citizen documentation.
            </div>
          </CardContent>
        </Card>

        {/* Tile 2: Transparent complaint tracking */}
        <Card variant="interactive" className="p-6 flex flex-col justify-between">
          <CardContent className="p-0 flex flex-col justify-between h-full">
            <div>
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground border border-border mb-5">
                <Search className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                Transparent complaint tracking
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                RoadFix is being built so every report gets a reference and a visible status.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tile 3: Better visibility into road issues */}
        <Card variant="interactive" className="p-6 flex flex-col justify-between">
          <CardContent className="p-0 flex flex-col justify-between h-full">
            <div>
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground border border-border mb-5">
                <Eye className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                Better visibility into road issues
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Photos and locations can turn scattered complaints into evidence that is easier to
                review.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tile 4: Geographical awareness */}
        <Card variant="interactive" className="p-6 flex flex-col justify-between">
          <CardContent className="p-0 flex flex-col justify-between h-full">
            <div>
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground border border-border mb-5">
                <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                Geographical awareness
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Location-based reports can help show where road problems cluster.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tile 5: A more organised approach */}
        <Card variant="interactive" className="p-6 flex flex-col justify-between">
          <CardContent className="p-0 flex flex-col justify-between h-full">
            <div>
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground border border-border mb-5">
                <Workflow className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                A more organised approach
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Structured reports can give maintenance teams consistent information to verify and
                prioritise.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
