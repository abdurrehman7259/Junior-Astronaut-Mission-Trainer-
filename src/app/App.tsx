import { useEffect, useReducer, useRef } from 'react';
import { AppShell } from '../ui/components/AppShell';
import { DataPanel } from '../ui/components/DataPanel';
import { EndScreen } from '../ui/screens/EndScreen';
import { ErrorScreen } from '../ui/screens/ErrorScreen';
import { LoadingScreen } from '../ui/screens/LoadingScreen';
import { MissionScreen } from '../ui/screens/MissionScreen';
import { StartScreen } from '../ui/screens/StartScreen';
import { loadEvents } from './data';
import { initialState, newSeed, reducer } from './state';

export function App({ loadEventsFn = loadEvents }: { loadEventsFn?: typeof loadEvents }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const dataButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadEventsFn().then(
      (r) => {
        if (!cancelled) dispatch({ type: 'loaded', ...r });
      },
      () => {
        if (!cancelled) dispatch({ type: 'loadFailed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadEventsFn]);

  const { screen, game } = state;
  const running = screen === 'mission' && game ? game.day : null;

  return (
    <>
      <AppShell
        day={running}
        isPlaceholder={state.isPlaceholder}
        onOpenData={() => dispatch({ type: 'openDataPanel' })}
        dataButtonRef={dataButtonRef}
      >
        {screen === 'loading' && <LoadingScreen />}
        {screen === 'error' && <ErrorScreen />}
        {screen === 'start' && <StartScreen onStart={() => dispatch({ type: 'startMission', seed: newSeed() })} />}
        {screen === 'mission' && game && (
          <MissionScreen
            game={game}
            lastResult={state.lastResult}
            onPlayDay={(allocation) => dispatch({ type: 'playDay', allocation })}
          />
        )}
        {screen === 'end' && game && (
          <EndScreen game={game} onPlayAgain={() => dispatch({ type: 'playAgain', seed: newSeed() })} />
        )}
      </AppShell>
      <DataPanel
        open={state.dataPanelOpen}
        onClose={() => dispatch({ type: 'closeDataPanel' })}
        retrievedAt={state.retrievedAt}
        isPlaceholder={state.isPlaceholder}
        returnFocusRef={dataButtonRef}
      />
    </>
  );
}
