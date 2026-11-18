import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { addUnit, isComplete, poolLeft, removeUnit, setUnits } from '../../src/ui/components/allocation.js';
import { PowerAllocator } from '../../src/ui/components/PowerAllocator.jsx';
import { DAY, NAMES, PRESETS } from '../../src/ui/content/copy.js';

const BALANCED = { life: 4, shield: 3, science: 3 };
const EMPTY = { life: 0, shield: 0, science: 0 };

/** A parent that stores onChange back into value, like the app does. */
function setup(startValue = EMPTY, over = {}) {
  const onChange = vi.fn();
  const onConfirm = vi.fn();
  function Parent() {
    const [v, setV] = useState(startValue);
    return (
      <PowerAllocator
        value={v}
        onChange={(n) => {
          onChange(n);
          setV(n);
        }}
        onConfirm={onConfirm}
        day={3}
        {...over}
      />
    );
  }
  const utils = render(<Parent />);
  return { onChange, onConfirm, user: userEvent.setup(), ...utils };
}

const slider = (name) => screen.getByRole('slider', { name: `${name} units` });
const plus = (name) => screen.getByRole('button', { name: `Add one unit to ${name}` });
const minus = (name) => screen.getByRole('button', { name: `Remove one unit from ${name}` });
const pool = () => screen.getByText(/Power left to share/);
const startBtn = (name = 'Start day 3') => screen.getByRole('button', { name });

const AIR = NAMES.air;
const SHIELDS = NAMES.shield;
const SCIENCE = NAMES.science;

function sum(a) {
  return a.life + a.shield + a.science;
}

describe('PowerAllocator warnings', () => {
  const warnings = () => document.querySelector('.pa-warnings');

  it('has a polite status region that is empty when nothing is wrong', () => {
    setup(BALANCED);
    expect(warnings()).toHaveAttribute('role', 'status');
    expect(warnings()).toHaveAttribute('aria-live', 'polite');
    expect(warnings()).toBeEmptyDOMElement();
  });

  it('does not warn about air before anything is shared', () => {
    setup(EMPTY);
    expect(screen.queryByText(DAY.airWarning)).toBeNull();
  });

  it('warns (icon + text) when Air & food has less than 4 and some power is shared', async () => {
    const { user } = setup(EMPTY);
    await user.click(plus(SHIELDS));
    const msg = screen.getByText(DAY.airWarning);
    expect(warnings()).toContainElement(msg);
    expect(msg.parentElement.querySelector('svg')).not.toBeNull();
    await user.click(plus(AIR));
    await user.click(plus(AIR));
    await user.click(plus(AIR));
    expect(screen.getByText(DAY.airWarning)).toBeInTheDocument();
    await user.click(plus(AIR));
    expect(screen.queryByText(DAY.airWarning)).toBeNull();
  });

  it('shows the battery warning only when the parent says the battery will empty', () => {
    const { rerender } = render(<PowerAllocator value={BALANCED} onChange={() => {}} onConfirm={() => {}} day={3} />);
    expect(screen.queryByText(DAY.batteryWarning)).toBeNull();
    rerender(<PowerAllocator value={BALANCED} onChange={() => {}} onConfirm={() => {}} day={3} batteryWillEmpty />);
    const msg = screen.getByText(DAY.batteryWarning);
    expect(warnings()).toContainElement(msg);
    expect(msg.parentElement.querySelector('svg')).not.toBeNull();
    expect(screen.queryByText(DAY.airWarning)).toBeNull();
  });
});

describe('allocation helpers', () => {
  const d = { life: 2, shield: 1, science: 0 };

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
    let x = { life: 0, shield: 0, science: 0 };
    const keys = ['life', 'shield', 'science'];
    for (let i = 0; i < 200; i++) {
      const k = keys[i % 3];
      x = i % 5 === 0 ? removeUnit(x, k) : i % 7 === 0 ? setUnits(x, k, i % 13) : addUnit(x, k);
      expect(poolLeft(x)).toBeGreaterThanOrEqual(0);
      expect(Math.min(x.life, x.shield, x.science)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('PowerAllocator', () => {
  it('starts empty: pool 10, Start disabled with the hint linked to it', () => {
    setup();
    expect(pool()).toHaveTextContent('Power left to share: 10');
    expect(slider(AIR)).toHaveValue('0');
    expect(startBtn()).toBeDisabled();
    const hint = screen.getByText('Share all 10 power to start the day.');
    expect(hint).toBeVisible();
    expect(startBtn()).toHaveAttribute('aria-describedby', hint.id);
  });

  it('uses the sol hint and button on Mars', () => {
    setup(EMPTY, { site: 'mars' });
    expect(screen.getByText('Share all 10 power to start the sol.')).toBeInTheDocument();
    expect(startBtn('Start sol 3')).toBeDisabled();
  });

  it('shows the heading, the steps and the new names', () => {
    setup();
    expect(screen.getByRole('heading', { name: '2. Share your 10 power' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3. Start the day' })).toBeInTheDocument();
    expect(screen.queryByText(/Life support|Shielding|Power reserve/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Game dose|If you run this plan/)).not.toBeInTheDocument();
  });

  it('enables Start and drops the hint once all 10 are shared', async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole('button', { name: DAY.presets.balanced }));
    expect(pool()).toHaveTextContent('Power left to share: 0');
    expect(startBtn()).toBeEnabled();
    expect(startBtn()).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Share all 10 power to start the day.')).not.toBeInTheDocument();
    await user.click(startBtn());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not call onConfirm while the plan is incomplete', async () => {
    const { user, onConfirm } = setup({ life: 4, shield: 3, science: 2 });
    expect(pool()).toHaveTextContent('Power left to share: 1');
    await user.click(startBtn());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('plus takes from the pool, minus gives back, and + is disabled only at pool 0', async () => {
    const { user } = setup(BALANCED);
    expect(plus(SCIENCE)).toBeDisabled();
    await user.click(minus(SHIELDS));
    expect(pool()).toHaveTextContent('Power left to share: 1');
    expect(slider(SHIELDS)).toHaveValue('2');
    expect(plus(SCIENCE)).toBeEnabled();
    await user.click(plus(SCIENCE));
    expect(slider(SCIENCE)).toHaveValue('4');
    expect(pool()).toHaveTextContent('Power left to share: 0');
  });

  it('minus is disabled when the system has 0 units', () => {
    setup({ life: 10, shield: 0, science: 0 });
    expect(minus(SHIELDS)).toBeDisabled();
    expect(minus(AIR)).toBeEnabled();
  });

  it('calls onChange on every change, with any sum', async () => {
    const { user, onChange } = setup();
    await user.click(plus(AIR));
    expect(onChange).toHaveBeenLastCalledWith({ life: 1, shield: 0, science: 0 });
    await user.click(plus(SHIELDS));
    await user.click(plus(SHIELDS));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith({ life: 1, shield: 2, science: 0 });
    await user.click(minus(AIR));
    expect(onChange).toHaveBeenLastCalledWith({ life: 0, shield: 2, science: 0 });
    for (const call of onChange.mock.calls) expect(sum(call[0])).toBeLessThanOrEqual(10);
  });

  it('slider moves clamp to the pool and return units when dragged down', () => {
    const { onChange } = setup(BALANCED);
    fireEvent.change(slider(AIR), { target: { value: '1' } });
    expect(pool()).toHaveTextContent('Power left to share: 3');
    expect(onChange).toHaveBeenLastCalledWith({ life: 1, shield: 3, science: 3 });
    fireEvent.change(slider(SCIENCE), { target: { value: '10' } });
    // science had 3 and the pool had 3, so it can reach 6 at most
    expect(slider(SCIENCE)).toHaveValue('6');
    expect(pool()).toHaveTextContent('Power left to share: 0');
    expect(onChange).toHaveBeenLastCalledWith({ life: 1, shield: 3, science: 6 });
  });

  it('a slider cannot take units when the pool is empty', () => {
    const { onChange } = setup(BALANCED);
    fireEvent.change(slider(AIR), { target: { value: '9' } });
    expect(slider(AIR)).toHaveValue('4');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('arrow keys on a slider are handled natively (change events apply)', () => {
    setup(BALANCED);
    slider(SHIELDS).focus();
    expect(slider(SHIELDS)).toHaveFocus();
    fireEvent.change(slider(SHIELDS), { target: { value: '2' } });
    expect(pool()).toHaveTextContent('Power left to share: 1');
  });

  it('keeps keyboard focus when the + button becomes disabled', async () => {
    const { user } = setup({ life: 4, shield: 3, science: 2 });
    plus(SCIENCE).focus();
    await user.keyboard('{Enter}');
    expect(pool()).toHaveTextContent('Power left to share: 0');
    expect(plus(SCIENCE)).toBeDisabled();
    expect(slider(SCIENCE)).toHaveFocus();
  });

  it('keeps keyboard focus when the - button becomes disabled', async () => {
    const { user } = setup({ life: 4, shield: 3, science: 1 });
    minus(SCIENCE).focus();
    await user.keyboard('{Enter}');
    expect(minus(SCIENCE)).toBeDisabled();
    expect(slider(SCIENCE)).toHaveFocus();
  });

  it('presets fill their plans from PRESETS and report them', async () => {
    const { user, onChange } = setup();
    expect(screen.getByText(DAY.presetsLabel)).toBeInTheDocument();
    for (const [id, label] of [
      ['balanced', DAY.presets.balanced],
      ['storm', DAY.presets.storm],
      ['science', DAY.presets.science],
    ]) {
      await user.click(screen.getByRole('button', { name: label }));
      expect(onChange).toHaveBeenLastCalledWith(PRESETS[id]);
      expect(slider(AIR)).toHaveValue(String(PRESETS[id].life));
      expect(slider(SHIELDS)).toHaveValue(String(PRESETS[id].shield));
      expect(slider(SCIENCE)).toHaveValue(String(PRESETS[id].science));
      expect(startBtn()).toBeEnabled();
    }
  });

  it('Clear empties everything, reports it and disables Start', async () => {
    const { user, onChange } = setup(BALANCED);
    await user.click(screen.getByRole('button', { name: DAY.reset }));
    expect(onChange).toHaveBeenLastCalledWith(EMPTY);
    expect(pool()).toHaveTextContent('Power left to share: 10');
    expect(startBtn()).toBeDisabled();
  });

  it('follows the value prop (the parent owns the draft)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PowerAllocator value={EMPTY} onChange={onChange} onConfirm={() => {}} day={3} />);
    rerender(
      <PowerAllocator value={{ life: 2, shield: 5, science: 3 }} onChange={onChange} onConfirm={() => {}} day={4} />,
    );
    expect(slider(AIR)).toHaveValue('2');
    expect(slider(SHIELDS)).toHaveValue('5');
    expect(startBtn('Start day 4')).toBeEnabled();
  });

  it('disables every control when disabled', () => {
    setup(BALANCED, { disabled: true });
    expect(startBtn()).toBeDisabled();
    expect(slider(AIR)).toBeDisabled();
    expect(minus(AIR)).toBeDisabled();
    expect(plus(AIR)).toBeDisabled();
    expect(screen.getByRole('button', { name: DAY.reset })).toBeDisabled();
    expect(screen.getByRole('button', { name: DAY.presets.balanced })).toBeDisabled();
  });

  it('labels each system with a name, a one-line blurb and an aria-hidden icon', () => {
    const { container } = setup();
    expect(screen.getByText('Air, water and food. Give it at least 4 power a day.')).toBeInTheDocument();
    expect(screen.getByText('Blocks radiation from solar storms.')).toBeInTheDocument();
    expect(screen.getByText('Earns science points. Points help you win.')).toBeInTheDocument();
    const icons = container.querySelectorAll('svg.pa-icon');
    expect(icons).toHaveLength(3);
    icons.forEach((i) => expect(i).toHaveAttribute('aria-hidden', 'true'));
    expect(screen.getByText(AIR)).toBeInTheDocument();
    expect(screen.getByText(SCIENCE)).toBeInTheDocument();
  });

  it('makes Shields an inline glossary word', async () => {
    const { user } = setup();
    const term = screen.getByRole('button', { name: /^Shields/ });
    expect(term).toHaveAttribute('aria-expanded', 'false');
    await user.click(term);
    expect(term).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Shielding' })).toBeInTheDocument();
  });

  it('announces the pool politely', () => {
    setup();
    expect(pool()).toHaveAttribute('aria-live', 'polite');
  });
});
