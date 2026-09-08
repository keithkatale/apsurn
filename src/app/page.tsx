import { Navbar } from "@/components/landing/Navbar";
import { HeroFeaturesSection } from "@/components/landing/HeroFeaturesSection";
import { WhyUsSection } from "@/components/landing/WhyUsSection";
import { ProcessSection } from "@/components/landing/ProcessSection";
import { IntegrationSection } from "@/components/landing/IntegrationSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { TestimonialSection } from "@/components/landing/TestimonialSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { BlogSection } from "@/components/landing/BlogSection";
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
      {/* 1. Floating Nav */}
      <Navbar />

      {/* 2. Hero & Features Section */}
      <HeroFeaturesSection />

      {/* 3. Why Us (Interactive Sticky Tabs & Mockups) */}
      <WhyUsSection />

      {/* 4. Process Section (Get started in 3 steps) */}
      <ProcessSection />

      {/* 5. Integration Section (App connectors) */}
      <IntegrationSection />

      {/* 6. Pricing Section (Starter, Growth, Pro) */}
      <PricingSection />

      {/* 7. Testimonial Section */}
      <TestimonialSection />

      {/* 8. FAQ Section */}
      <FaqSection />

      {/* 9. Blog & Resources Section */}
      <BlogSection />

      {/* 10. Contact Section */}
      <ContactSection />

      {/* 11. Bottom CTA Section */}
      <BottomCtaSection />

      {/* 12. Footer */}
      <Footer />
    </div>
  );
}
