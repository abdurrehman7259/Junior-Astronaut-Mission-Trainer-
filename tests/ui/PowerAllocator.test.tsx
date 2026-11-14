import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  addUnit,
  isComplete,
  poolLeft,
  removeUnit,
  setUnits,
} from '../../src/ui/components/allocation';
import { PowerAllocator } from '../../src/ui/components/PowerAllocator';
import type { Allocation, TurnResult } from '../../src/shared/types';

const BALANCED: Allocation = { life: 4, shield: 3, science: 3 };

function fixture(received = 6): TurnResult {
  return {
    day: 3,
    allocation: BALANCED,
    event: {
      id: 'STUB-1',
      source: 'DONKI',
      kind: 'CME',
      realDate: '2024-05-10',
      severity: 2,
      kidText: 'A solar cloud is coming.',
      sourceUrl: 'https://example.org',
    },
    before: { power: 80, lifeSupport: 90, crewHealth: 80 },
    after: { power: 85, lifeSupport: 90, crewHealth: 72 },
    deltas: { power: 5, lifeSupport: 0, crewHealth: -8 },
    scienceBefore: 30,
    scienceGained: 9,
    scienceAfter: 39,
    dose: { incoming: 12, blocked: 6, received },
    explanations: {
      power: 'Power sentence.',
      lifeSupport: 'Life sentence.',
      crewHealth: 'Crew sentence.',
      science: 'Science sentence.',
    },
    statusAfter: 'playing',
  };
}

function setup(over: Partial<Parameters<typeof PowerAllocator>[0]> = {}) {
  const onChange = vi.fn();
  const onConfirm = vi.fn();
  const utils = render(
    <PowerAllocator
      value={BALANCED}
      onChange={onChange}
      preview={fixture()}
      onConfirm={onConfirm}
      day={3}
      {...over}
    />,
  );
  return { onChange, onConfirm, user: userEvent.setup(), ...utils };
}

const slider = (name: string) => screen.getByRole('slider', { name: `${name} units` });
const plus = (name: string) => screen.getByRole('button', { name: `Add one unit to ${name}` });
const minus = (name: string) =>
  screen.getByRole('button', { name: `Remove one unit from ${name}` });
const pool = () => screen.getByText(/Power left to share/);
const confirm = () => screen.getByRole('button', { name: 'Run day 3' });

function sum(a: Allocation) {
  return a.life + a.shield + a.science;
}

describe('allocation helpers', () => {
  const d: Allocation = { life: 2, shield: 1, science: 0 };

  it('poolLeft and isComplete', () => {
    expect(poolLeft(d)).toBe(7);
    expect(isComplete(d)).toBe(false);
    expect(poolLeft(BALANCED)).toBe(0);
    expect(isComplete(BALANCED)).toBe(true);
  });

  it('addUnit takes from the pool and stops at an empty pool', () => {
    expect(addUnit(d, 'science')).toEqual({ life: 2, shield: 1, science: 1 });
    expect(addUnit(BALANCED, 'life')).toBe(BALANCED);
  });

  it('removeUnit returns to the pool and stops at 0', () => {
    expect(removeUnit(d, 'life')).toEqual({ life: 1, shield: 1, science: 0 });
    expect(removeUnit(d, 'science')).toBe(d);
  });

  it('setUnits clamps to 0 and to what the pool allows', () => {
    expect(setUnits(d, 'science', 5)).toEqual({ life: 2, shield: 1, science: 5 });
    expect(setUnits(d, 'science', 10)).toEqual({ life: 2, shield: 1, science: 7 });
    expect(setUnits(d, 'life', -3)).toEqual({ life: 0, shield: 1, science: 0 });
    expect(setUnits(BALANCED, 'life', 9)).toBe(BALANCED);
    expect(setUnits(d, 'life', 1.6)).toEqual({ life: 2, shield: 1, science: 0 });
    expect(setUnits(d, 'life', Number.NaN)).toBe(d);
  });

  it('never exceeds 10 or goes negative for any sequence', () => {
    let x: Allocation = { life: 0, shield: 0, science: 0 };
    const keys = ['life', 'shield', 'science'] as const;
    for (let i = 0; i < 200; i++) {
      const k = keys[i % 3]!;
      x = i % 5 === 0 ? removeUnit(x, k) : i % 7 === 0 ? setUnits(x, k, i % 13) : addUnit(x, k);
      expect(poolLeft(x)).toBeGreaterThanOrEqual(0);
      expect(Math.min(x.life, x.shield, x.science)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('PowerAllocator', () => {
  it('starts complete: pool 0, + disabled, confirm enabled', () => {
    setup();
    expect(pool()).toHaveTextContent('Power left to share: 0');
    expect(plus('Life support')).toBeDisabled();
    expect(plus('Shielding')).toBeDisabled();
    expect(confirm()).toBeEnabled();
    expect(slider('Shielding')).toHaveAttribute('aria-valuetext', '3 of 10 units');
  });

  it('minus frees a unit, plus takes it back, and + is disabled only at pool 0', async () => {
    const { user } = setup();
    await user.click(minus('Shielding'));
    expect(pool()).toHaveTextContent('Power left to share: 1');
    expect(slider('Shielding')).toHaveValue('2');
    expect(plus('Science')).toBeEnabled();
    await user.click(plus('Science'));
    expect(slider('Science')).toHaveValue('4');
    expect(pool()).toHaveTextContent('Power left to share: 0');
    expect(plus('Science')).toBeDisabled();
  });

  it('minus is disabled when the system has 0 units', async () => {
    const { user } = setup({ value: { life: 10, shield: 0, science: 0 } });
    expect(minus('Shielding')).toBeDisabled();
    await user.click(minus('Life support'));
    expect(minus('Life support')).toBeEnabled();
  });

  it('disables confirm while the pool is above 0 and shows the hint instead of the preview', async () => {
    const { user, onConfirm } = setup();
    await user.click(minus('Life support'));
    expect(confirm()).toBeDisabled();
    expect(screen.getByText('Share all 10 units to see what happens.')).toBeInTheDocument();
    expect(screen.queryByText('If you run this plan:')).not.toBeInTheDocument();
    await user.click(confirm());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm when enabled', async () => {
    const { user, onConfirm } = setup();
    await user.click(confirm());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('only calls onChange with allocations that sum to 10', async () => {
    const { user, onChange } = setup();
    await user.click(minus('Shielding')); // pool 1: no call
    expect(onChange).not.toHaveBeenCalled();
    await user.click(plus('Life support')); // 5/2/3: valid
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ life: 5, shield: 2, science: 3 });
    await user.click(minus('Life support'));
    await user.click(minus('Science'));
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.click(plus('Shielding'));
    await user.click(plus('Shielding'));
    for (const call of onChange.mock.calls) expect(sum(call[0] as Allocation)).toBe(10);
    expect(onChange).toHaveBeenLastCalledWith({ life: 4, shield: 4, science: 2 });
  });

  it('slider moves clamp to the pool and return units when dragged down', () => {
    const { onChange } = setup();
    fireEvent.change(slider('Life support'), { target: { value: '1' } });
    expect(pool()).toHaveTextContent('Power left to share: 3');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(slider('Science'), { target: { value: '10' } });
    // science had 3 and the pool had 3, so it can reach 6 at most
    expect(slider('Science')).toHaveValue('6');
    expect(pool()).toHaveTextContent('Power left to share: 0');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ life: 1, shield: 3, science: 6 });
  });

  it('a slider cannot take units when the pool is empty', () => {
    const { onChange } = setup();
    fireEvent.change(slider('Life support'), { target: { value: '9' } });
    expect(slider('Life support')).toHaveValue('4');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('arrow keys on a slider are handled natively (change events apply)', () => {
    setup();
    slider('Shielding').focus();
    expect(slider('Shielding')).toHaveFocus();
    fireEvent.change(slider('Shielding'), { target: { value: '2' } });
    expect(pool()).toHaveTextContent('Power left to share: 1');
  });

  it('Reset empties everything into the pool without calling onChange', async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(pool()).toHaveTextContent('Power left to share: 10');
    expect(slider('Life support')).toHaveValue('0');
    expect(slider('Shielding')).toHaveValue('0');
    expect(slider('Science')).toHaveValue('0');
    expect(confirm()).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Balanced fills 4/3/3 and reports it', async () => {
    const { user, onChange } = setup({ value: { life: 10, shield: 0, science: 0 } });
    await user.click(screen.getByRole('button', { name: /Balanced/ }));
    expect(onChange).toHaveBeenLastCalledWith({ life: 4, shield: 3, science: 3 });
    expect(slider('Life support')).toHaveValue('4');
  });

  it('shows the preview arrows, signs and numbers from the fixture', () => {
    setup();
    expect(screen.getByText('If you run this plan:')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem').filter((li) => li.className === 'pa-preview-row');
    const text = rows.map((r) => r.textContent);
    expect(text).toEqual([
      'Power reserve ▲ up +5 (to 85)',
      'Life support ● no change 0 (to 90)',
      'Crew health ▼ down −8 (to 72)',
      'Science ▲ up +9 (to 39)',
    ]);
    expect(screen.getByText('Radiation reaching the crew: 6')).toBeInTheDocument();
    for (const s of ['Power sentence.', 'Life sentence.', 'Crew sentence.', 'Science sentence.']) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
  });

  it('hides the radiation line when nothing reaches the crew', () => {
    setup({ preview: fixture(0) });
    expect(screen.queryByText(/Radiation reaching the crew/)).not.toBeInTheDocument();
  });

  it('shows no preview panel content when preview is null', () => {
    setup({ preview: null });
    expect(screen.queryByText('If you run this plan:')).not.toBeInTheDocument();
  });

  it('syncs the draft when the value prop changes', () => {
    const { rerender, onChange, onConfirm } = setup();
    rerender(
      <PowerAllocator
        value={{ life: 2, shield: 5, science: 3 }}
        onChange={onChange}
        preview={fixture()}
        onConfirm={onConfirm}
        day={4}
      />,
    );
    expect(slider('Life support')).toHaveValue('2');
    expect(slider('Shielding')).toHaveValue('5');
    expect(screen.getByRole('button', { name: 'Run day 4' })).toBeEnabled();
  });

  it('works with a parent that stores onChange back into value', async () => {
    function Parent() {
      const [v, setV] = useState<Allocation>(BALANCED);
      return (
        <PowerAllocator value={v} onChange={setV} preview={fixture()} onConfirm={() => {}} day={3} />
      );
    }
    const user = userEvent.setup();
    render(<Parent />);
    await user.click(minus('Shielding'));
    await user.click(plus('Life support'));
    expect(slider('Life support')).toHaveValue('5');
    expect(slider('Shielding')).toHaveValue('2');
    expect(pool()).toHaveTextContent('Power left to share: 0');
  });

  it('disables every control when disabled', () => {
    setup({ disabled: true });
    expect(confirm()).toBeDisabled();
    expect(slider('Life support')).toBeDisabled();
    expect(minus('Life support')).toBeDisabled();
    expect(plus('Life support')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });

  it('gives each system a text label, description and an aria-hidden icon', () => {
    const { container } = setup();
    expect(screen.getByText('Air, water and food for the crew.')).toBeInTheDocument();
    expect(screen.getByText('Protects the crew from solar radiation.')).toBeInTheDocument();
    expect(screen.getByText('Experiments that earn science points.')).toBeInTheDocument();
    const icons = container.querySelectorAll('svg.pa-icon');
    expect(icons).toHaveLength(3);
    icons.forEach((i) => expect(i).toHaveAttribute('aria-hidden', 'true'));
    expect(container.querySelectorAll('.pa-cell-on')).toHaveLength(10);
    expect(container.querySelectorAll('.pa-cell')).toHaveLength(30);
  });

  it('announces the pool politely', () => {
    setup();
    expect(pool()).toHaveAttribute('aria-live', 'polite');
  });
});
