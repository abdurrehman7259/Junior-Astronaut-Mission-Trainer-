import dynamic from 'next/dynamic';

// The game runs entirely in the browser (it reads the saved mission from localStorage on start), exactly as
// before, so it is loaded on the client only. The #root wrapper keeps the existing layout styles.
const App = dynamic(() => import('../src/app/App.jsx').then((mod) => mod.App), { ssr: false });

export default function Home() {
  return (
    <div id="root">
      <App />
    </div>
  );
}
