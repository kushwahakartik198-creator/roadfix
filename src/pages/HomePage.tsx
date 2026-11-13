import "@/components/home/home.css";
import { HeroSection } from "@/components/home/HeroSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { AgraFocusSection } from "@/components/home/AgraFocusSection";
import { FinalCtaSection } from "@/components/home/FinalCtaSection";

export function HomePage() {
  return (
    <div className="home-page">
      <HeroSection />
      <HowItWorksSection />
      <AgraFocusSection />
      <FinalCtaSection />
    </div>
  );
}
