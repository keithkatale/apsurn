import { HeroFeaturesSection, HeroFilmSection } from "@/components/landing/HeroFeaturesSection";
import { WhyUsSection } from "@/components/landing/WhyUsSection";
import { ProcessSection } from "@/components/landing/ProcessSection";
import { AudienceSection } from "@/components/landing/AudienceSection";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { FounderNoteSection } from "@/components/landing/FounderNoteSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { BottomCtaSection } from "@/components/landing/BottomCtaSection";
import { Footer } from "@/components/landing/Footer";

export const metadata = {
  title: "apsurn | Outbound for founders who'd rather be building",
  description:
    "Paste your website. apsurn finds who should buy, gets their verified emails, and writes the sequence you send from your own Gmail. Built for seed-stage B2B founders.",
};

export default function LandingPage() {
  return (
    <div className="landing-page min-h-screen bg-white text-neutral-900 selection:bg-neutral-900 selection:text-white">
      <HeroFeaturesSection />
      <HeroFilmSection />
      <WhyUsSection />
      <ProcessSection />
      <AudienceSection />
      <ComparisonSection />
      <FounderNoteSection />
      <PricingSection />
      <FaqSection />
      <BottomCtaSection />
      <Footer />
    </div>
  );
}
