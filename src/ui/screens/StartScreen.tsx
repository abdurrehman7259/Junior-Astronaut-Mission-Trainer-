import { ScreenHeading } from '../components/ScreenHeading';

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="stack">
      <ScreenHeading>Welcome, cadet!</ScreenHeading>
      <p>Share 10 power units each day. Keep your crew safe from real solar storms.</p>
      <button type="button" className="btn btn-primary btn-large" onClick={onStart}>
        Start mission
      </button>
    </section>
  );
}
