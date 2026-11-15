import { useId, type ReactNode } from 'react';
import type { Meters as MeterValues } from '../../shared/types';
import { METERS_COPY, NAMES, RULE_LINES } from '../content/copy';
import { BatteryIcon, FlaskIcon, HeartIcon, LeafIcon, WarningIcon } from './icons';
import './Meters.css';

export interface MetersProps {
  meters: MeterValues;
  scienceScore: number;
  /** Optional change since yesterday, to show small ▲/▼ chips. */
  deltas?: MeterValues & { science?: number };
  /** The change if the player starts the day. Shown as dashed ▲/▼ chips under `previewLabel`. */
  preview?: (MeterValues & { science: number }) | null;
  /** Small line above the meters when a preview is shown, e.g. "If you start this day:". */
  previewLabel?: string;
  /** Show the one-line battery rule (RULE_LINES.battery). */
  showRules?: boolean;
}

/** A meter at or below this shows "Low!". */
export const LOW_THRESHOLD = 30;
/** A meter at or below this shows "Danger!". */
export const CRITICAL_THRESHOLD = 15;

const MINUS = '−';

function Chip({ delta, kind }: { delta: number | undefined; kind: 'delta' | 'preview' }) {
  if (delta === undefined) return null;
  const base = kind === 'preview' ? 'delta-chip preview-chip' : 'delta-chip';
  if (delta === 0) {
    return (
      <span className={`${base} delta-same`}>
        <span aria-hidden="true">● 0</span>
        <span className="visually-hidden">{METERS_COPY.noChange}</span>
      </span>
    );
  }
  const amount = Math.abs(delta);
  const up = delta > 0;
  return (
    <span className={`${base} ${up ? 'delta-up' : 'delta-down'}`}>
      <span aria-hidden="true">{`${up ? '▲ +' : `▼ ${MINUS}`}${amount}`}</span>
      <span className="visually-hidden">{`${up ? METERS_COPY.up : METERS_COPY.down} ${amount}`}</span>
    </span>
  );
}

interface BarMeterProps {
  className: string;
  icon: ReactNode;
  label: string;
  value: number;
  delta: number | undefined;
  preview: number | undefined;
  describedBy?: string;
}

function BarMeter({ className, icon, label, value, delta, preview, describedBy }: BarMeterProps) {
  const pct = Math.max(0, Math.min(100, value));
  const critical = value <= CRITICAL_THRESHOLD;
  const low = value <= LOW_THRESHOLD;
  const state = critical ? 'is-critical' : low ? 'is-low' : '';
  return (
    <li className={`meter ${className} ${state}`.trim()}>
      <div className="meter-head">
        <span className="meter-icon">{icon}</span>
        <span className="meter-label">{label}</span>
        {low && (
          <span className="meter-tag">
            <WarningIcon size={18} />
            <span>{critical ? METERS_COPY.danger : METERS_COPY.low}</span>
          </span>
        )}
        <span className="meter-number">{value}</span>
      </div>
      <div className="meter-body">
        <div
          className="meter-track"
          role="meter"
          aria-label={label}
          aria-describedby={describedBy}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={`${value} out of 100`}
        >
          <div className="meter-fill" style={{ width: `${pct}%` }} />
        </div>
        <Chip delta={delta} kind="delta" />
        <Chip delta={preview} kind="preview" />
      </div>
    </li>
  );
}

export function Meters({ meters, scienceScore, deltas, preview = null, previewLabel, showRules = false }: MetersProps) {
  const ruleId = useId();
  const sciencePreview = preview?.science;
  return (
    <div className="meters">
      {preview && previewLabel && <p className="meters-preview-label">{previewLabel}</p>}
      <ul className="meters-grid" aria-label={METERS_COPY.baseStatus}>
        <BarMeter
          className="meter-power"
          icon={<BatteryIcon size={22} />}
          label={NAMES.battery}
          value={meters.power}
          delta={deltas?.power}
          preview={preview?.power}
          describedBy={showRules ? ruleId : undefined}
        />
        <BarMeter
          className="meter-life"
          icon={<LeafIcon size={22} />}
          label={NAMES.air}
          value={meters.lifeSupport}
          delta={deltas?.lifeSupport}
          preview={preview?.lifeSupport}
        />
        <BarMeter
          className="meter-crew"
          icon={<HeartIcon size={22} />}
          label={NAMES.crew}
          value={meters.crewHealth}
          delta={deltas?.crewHealth}
          preview={preview?.crewHealth}
        />
        <li className="meter meter-science">
          <div className="meter-head">
            <span className="meter-icon">
              <FlaskIcon size={22} />
            </span>
            <span className="meter-label">{`${NAMES.scienceScore} ★`}</span>
            <span className="meter-number">{scienceScore}</span>
          </div>
          {(deltas?.science !== undefined || sciencePreview !== undefined) && (
            <div className="meter-body">
              <Chip delta={deltas?.science} kind="delta" />
              <Chip delta={sciencePreview} kind="preview" />
            </div>
          )}
        </li>
      </ul>
      {showRules && (
        <p id={ruleId} className="meters-rule">
          <BatteryIcon size={18} className="meters-rule-icon" />
          <span>{RULE_LINES.battery}</span>
        </p>
      )}
    </div>
  );
}
