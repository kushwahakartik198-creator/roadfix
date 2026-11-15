import "@/components/home/home.css";
import { CityScene } from "@/components/CityScene";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { AgraFocusSection } from "@/components/home/AgraFocusSection";
import { FinalCtaSection } from "@/components/home/FinalCtaSection";
import { PlatformPreviewSection } from "@/components/home/PlatformPreviewSection";
import { FeaturesSection } from "@/components/home/FeaturesSection";

export function HomePage() {
  return (
    <div className="home-page">
      <CityScene />
      <HowItWorksSection />
      <PlatformPreviewSection />
      <FeaturesSection />
      <AgraFocusSection />
      <FinalCtaSection />
    </div>
  );
}
