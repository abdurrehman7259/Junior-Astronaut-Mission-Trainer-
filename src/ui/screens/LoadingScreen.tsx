import { ScreenHeading } from '../components/ScreenHeading';

export function LoadingScreen() {
  return (
    <section>
      <ScreenHeading>Loading space weather...</ScreenHeading>
      <p role="status">Getting the Moon base ready.</p>
    </section>
  );
}
