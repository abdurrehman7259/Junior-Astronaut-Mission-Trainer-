import { useState, type JSX, type ReactNode } from 'react';
import type { Allocation, MeterKey, SiteId, SystemKey, TurnResult } from '../../shared/types';
import { POWER_UNITS_PER_DAY } from '../../shared/types';
import {
  BALANCED_DRAFT,
  EMPTY_DRAFT,
  addUnit,
  isComplete,
  poolLeft,
  removeUnit,
  sameAllocation,
  setUnits,
  type Draft,
} from './allocation';
import './PowerAllocator.css';

export interface PowerAllocatorProps {
  /** Controlled; always valid (sums to 10). */
  value: Allocation;
  /** Called only with valid allocations (pool is 0). */
  onChange: (next: Allocation) => void;
  /** engine.previewTurn(game, value), computed by the parent. */
  preview: TurnResult | null;
  onConfirm: () => void;
  /** For the button label. */
  day: number;
  disabled?: boolean;
  /** On Mars the preview assumes a calm Sun, because the storm warning arrives a sol late. Default "moon". */
  site?: SiteId;
}

interface SystemInfo {
  key: SystemKey;
  name: string;
  blurb: string;
  icon: () => JSX.Element;
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="pa-icon"
      viewBox="0 0 32 32"
      width="32"
      height="32"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Leaf. */
function LifeIcon() {
  return (
    <Svg>
      <path d="M6 26C6 12 14 6 27 5C27 18 21 26 8 26" />
      <path d="M6 26L18 14" />
    </Svg>
  );
}

/** Shield. */
function ShieldIcon() {
  return (
    <Svg>
      <path d="M16 4L26 8V16C26 22 21 26 16 28C11 26 6 22 6 16V8Z" />
      <path d="M16 10V22" />
    </Svg>
  );
}

/** Flask. */
function ScienceIcon() {
  return (
    <Svg>
      <path d="M12 4H20" />
      <path d="M13 4V13L6 25C5 27 6 28 8 28H24C26 28 27 27 26 25L19 13V4" />
      <path d="M10 21H22" />
    </Svg>
  );
}

const SYSTEMS: readonly SystemInfo[] = [
  { key: 'life', name: 'Life support', blurb: 'Air, water and food for the crew.', icon: LifeIcon },
  {
    key: 'shield',
    name: 'Shielding',
    blurb: 'Protects the crew from solar radiation.',
    icon: ShieldIcon,
  },
  {
    key: 'science',
    name: 'Science',
    blurb: 'Experiments that earn science points.',
    icon: ScienceIcon,
  },
];

const METER_ROWS: readonly { key: MeterKey; name: string }[] = [
  { key: 'power', name: 'Power reserve' },
  { key: 'lifeSupport', name: 'Life support' },
  { key: 'crewHealth', name: 'Crew health' },
];

/** "+9", "−8" (true minus sign), or "0". */
function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

function trend(n: number): { arrow: string; word: string } {
  if (n > 0) return { arrow: '▲', word: 'up' };
  if (n < 0) return { arrow: '▼', word: 'down' };
  return { arrow: '●', word: 'no change' };
}

function PreviewRow({ name, delta, after }: { name: string; delta: number; after: number }) {
  const t = trend(delta);
  return (
    <li className="pa-preview-row">
      <span className="pa-preview-name">{name}</span>{' '}
      <span className="pa-preview-change">
        <span aria-hidden="true">{t.arrow}</span>
        <span className="visually-hidden"> {t.word}</span> {signed(delta)}
      </span>{' '}
      <span className="pa-preview-after">(to {after})</span>
    </li>
  );
}

function PreviewPanel({ preview, site }: { preview: TurnResult; site: SiteId }) {
  const { deltas, after, dose, explanations } = preview;
  return (
    <>
      <h3 className="pa-preview-title">{site === 'mars' ? 'If the Sun stays calm:' : 'If you run this plan:'}</h3>
      <ul className="pa-preview-list">
        {METER_ROWS.map((m) => (
          <PreviewRow key={m.key} name={m.name} delta={deltas[m.key]} after={after[m.key]} />
        ))}
        <PreviewRow
          name="Science"
          delta={preview.scienceGained}
          after={preview.scienceAfter}
        />
      </ul>
      {dose.received > 0 && (
        <p className="pa-dose">Radiation reaching the crew: {dose.received}</p>
      )}
      {site === 'mars' && <p className="pa-preview-warn">Storms could make this worse.</p>}
      <ul className="pa-explain">
        <li>{explanations.power}</li>
        <li>{explanations.lifeSupport}</li>
        <li>{explanations.crewHealth}</li>
        <li>{explanations.science}</li>
      </ul>
    </>
  );
}

export function PowerAllocator({
  value,
  onChange,
  preview,
  onConfirm,
  day,
  disabled = false,
  site = 'moon',
}: PowerAllocatorProps): JSX.Element {
  const [draft, setDraft] = useState<Draft>(value);
  const [seenValue, setSeenValue] = useState<Allocation>(value);
  const [seenDay, setSeenDay] = useState(day);

  // Sync the draft when the parent's value or the day changes.
  let current = draft;
  if (!sameAllocation(value, seenValue) || day !== seenDay) {
    setSeenValue(value);
    setSeenDay(day);
    setDraft(value);
    current = value;
  }

  const pool = poolLeft(current);
  const complete = isComplete(current);

  function update(next: Draft) {
    if (sameAllocation(next, current)) return;
    setDraft(next);
    if (isComplete(next)) {
      onChange({ life: next.life, shield: next.shield, science: next.science });
    }
  }

  return (
    <section className="pa" aria-labelledby="pa-heading">
      <h2 id="pa-heading" className="pa-heading">
        Share your power
      </h2>

      <p className="pa-pool" aria-live="polite" aria-atomic="true">
        Power left to share: <strong className="pa-pool-number">{pool}</strong>
      </p>

      <ul className="pa-rows">
        {SYSTEMS.map((s) => {
          const units = current[s.key];
          const Icon = s.icon;
          return (
            <li key={s.key} className={`pa-row pa-row-${s.key}`}>
              <div className="pa-row-head">
                <Icon />
                <div className="pa-row-text">
                  <span className="pa-name">{s.name}</span>
                  <span className="pa-blurb">{s.blurb}</span>
                </div>
                <span className="pa-units" aria-hidden="true">
                  {units}
                </span>
              </div>

              <div className="pa-cells" aria-hidden="true">
                {Array.from({ length: POWER_UNITS_PER_DAY }, (_, i) => (
                  <span key={i} className={i < units ? 'pa-cell pa-cell-on' : 'pa-cell'} />
                ))}
              </div>

              <div className="pa-controls">
                <button
                  type="button"
                  className="btn btn-secondary pa-step"
                  aria-label={`Remove one unit from ${s.name}`}
                  disabled={disabled || units === 0}
                  onClick={() => update(removeUnit(current, s.key))}
                >
                  <span aria-hidden="true">&minus;</span>
                </button>
                <input
                  type="range"
                  className="pa-slider"
                  min={0}
                  max={POWER_UNITS_PER_DAY}
                  step={1}
                  value={units}
                  disabled={disabled}
                  aria-label={`${s.name} units`}
                  aria-valuetext={`${units} of ${POWER_UNITS_PER_DAY} units`}
                  onChange={(e) => update(setUnits(current, s.key, e.currentTarget.valueAsNumber))}
                />
                <button
                  type="button"
                  className="btn btn-secondary pa-step"
                  aria-label={`Add one unit to ${s.name}`}
                  disabled={disabled || pool === 0}
                  onClick={() => update(addUnit(current, s.key))}
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="pa-quick">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() => update(BALANCED_DRAFT)}
        >
          Balanced (4/3/3)
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() => update(EMPTY_DRAFT)}
        >
          Reset
        </button>
      </div>

      <div className="pa-preview" aria-live="polite">
        {complete && preview ? (
          <PreviewPanel preview={preview} site={site} />
        ) : (
          <p className="pa-preview-hint">
            {complete ? '' : `Share all ${POWER_UNITS_PER_DAY} units to see what happens.`}
          </p>
        )}
      </div>

      <button
        type="button"
        className="btn btn-primary btn-large pa-confirm"
        disabled={disabled || !complete}
        onClick={onConfirm}
      >
        Run {site === 'mars' ? 'sol' : 'day'} {day}
      </button>
    </section>
  );
}
