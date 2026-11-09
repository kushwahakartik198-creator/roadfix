import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { HeroGraphic } from "@/components/home/HeroGraphic";
import { ArrowRight, Search } from "lucide-react";

export function HeroSection() {
  return (
    <section aria-labelledby="hero-heading" className="relative pt-6 sm:pt-10 lg:pt-14 pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
        {/* Left column: Hero copy and action CTAs */}
        <div className="lg:col-span-7 flex flex-col items-start text-left animate-hero-reveal">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold tracking-widest text-primary uppercase mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            CIVIC INFRASTRUCTURE INTELLIGENCE
          </div>

          {/* Single <h1> for the page */}
          <h1
            id="hero-heading"
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1]"
          >
            Smarter Roads. Safer Cities.
          </h1>

          {/* Subtitle (<p>, not a heading) */}
          <p className="mt-4 text-lg sm:text-xl font-medium text-slate-200 max-w-2xl leading-snug">
            Report potholes. Track road repairs. Help make Agra's roads safer.
          </p>

          {/* Detailed description */}
          <p className="mt-3 text-base text-muted-foreground max-w-xl leading-relaxed">
            A community-driven platform that helps citizens document potholes and follow road
            maintenance complaints transparently.
          </p>

          {/* Interactive CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
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
                <span>Track a complaint</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Right column: Original smart-city road network vector composition */}
        <div className="lg:col-span-5 flex justify-center order-last lg:order-none">
          <HeroGraphic />
        </div>
      </div>
    </section>
  );
}
