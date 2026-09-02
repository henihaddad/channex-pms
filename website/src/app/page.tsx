import { Capabilities } from "@/components/Capabilities";
import { Deploy } from "@/components/Deploy";
import { FairCode } from "@/components/FairCode";
import { Faq } from "@/components/Faq";
import { FinalCta } from "@/components/FinalCta";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Nav } from "@/components/Nav";
import { Problem } from "@/components/Problem";
import { Proof } from "@/components/Proof";
import { Roadmap } from "@/components/Roadmap";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Proof />
        <Problem />
        <HowItWorks />
        <Capabilities />
        <Deploy />
        <FairCode />
        <Roadmap />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
