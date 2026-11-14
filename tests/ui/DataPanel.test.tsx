import { render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { DataPanel, buildDataSources } from '../../src/ui/components/DataPanel';
import { LiveBanner } from '../../src/ui/components/LiveBanner';
import type { DoseCalibration, ScienceFact, Snapshot, SolarEvent } from '../../src/shared/types';

const osdr: Snapshot<ScienceFact> = {
  retrievedAt: '2026-11-14T08:51:28Z',
  source: 'NASA OSDR',
  sourceUrl: 'https://osdr.nasa.gov/bio/',
  items: [],
};
const radlab: DoseCalibration = {
  issDoseRateMicroGyPerDay: 631,
  retrievedAt: '2026-11-14T08:25:58Z',
  note: 'x',
  source: 'NASA RadLab',
  sourceUrl: 'https://visualization.osdr.nasa.gov/radlab/api/',
};
const ev = (kind: SolarEvent['kind'], severity: SolarEvent['severity'], realDate: string): SolarEvent => ({
  id: `${kind}-${realDate}`,
  source: 'DONKI',
  kind,
  realDate,
  severity,
  kidText: 'x',
  sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
});

describe('buildDataSources', () => {
  it('lists archived sources with labels', () => {
    const s = buildDataSources({ retrievedAt: '2026-11-14T08:14:30Z', isPlaceholder: false, osdr, radlab });
    expect(s.map((e) => e.id)).toEqual(['donki', 'osdr', 'radlab', 'rules']);
    expect(s[0]?.status).toBe('Archived (retrieved 2026-11-14)');
    expect(s[0]?.extra).toBeUndefined();
    expect(s[1]?.status).toBe('Archived (retrieved 2026-11-14)');
    expect(s[3]?.url).toBeUndefined();
  });

  it('flags placeholder mode and adds the live line when live', () => {
    const s = buildDataSources({
      retrievedAt: null,
      isPlaceholder: true,
      live: { status: 'live', data: { live: true, fetchedAt: '2026-11-14T10:30:00Z', events: [] } },
    });
    expect(s[0]?.status).toBe('Placeholder (not real data)');
    expect(s[0]?.extra).toContain('checked 10:30');
  });

  it('says Not loaded for null OSDR and RadLab', () => {
    const s = buildDataSources({ retrievedAt: null, isPlaceholder: false, osdr: null, radlab: null });
    expect(s[1]?.status).toBe('Not loaded');
    expect(s[2]?.status).toBe('Not loaded');
  });

  it('never shows the RadLab dose-rate number or unit (D-019)', () => {
    const s = buildDataSources({ retrievedAt: null, isPlaceholder: false, radlab });
    expect(JSON.stringify(s)).not.toMatch(/631|µGy/);
  });
});

describe('DataPanel', () => {
  it('renders title, intro, safe links and no dose number', () => {
    render(
      <DataPanel
        open
        onClose={() => {}}
        retrievedAt="2026-11-14T08:14:30Z"
        isPlaceholder={false}
        osdr={osdr}
        radlab={radlab}
        returnFocusRef={createRef()}
      />,
    );
    const dlg = screen.getByRole('dialog', { name: 'Data used' });
    expect(within(dlg).getByText(/Everything real in this game comes from NASA/)).toBeInTheDocument();
    const links = within(dlg).getAllByRole('link');
    // 3 source links + the citation for the RadLab note (fact-check #15).
    expect(links).toHaveLength(4);
    expect(within(dlg).getByRole('link', { name: /NASA Apollo radiation page/ })).toHaveAttribute('href', expect.stringContaining('nasa.gov'));
    for (const l of links) {
      expect(l).toHaveAttribute('target', '_blank');
      expect(l).toHaveAttribute('rel', 'noopener noreferrer');
      expect(l.textContent).toContain('(opens in a new tab)');
    }
    expect(dlg.textContent).not.toMatch(/631|µGy/);
  });
});

describe('LiveBanner', () => {
  it('shows live count and strongest event', () => {
    const data = {
      live: true as const,
      fetchedAt: '2026-11-14T10:30:00Z',
      events: [ev('FLR', 1, '2026-11-10'), ev('CME', 3, '2026-11-12')],
    };
    render(<LiveBanner live={{ status: 'live', data }} retrievedAt="2026-11-14T08:14:30Z" />);
    expect(
      screen.getByText(/Live from NASA: 2 solar events in the last 7 days\. Strongest: Solar storm cloud \(CME\) on 12 November 2026\./),
    ).toBeInTheDocument();
    expect(screen.getByText('Live (checked 10:30 UTC)')).toBeInTheDocument();
  });

  it('shows the calm text with zero events', () => {
    const data = { live: true as const, fetchedAt: '2026-11-14T10:30:00Z', events: [] };
    render(<LiveBanner live={{ status: 'live', data }} retrievedAt={null} />);
    expect(screen.getByText('Live from NASA: the Sun has been calm this week.')).toBeInTheDocument();
  });

  it('archived never says "Live from" and never labels itself live', () => {
    const { container } = render(<LiveBanner live={{ status: 'archived' }} retrievedAt="2026-11-14T08:14:30Z" />);
    expect(screen.getByText(/archived NASA records \(retrieved 2026-11-14\)/)).toBeInTheDocument();
    expect(screen.getByText('Archived (retrieved 2026-11-14)')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Live from/);
    expect(container.textContent).not.toMatch(/Live \(/);
  });

  it('renders nothing while loading', () => {
    const { container } = render(<LiveBanner live={{ status: 'loading' }} retrievedAt={null} />);
    expect(container.textContent).toBe('');
  });
});

describe('Mars DONKI wording follows marsImpact', () => {
  const m = (impact: 'listed' | 'game-only'): SolarEvent => ({ ...ev('CME', 2, '2024-03-01'), marsImpact: impact });
  const useOf = (events: SolarEvent[]) =>
    buildDataSources({
      retrievedAt: null,
      isPlaceholder: false,
      mars: { retrievedAt: '2026-11-14T08:00:00Z', site: null, events },
    }).find((s) => s.id === 'donki-mars')!.use;

  it('all listed', () => {
    expect(useOf([m('listed'), m('listed')])).toBe("Real CMEs that NASA's space-weather model predicted would reach Mars.");
  });
  it('mixed', () => {
    expect(useOf([m('listed'), m('game-only')])).toContain('Some are real storms that, in this game, also reach Mars.');
  });
  it('all game-only', () => {
    expect(useOf([m('game-only')])).toBe('Real storms recorded by NASA. In this game, they also reach Mars.');
  });
});
