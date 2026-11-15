import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SiteId, TurnResult } from '../../src/shared/types';
import { ResolutionScreen } from '../../src/ui/screens/ResolutionScreen';

function makeResult(over: Partial<TurnResult> = {}): TurnResult {
  return {
    day: 3,
    allocation: { life: 4, shield: 3, science: 3 },
    event: {
      id: '2024-05-10T06:27:00-FLR-001',
      source: 'DONKI',
      kind: 'FLR',
      realDate: '2024-05-10',
      severity: 2,
      flareClass: 'M5.0',
      kidText: 'A burst of light left the Sun.',
      sourceUrl: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/',
    },
    before: { power: 80, lifeSupport: 70, crewHealth: 90 },
    after: { power: 72, lifeSupport: 70, crewHealth: 95 },
    deltas: { power: -8, lifeSupport: 0, crewHealth: 5 },
    scienceBefore: 10,
    scienceGained: 4,
    scienceAfter: 14,
    dose: { incoming: 24, blocked: 18, received: 6 },
    explanations: {
      power: 'The base used more power than it made.',
      lifeSupport: 'Air and water stayed steady today.',
      crewHealth: 'Rest helped the crew feel better.',
      science: 'Your lab finished a good experiment.',
    },
    statusAfter: 'playing',
    ...over,
  };
}

const noDose = { incoming: 0, blocked: 0, received: 0 };

function show(result: TurnResult, opts: { isFinal?: boolean; site?: SiteId } = {}) {
  return render(
    <ResolutionScreen result={result} isFinal={opts.isFinal ?? false} onContinue={() => {}} site={opts.site} />,
  );
}

describe('ResolutionScreen', () => {
  it('has a single h1 with the day report', () => {
    show(makeResult());
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Day 3 report');
    expect(h1s[0]).toHaveFocus();
  });

  it('recaps the Moon event: kind, real date, storm size', () => {
    show(makeResult());
    expect(screen.getByText('Solar flare')).toBeInTheDocument();
    expect(screen.getByText('10 May 2024')).toBeInTheDocument();
    expect(screen.getByText('Storm size: Medium')).toBeInTheDocument();
    expect(screen.queryByText(/Game strength/)).not.toBeInTheDocument();
  });

  describe('verdict line', () => {
    it('storm fully blocked: great call, good tone', () => {
      const { container } = show(makeResult({ dose: { incoming: 24, blocked: 24, received: 0 } }));
      expect(screen.getByText('Great call! Your shields stopped the storm.')).toBeInTheDocument();
      expect(container.querySelector('.res-verdict-good')).not.toBeNull();
      expect(screen.getByText('Good')).toBeInTheDocument();
    });

    it('storm mostly blocked: good call', () => {
      show(makeResult());
      expect(screen.getByText('Good call! Your shields blocked most of the storm.')).toBeInTheDocument();
    });

    it('storm hurt the crew: ouch, bad tone with a word', () => {
      const { container } = show(makeResult({ dose: { incoming: 30, blocked: 0, received: 30 } }));
      expect(screen.getByText('Ouch, low shields. Your crew got hurt by the storm.')).toBeInTheDocument();
      expect(container.querySelector('.res-verdict-bad')).not.toBeNull();
      expect(screen.getByText('Problem')).toBeInTheDocument();
    });

    it('quiet day with shields: not needed, ok tone', () => {
      const { container } = show(makeResult({ dose: noDose }));
      expect(
        screen.getByText("Shields weren't needed today. That power could have earned science."),
      ).toBeInTheDocument();
      expect(container.querySelector('.res-verdict-ok')).not.toBeNull();
      expect(screen.getByText('Okay')).toBeInTheDocument();
    });

    it('quiet day with science and no shields: smart', () => {
      show(makeResult({ dose: noDose, allocation: { life: 4, shield: 0, science: 6 } }));
      expect(screen.getByText('Smart! A calm day, so your power went to science.')).toBeInTheDocument();
    });

    it('low air: tells the player the minimum', () => {
      show(makeResult({ dose: noDose, allocation: { life: 2, shield: 4, science: 4 } }));
      expect(screen.getByText('Air was low. Give Air & food at least 4 power.')).toBeInTheDocument();
    });

    it('battery empty', () => {
      show(
        makeResult({
          dose: noDose,
          before: { power: 10, lifeSupport: 70, crewHealth: 90 },
          after: { power: 0, lifeSupport: 70, crewHealth: 90 },
        }),
      );
      expect(screen.getByText('The battery ran out! Use less power on shields and science.')).toBeInTheDocument();
    });

    it('loss: crew and air', () => {
      const { rerender } = show(
        makeResult({ statusAfter: 'ended', after: { power: 50, lifeSupport: 60, crewHealth: 0 } }),
      );
      expect(screen.getByText('Oh no! The storm hurt your crew too much.')).toBeInTheDocument();
      rerender(
        <ResolutionScreen
          result={makeResult({ statusAfter: 'ended', after: { power: 50, lifeSupport: 0, crewHealth: 40 } })}
          isFinal
          onContinue={() => {}}
        />,
      );
      expect(screen.getByText('Oh no! Air & food ran out.')).toBeInTheDocument();
    });
  });

  describe('meter lines', () => {
    it('lists the four meters in order with new names', () => {
      show(makeResult());
      const labels = screen
        .getAllByRole('listitem')
        .map((li) => li.querySelector('.res-label')?.textContent);
      expect(labels).toEqual(['Battery', 'Air & food', 'Crew health', 'Science']);
      expect(screen.queryByText('Power reserve')).not.toBeInTheDocument();
      expect(screen.queryByText('Life support')).not.toBeInTheDocument();
    });

    it('shows before to after numbers and the right arrows', () => {
      show(makeResult());
      expect(screen.getByText('80 → 72')).toBeInTheDocument();
      expect(screen.getByText('70 → 70')).toBeInTheDocument();
      expect(screen.getByText('90 → 95')).toBeInTheDocument();
      expect(screen.getByText('10 → 14')).toBeInTheDocument();
      const rowOf = (label: string) => screen.getByText(label).closest('li')!;
      const battery = rowOf('Battery');
      expect(within(battery).getByText('▼')).toBeInTheDocument();
      expect(within(battery).getByText('Down')).toBeInTheDocument();
      const air = rowOf('Air & food');
      expect(within(air).getByText('●')).toBeInTheDocument();
      expect(within(air).getByText('No change')).toBeInTheDocument();
      const crew = rowOf('Crew health');
      expect(within(crew).getByText('▲')).toBeInTheDocument();
      expect(within(crew).getByText('Up')).toBeInTheDocument();
      expect(within(rowOf('Science')).getByText('▲')).toBeInTheDocument();
    });

    it('picks one line per meter from the result', () => {
      show(makeResult());
      expect(screen.getByText('Shields and science used more than the Sun added.')).toBeInTheDocument();
      expect(screen.getByText('Enough power kept the air steady.')).toBeInTheDocument();
      expect(screen.getByText('Shields blocked 18. 6 got through.')).toBeInTheDocument();
      expect(screen.getByText('+4 science points.')).toBeInTheDocument();
    });

    it('tags the crew line as game numbers only when radiation got through', () => {
      const { rerender } = show(makeResult());
      expect(screen.getByText('Game numbers')).toBeInTheDocument();
      rerender(
        <ResolutionScreen
          result={makeResult({ dose: { incoming: 24, blocked: 24, received: 0 } })}
          isFinal={false}
          onContinue={() => {}}
        />,
      );
      expect(screen.queryByText('Game numbers')).not.toBeInTheDocument();
      expect(screen.getByText('Shields kept the crew safe.')).toBeInTheDocument();
      rerender(<ResolutionScreen result={makeResult({ dose: noDose })} isFinal={false} onContinue={() => {}} />);
      expect(screen.getByText('Calm Sun. No radiation hit the crew.')).toBeInTheDocument();
    });

    it('says air drops tomorrow when too little power went to air, and today when final', () => {
      const low = makeResult({ dose: noDose, allocation: { life: 2, shield: 4, science: 4 } });
      const { rerender } = show(low);
      expect(screen.getByText('Only 2 power for air. Air drops tomorrow.')).toBeInTheDocument();
      rerender(<ResolutionScreen result={low} isFinal onContinue={() => {}} />);
      expect(screen.getByText('Only 2 power for air. Air drops today.')).toBeInTheDocument();
    });

    it('battery empty and no-science lines', () => {
      show(
        makeResult({
          dose: noDose,
          scienceGained: 0,
          scienceAfter: 10,
          before: { power: 10, lifeSupport: 70, crewHealth: 90 },
          after: { power: 0, lifeSupport: 70, crewHealth: 90 },
        }),
      );
      expect(screen.getByText('The battery ran out. Air & food will drop.')).toBeInTheDocument();
      expect(screen.getByText('No power for science, so no points.')).toBeInTheDocument();
    });
  });

  it('never shows the engine explanations or "game dose"', () => {
    const { container } = show(makeResult());
    expect(screen.queryByText('The base used more power than it made.')).not.toBeInTheDocument();
    expect(screen.queryByText('Air and water stayed steady today.')).not.toBeInTheDocument();
    expect(screen.queryByText('Rest helped the crew feel better.')).not.toBeInTheDocument();
    expect(screen.queryByText('Your lab finished a good experiment.')).not.toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain('game dose');
    expect(screen.queryByText(/Radiation that reached the crew/)).not.toBeInTheDocument();
  });

  describe('Mars', () => {
    it('uses sol wording, reveals the event and keeps the late-warning line short', () => {
      show(makeResult(), { site: 'mars' });
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sol 3 report');
      expect(screen.getByText(/Message from Earth arrived:/)).toBeInTheDocument();
      expect(screen.getByText('In this game, the warning came too late.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to sol 4' })).toBeInTheDocument();
    });

    it('says next sol for low air and a calm sol for the verdict', () => {
      show(makeResult({ dose: noDose, allocation: { life: 2, shield: 0, science: 8 } }), { site: 'mars' });
      expect(screen.getByText('Only 2 power for air. Air drops next sol.')).toBeInTheDocument();
    });

    it('uses sol in the calm verdict', () => {
      show(makeResult({ dose: noDose, allocation: { life: 4, shield: 0, science: 6 } }), { site: 'mars' });
      expect(screen.getByText('Smart! A calm sol, so your power went to science.')).toBeInTheDocument();
    });

    it('shows no late-warning line on a calm sol', () => {
      show(makeResult({ event: { ...makeResult().event, kind: 'QUIET', severity: 0 }, dose: noDose }), {
        site: 'mars',
      });
      expect(screen.queryByText('In this game, the warning came too late.')).not.toBeInTheDocument();
    });
  });

  it('switches the button label with isFinal', () => {
    const { rerender } = show(makeResult());
    expect(screen.getByRole('button', { name: 'Go to day 4' })).toBeInTheDocument();
    rerender(<ResolutionScreen result={makeResult({ statusAfter: 'won' })} isFinal onContinue={() => {}} />);
    expect(screen.getByRole('button', { name: 'See how the mission went' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to day 4' })).not.toBeInTheDocument();
  });

  it('calls onContinue when the button is pressed', async () => {
    const onContinue = vi.fn();
    render(<ResolutionScreen result={makeResult()} isFinal={false} onContinue={onContinue} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to day 4' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
