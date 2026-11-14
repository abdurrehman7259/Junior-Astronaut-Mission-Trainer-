import type { ReactNode } from 'react';
import type { Meters as MeterValues } from '../../shared/types';
import { BatteryIcon, FlaskIcon, HeartIcon, LeafIcon, WarningIcon } from './icons';
import './Meters.css';

export interface MetersProps {
  meters: MeterValues;
  scienceScore: number;
  /** Optional change since yesterday, to show small ▲/▼ chips. */
  deltas?: MeterValues & { science?: number };
}

/** A meter at or below this shows "Low!". */
export const LOW_THRESHOLD = 30;
/** A meter at or below this shows "Danger!". */
export const CRITICAL_THRESHOLD = 15;

const MINUS = '−';

function DeltaChip({ delta }: { delta: number | undefined }) {
  if (delta === undefined) return null;
  if (delta === 0) {
    return (
      <span className="delta-chip delta-same">
        <span aria-hidden="true">● 0</span>
        <span className="visually-hidden">no change</span>
      </span>
    );
  }
  const amount = Math.abs(delta);
  const up = delta > 0;
  return (
    <span className={`delta-chip ${up ? 'delta-up' : 'delta-down'}`}>
      <span aria-hidden="true">{`${up ? '▲ +' : `▼ ${MINUS}`}${amount}`}</span>
      <span className="visually-hidden">{`${up ? 'up' : 'down'} ${amount}`}</span>
    </span>
  );
}

interface BarMeterProps {
  className: string;
  icon: ReactNode;
  label: string;
  value: number;
  delta: number | undefined;
}

function BarMeter({ className, icon, label, value, delta }: BarMeterProps) {
  const pct = Math.max(0, Math.min(100, value));
  const critical = value <= CRITICAL_THRESHOLD;
  const low = value <= LOW_THRESHOLD;
  const state = critical ? 'is-critical' : low ? 'is-low' : '';
  return (
    <li className={`meter ${className} ${state}`.trim()}>
      <div className="meter-head">
        <span className="meter-icon">{icon}</span>
        <span className="meter-label">{label}</span>
        <DeltaChip delta={delta} />
      </div>
      <div className="meter-body">
        <span className="meter-number">{value}</span>
        <div
          className="meter-track"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={`${value} out of 100`}
        >
          <div className="meter-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {low && (
        <p className="meter-tag">
          <WarningIcon size={20} />
          <span>{critical ? 'Danger!' : 'Low!'}</span>
        </p>
      )}
    </li>
  );
}

export function Meters({ meters, scienceScore, deltas }: MetersProps) {
  return (
    <div className="meters">
      <ul className="meters-grid" aria-label="Base status">
        <BarMeter
          className="meter-power"
          icon={<BatteryIcon />}
          label="Power reserve"
          value={meters.power}
          delta={deltas?.power}
        />
        <BarMeter
          className="meter-life"
          icon={<LeafIcon />}
          label="Life support"
          value={meters.lifeSupport}
          delta={deltas?.lifeSupport}
        />
        <BarMeter
          className="meter-crew"
          icon={<HeartIcon />}
          label="Crew health"
          value={meters.crewHealth}
          delta={deltas?.crewHealth}
        />
        <li className="meter meter-science">
          <div className="meter-head">
            <span className="meter-icon">
              <FlaskIcon />
            </span>
            <span className="meter-label">Science score</span>
            <DeltaChip delta={deltas?.science} />
          </div>
          <div className="meter-body">
            <span className="meter-number">{scienceScore}</span>
          </div>
        </li>
      </ul>
    </div>
  );
}
