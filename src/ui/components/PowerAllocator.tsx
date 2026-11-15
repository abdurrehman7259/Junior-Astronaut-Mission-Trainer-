import { useRef, type JSX, type ReactNode } from 'react';
import type { Allocation, SiteId, SystemKey } from '../../shared/types';
import { POWER_UNITS_PER_DAY } from '../../shared/types';
import { DAY, NAMES, PRESETS, RULE_LINES } from '../content/copy';
import {
  EMPTY_DRAFT,
  addUnit,
  isComplete,
  poolLeft,
  removeUnit,
  sameAllocation,
  setUnits,
  type Draft,
} from './allocation';
import { GlossaryTerm } from './GlossaryTerm';
import { FlaskIcon, LeafIcon, ShieldIcon, type IconProps } from './icons';
import './PowerAllocator.css';

export interface PowerAllocatorProps {
  /** Controlled draft. May sum to less than 10 (the units not yet shared are "left to share"). */
  value: Allocation;
  /** Called on every change, with any sum from 0 to 10. */
  onChange: (next: Allocation) => void;
  onConfirm: () => void;
  /** For the button label. */
  day: number;
  disabled?: boolean;
  /** Only changes the words ("day" or "sol"). Default "moon". */
  site?: SiteId;
}

interface SystemInfo {
  key: SystemKey;
  name: ReactNode;
  plainName: string;
  blurb: string;
  icon: (p: IconProps) => JSX.Element;
}

const SYSTEMS: readonly SystemInfo[] = [
  { key: 'life', name: NAMES.air, plainName: NAMES.air, blurb: RULE_LINES.air, icon: LeafIcon },
  {
    key: 'shield',
    name: <GlossaryTerm k="shielding">{NAMES.shield}</GlossaryTerm>,
    plainName: NAMES.shield,
    blurb: RULE_LINES.shield,
    icon: ShieldIcon,
  },
  { key: 'science', name: NAMES.science, plainName: NAMES.science, blurb: RULE_LINES.science, icon: FlaskIcon },
];

const PRESET_BUTTONS: readonly { id: keyof typeof PRESETS; label: string }[] = [
  { id: 'balanced', label: DAY.presets.balanced },
  { id: 'storm', label: DAY.presets.storm },
  { id: 'science', label: DAY.presets.science },
];

/**
 * Steps 2 and 3 of the day screen. Renders two siblings: the allocator card and the Start bar.
 * On narrow screens the Start bar is sticky at the bottom of the viewport (see the CSS).
 */
export function PowerAllocator({
  value,
  onChange,
  onConfirm,
  day,
  disabled = false,
  site = 'moon',
}: PowerAllocatorProps): JSX.Element {
  const dayWord = site === 'mars' ? 'sol' : 'day';
  const sliderRefs = useRef<Partial<Record<SystemKey, HTMLInputElement | null>>>({});
  const pool = poolLeft(value);
  const complete = isComplete(value);

  function update(next: Draft) {
    if (sameAllocation(next, value)) return;
    onChange({ life: next.life, shield: next.shield, science: next.science });
  }

  /** A button that is about to become disabled would drop keyboard focus to the page, so move it to the row's slider first. */
  function keepFocus(key: SystemKey, willDisable: boolean) {
    if (willDisable) sliderRefs.current[key]?.focus();
  }

  const startHint = site === 'mars' ? DAY.startHintMars : DAY.startHint;
  const hintShown = !complete;

  return (
    <>
      <section className="pa" aria-labelledby="pa-heading">
        <div className="pa-head">
          <h2 id="pa-heading" className="pa-heading">
            {DAY.step2}
          </h2>
          <p className="pa-pool" aria-live="polite" aria-atomic="true">
            {DAY.powerLeft} <strong className="pa-pool-number">{pool}</strong>
          </p>
        </div>

        <ul className="pa-rows">
          {SYSTEMS.map((s) => {
            const units = value[s.key];
            const Icon = s.icon;
            return (
              <li key={s.key} className={`pa-row pa-row-${s.key}`}>
                <div className="pa-row-head">
                  <Icon className="pa-icon" size={28} />
                  <span className="pa-name">{s.name}</span>
                  <span className="pa-blurb">{s.blurb}</span>
                </div>

                <div className="pa-controls">
                  <button
                    type="button"
                    className="btn btn-secondary pa-step"
                    aria-label={`Remove one unit from ${s.plainName}`}
                    disabled={disabled || units === 0}
                    onClick={() => {
                      keepFocus(s.key, units === 1);
                      update(removeUnit(value, s.key));
                    }}
                  >
                    <span aria-hidden="true">&minus;</span>
                  </button>
                  <input
                    ref={(el) => {
                      sliderRefs.current[s.key] = el;
                    }}
                    type="range"
                    className="pa-slider"
                    min={0}
                    max={POWER_UNITS_PER_DAY}
                    step={1}
                    value={units}
                    disabled={disabled}
                    aria-label={`${s.plainName} units`}
                    aria-valuetext={`${units} of ${POWER_UNITS_PER_DAY} units`}
                    onChange={(e) => update(setUnits(value, s.key, e.currentTarget.valueAsNumber))}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary pa-step"
                    aria-label={`Add one unit to ${s.plainName}`}
                    disabled={disabled || pool === 0}
                    onClick={() => {
                      keepFocus(s.key, pool === 1);
                      update(addUnit(value, s.key));
                    }}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                  <span className="pa-units" aria-hidden="true">
                    {units}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="pa-quick">
          <span className="pa-quick-label" id="pa-quick-label">
            {DAY.presetsLabel}
          </span>
          <div className="pa-quick-buttons" role="group" aria-labelledby="pa-quick-label">
            {PRESET_BUTTONS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn btn-secondary pa-preset"
                disabled={disabled}
                onClick={() => update(PRESETS[p.id])}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-secondary pa-preset"
              disabled={disabled}
              onClick={() => update(EMPTY_DRAFT)}
            >
              {DAY.reset}
            </button>
          </div>
        </div>
      </section>

      <section className="pa-start" aria-labelledby="pa-step3">
        <h2 id="pa-step3" className="pa-step3">
          {DAY.step3(dayWord)}
        </h2>
        {hintShown && (
          <p className="pa-start-hint" id="pa-start-hint">
            {startHint}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary pa-confirm"
          disabled={disabled || !complete}
          aria-describedby={hintShown ? 'pa-start-hint' : undefined}
          onClick={onConfirm}
        >
          {DAY.startButton(dayWord, day)}
        </button>
      </section>
    </>
  );
}
