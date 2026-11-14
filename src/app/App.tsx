import { useEffect, useState, useMemo, useReducer, useRef } from 'react';
import { AppShell } from '../ui/components/AppShell';
import { DataPanel } from '../ui/components/DataPanel';
import { EndScreen } from '../ui/screens/EndScreen';
import { ErrorScreen } from '../ui/screens/ErrorScreen';
import { LoadingScreen } from '../ui/screens/LoadingScreen';
import { MissionScreen } from '../ui/screens/MissionScreen';
import { ResolutionScreen } from '../ui/screens/ResolutionScreen';
import { StartScreen } from '../ui/screens/StartScreen';
import { loadEvents } from './data';
import { engine } from './engine';
import { clearSave, loadGame, saveGame, type SavedGame } from './save';
import { isStubEvent } from './stub-events';
import { initialState, newSeed, reducer } from './state';

export function App({ loadEventsFn = loadEvents }: { loadEventsFn?: typeof loadEvents }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const dataButtonRef = useRef<HTMLButtonElement>(null);
  const [saved, setSaved] = useState<SavedGame | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadEventsFn().then(
      (r) => {
        if (cancelled) return;
        dispatch({ type: 'loaded', ...r });
        // Read the save once. Placeholder and real data never mix (data honesty).
        const found = loadGame();
        if (found && (found.placeholder !== r.isPlaceholder || found.game.events.some(isStubEvent) !== r.isPlaceholder)) {
          clearSave();
          setSaved(null);
        } else {
          setSaved(found);
        }
      },
      () => {
        if (!cancelled) dispatch({ type: 'loadFailed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadEventsFn]);

  const { screen, game, lastResult, allocation } = state;

  // Persist progress; a finished mission is not resumable.
  useEffect(() => {
    if ((screen === 'mission' || screen === 'report') && game) {
      saveGame({
        crewName: state.crewName,
        screen,
        game,
        lastResult,
        allocation,
        recentSetIds: state.recentSetIds,
        placeholder: state.isPlaceholder,
      });
    } else if (screen === 'end') {
      clearSave();
    }
  }, [screen, game, lastResult, allocation, state.crewName, state.recentSetIds, state.isPlaceholder]);

  // Live preview for the allocator (US-02): what today would do with the current plan.
  const preview = useMemo(() => {
    if (screen !== 'mission' || !game || game.status !== 'playing') return null;
    try {
      return engine.previewTurn(game, allocation);
    } catch {
      return null;
    }
  }, [screen, game, allocation]);

  const dayShown =
    screen === 'mission' && game ? game.day : screen === 'report' && lastResult ? lastResult.day : null;

  return (
    <>
      <AppShell
        day={dayShown}
        isPlaceholder={state.isPlaceholder}
        onOpenData={() => dispatch({ type: 'openDataPanel' })}
        dataButtonRef={dataButtonRef}
      >
        {screen === 'loading' && <LoadingScreen />}
        {screen === 'error' && <ErrorScreen />}
        {screen === 'start' && (
          <StartScreen
            onStart={(crewName) => dispatch({ type: 'startMission', seed: newSeed(), crewName })}
            resume={
              saved
                ? {
                    day: saved.game.day,
                    crewName: saved.crewName,
                    onResume: () => {
                      dispatch({ type: 'resume', saved });
                      setSaved(null);
                    },
                  }
                : undefined
            }
          />
        )}
        {screen === 'mission' && game && (
          <MissionScreen
            game={game}
            crewName={state.crewName}
            allocation={allocation}
            preview={preview}
            lastResult={lastResult}
            onAllocationChange={(a) => dispatch({ type: 'setAllocation', allocation: a })}
            onConfirm={() => dispatch({ type: 'playDay', allocation })}
          />
        )}
        {screen === 'report' && lastResult && (
          <ResolutionScreen
            result={lastResult}
            isFinal={lastResult.statusAfter !== 'playing'}
            onContinue={() => dispatch({ type: 'continue' })}
          />
        )}
        {screen === 'end' && game && (
          <EndScreen
            game={game}
            crewName={state.crewName}
            onPlayAgain={() => dispatch({ type: 'playAgain', seed: newSeed() })}
          />
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
