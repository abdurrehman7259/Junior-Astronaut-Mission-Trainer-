import { ScreenHeading } from '../components/ScreenHeading';

export function ErrorScreen() {
  return (
    <section className="stack">
      <ScreenHeading>Oh no!</ScreenHeading>
      <p>We could not load the space-weather data. Please reload.</p>
      <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
        Reload
      </button>
    </section>
  );
}
