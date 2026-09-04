import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { Pricing } from "@/components/Pricing";

export const metadata: Metadata = {
  title: "Pricing · OTAbridge",
  description:
    "Per active unit per month, with volume tiers and everything included. Fourteen days free, no card needed. Self-host for free.",
};

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main>
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
