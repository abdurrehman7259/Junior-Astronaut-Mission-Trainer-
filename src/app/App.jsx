import { useEffect, useState, useMemo, useReducer, useRef } from 'react';
import { AppShell } from '../ui/components/AppShell.jsx';
import { DataPanel } from '../ui/components/DataPanel.jsx';
import { HowToPlay } from '../ui/components/HowToPlay.jsx';
import { EndScreen } from '../ui/screens/EndScreen.jsx';
import { ErrorScreen } from '../ui/screens/ErrorScreen.jsx';
import { LoadingScreen } from '../ui/screens/LoadingScreen.jsx';
import { MissionScreen } from '../ui/screens/MissionScreen.jsx';
import { ResolutionScreen } from '../ui/screens/ResolutionScreen.jsx';
import { StartScreen } from '../ui/screens/StartScreen.jsx';
import { LiveBanner } from '../ui/components/LiveBanner.jsx';
import { loadEvents, loadExtras, loadMarsData } from './data.js';
import { useLiveSpaceWeather } from './live.js';
import { engine } from './engine.js';
import { clearSave, loadGame, saveGame } from './save.js';
import { isStubEvent } from './stub-events.js';
import { initialState, newSeed, reducer } from './state.js';
import { hasSeenIntro, markIntroSeen } from './intro.js';
import { isValidAllocation } from '../shared/eventSet.js';

export function App({ loadEventsFn = loadEvents, loadExtrasFn = loadExtras, loadMarsFn = loadMarsData }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const dataButtonRef = useRef(null);
  const howToButtonRef = useRef(null);
  // Opened automatically on the first Start: focus returns to the Day 1 heading, not the header button.
  const [howToAuto, setHowToAuto] = useState(false);
  const [saved, setSaved] = useState(null);
  const [extras, setExtras] = useState({ osdr: null, radlab: null });
  // undefined = still loading, null = unavailable (no placeholder for Mars, ever).
  const [mars, setMars] = useState(undefined);
  const live = useLiveSpaceWeather();

  useEffect(() => {
    let cancelled = false;
    loadEventsFn().then(
      (r) => {
        if (cancelled) return;
        dispatch({ type: 'loaded', ...r });
        const found = loadGame();
        // Placeholder and real data never mix. Mars never has placeholder data, so a Mars save with any is invalid.
        const stub = found ? found.game.events.some(isStubEvent) : false;
        const bad =
          found &&
          (found.site === 'mars'
            ? found.placeholder || stub
            : found.placeholder !== r.isPlaceholder || stub !== r.isPlaceholder);
        if (bad) {
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

  useEffect(() => {
    let cancelled = false;
    loadExtrasFn().then(
      (e) => {
        if (!cancelled) setExtras(e);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [loadExtrasFn]);

  useEffect(() => {
    let cancelled = false;
    loadMarsFn().then(
      (m) => {
        if (cancelled) return;
        setMars(m);
        if (m) dispatch({ type: 'marsLoaded', events: m.events, retrievedAt: m.retrievedAt });
      },
      () => {
        if (!cancelled) setMars(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadMarsFn]);

  const { screen, game, lastResult, allocation } = state;
  const site = state.site;

  useEffect(() => {
    document.documentElement.dataset.site = site;
  }, [site]);

  // One real OSDR study per mission, chosen from the seed (US-06).
  const factItems = extras.osdr?.items ?? [];
  const fact = factItems.length > 0 ? factItems[(game?.seed ?? 0) % factItems.length] : undefined;

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
        site: state.site,
      });
    } else if (screen === 'end') {
      clearSave();
    }
  }, [screen, game, lastResult, allocation, state.crewName, state.recentSetIds, state.isPlaceholder, state.site]);

  // Live preview for the allocator (US-02): what today would do with the current plan.
  const preview = useMemo(() => {
    if (screen !== 'mission' || !game || game.status !== 'playing' || !isValidAllocation(allocation)) return null;
    try {
      return engine.previewTurn(game, allocation);
    } catch {
      return null;
    }
  }, [screen, game, allocation]);

  const dayShown = screen === 'mission' && game ? game.day : screen === 'report' && lastResult ? lastResult.day : null;

  return (
    <>
      <AppShell
        day={dayShown}
        site={site}
        isPlaceholder={state.isPlaceholder}
        onOpenData={() => dispatch({ type: 'openDataPanel' })}
        dataButtonRef={dataButtonRef}
        goal={game && screen !== 'start' ? { site, science: game.scienceScore } : { site, science: null }}
        onOpenHowTo={() => {
          setHowToAuto(false);
          dispatch({ type: 'openHowTo' });
        }}
        howToButtonRef={howToButtonRef}
        banner={
          screen === 'start' ? (
            <LiveBanner live={live} retrievedAt={state.retrievedAt} isPlaceholder={state.isPlaceholder} />
          ) : null
        }
      >
        {screen === 'loading' && <LoadingScreen />}
        {screen === 'error' && <ErrorScreen />}
        {screen === 'start' && state.notice && <p role="status">{state.notice}</p>}
        {screen === 'start' && (
          <StartScreen
            marsStatus={mars === undefined ? 'loading' : mars ? 'ready' : 'unavailable'}
            onStart={(crewName, chosen) => {
              dispatch({ type: 'startMission', seed: newSeed(), crewName, site: chosen });
              // First time only: the 3-card intro opens over Day 1 (P1).
              if (!hasSeenIntro()) {
                setHowToAuto(true);
                dispatch({ type: 'openHowTo' });
              }
            }}
            resume={
              saved
                ? {
                    day: saved.game.day,
                    site: saved.site,
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
            site={site}
            marsSite={mars?.site ?? null}
          />
        )}
        {screen === 'report' && lastResult && (
          <ResolutionScreen
            result={lastResult}
            isFinal={lastResult.statusAfter !== 'playing'}
            onContinue={() => dispatch({ type: 'continue' })}
            site={site}
          />
        )}
        {screen === 'end' && game && (
          <EndScreen
            game={game}
            crewName={state.crewName}
            fact={fact ?? null}
            onPlayAgain={() => dispatch({ type: 'playAgain', seed: newSeed() })}
          />
        )}
      </AppShell>
      <DataPanel
        open={state.dataPanelOpen}
        onClose={() => dispatch({ type: 'closeDataPanel' })}
        retrievedAt={state.retrievedAt}
        isPlaceholder={state.isPlaceholder}
        osdr={extras.osdr}
        radlab={extras.radlab}
        mars={mars ?? null}
        live={live}
        returnFocusRef={dataButtonRef}
      />
      <HowToPlay
        open={state.howToOpen}
        site={site}
        onClose={() => {
          markIntroSeen();
          dispatch({ type: 'closeHowTo' });
        }}
        returnFocusRef={howToAuto ? undefined : howToButtonRef}
      />
    </>
  );
}
