import { HeroSection } from "@/components/home/HeroSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { WhyRoadFixSection } from "@/components/home/WhyRoadFixSection";
import { AgraFocusSection } from "@/components/home/AgraFocusSection";
import { FinalCtaSection } from "@/components/home/FinalCtaSection";

export function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 space-y-20 sm:space-y-28 lg:space-y-36">
      <HeroSection />
      <HowItWorksSection />
      <WhyRoadFixSection />
      <AgraFocusSection />
      <FinalCtaSection />
    </div>
  );
}
