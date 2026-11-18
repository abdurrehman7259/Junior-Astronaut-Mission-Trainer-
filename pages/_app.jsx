// Runs before any zod schema is created: zod decides at schema creation whether to probe new Function(),
// and our CSP has no 'unsafe-eval', so jitless mode avoids a CSP violation on every load (A3 C4).
import '../src/zod-config.js';
import Head from 'next/head';

// Next.js loads global CSS only from this file. The order below is the order the styles had in the
// previous build (component styles first, then design tokens, then base), so the cascade is unchanged.
import '../src/ui/components/GlossaryTerm.css';
import '../src/ui/components/EventCard.css';
import '../src/ui/components/LiveBanner.css';
import '../src/ui/components/DataPanel.css';
import '../src/ui/components/HowToPlay.css';
import '../src/ui/components/Meters.css';
import '../src/ui/screens/EndScreen.css';
import '../src/ui/components/EarthMessage.css';
import '../src/ui/components/PowerAllocator.css';
import '../src/ui/screens/MissionScreen.css';
import '../src/ui/screens/ResolutionScreen.css';
import '../src/ui/screens/StartScreen.css';
import '../src/styles/tokens.css';
import '../src/styles/base.css';

export default function MoonBaseCadetsApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Moon Base Cadets</title>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
