import { Navbar } from "@/components/landing/Navbar";
import { HeroFeaturesSection } from "@/components/landing/HeroFeaturesSection";
import { WhyUsSection } from "@/components/landing/WhyUsSection";
import { ProcessSection } from "@/components/landing/ProcessSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { ContactSection } from "@/components/landing/ContactSection";
import { BottomCtaSection } from "@/components/landing/BottomCtaSection";
import { Footer } from "@/components/landing/Footer";

export const metadata = {
  title: "apsurn — AI SDR & Autonomous Prospecting Engine",
  description:
    "Turn your company website into a 24/7 autonomous prospecting engine. AI-driven ICP blueprinting, live search discovery, and verified outreach sequences.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 selection:bg-neutral-900 selection:text-white">
      <Navbar />
      <HeroFeaturesSection />
      <WhyUsSection />
      <ProcessSection />
      {/* IntegrationSection temporarily disabled */}
      <PricingSection />
      <FaqSection />
      <ContactSection />
      <BottomCtaSection />
      <Footer />
    </div>
  );
}
