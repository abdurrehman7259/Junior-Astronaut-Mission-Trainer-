import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StartScreen } from '../../src/ui/screens/StartScreen';
import { loadCrewName, sanitizeCrewName, saveCrewName } from '../../src/ui/screens/crewName';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('sanitizeCrewName', () => {
  it('strips disallowed characters and caps at 12', () => {
    expect(sanitizeCrewName('Sky<script>!')).toBe('Skyscript');
    expect(sanitizeCrewName('Star-Crew 9 @#$')).toBe('Star-Crew 9 ');
    expect(sanitizeCrewName('a'.repeat(20))).toHaveLength(12);
  });
});

describe('StartScreen', () => {
  it('renders the heading and tagline', () => {
    render(<StartScreen onStart={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Moon Base Cadets' })).toBeInTheDocument();
    expect(screen.getByText('Run a Moon base. Survive real solar storms.')).toBeInTheDocument();
    expect(screen.getByText('Stays on this device only.')).toBeInTheDocument();
  });

  it('offers Continue mission and a New mission button when a save exists', async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} resume={{ day: 4, crewName: 'Nova', onResume }} />);
    expect(screen.queryByRole('button', { name: 'Start mission' })).not.toBeInTheDocument();
    expect(screen.getByText('Crew Nova is waiting at the base.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue mission (Day 4)' }));
    expect(onResume).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'New mission' }));
    expect(onStart).toHaveBeenCalledWith('Cadets', 'moon');
  });

  it('keeps 12 characters of a 20-character name and shows the count', async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={() => {}} />);
    const input = screen.getByLabelText('Crew name (optional)');
    await user.type(input, 'abcdefghijklmnopqrst');
    expect(input).toHaveValue('abcdefghijkl');
    expect(screen.getByText('12/12')).toBeInTheDocument();
  });

  it('strips disallowed characters as you type', async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={() => {}} />);
    const input = screen.getByLabelText('Crew name (optional)');
    await user.type(input, 'A!b@c#-1 ');
    expect(input).toHaveValue('Abc-1 ');
  });

  it('calls onStart with the trimmed name, or Cadets when empty', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const { unmount } = render(<StartScreen onStart={onStart} />);
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(onStart).toHaveBeenLastCalledWith('Cadets', 'moon');
    await user.type(screen.getByLabelText('Crew name (optional)'), '  Moon-9 ');
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(onStart).toHaveBeenLastCalledWith('Moon-9', 'moon');
    unmount();
  });

  it('starts when Enter is pressed in the field', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    await user.type(screen.getByLabelText('Crew name (optional)'), 'Nova{Enter}');
    expect(onStart).toHaveBeenCalledWith('Nova', 'moon');
  });

  it('saves the name and loads it next time', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<StartScreen onStart={() => {}} />);
    await user.type(screen.getByLabelText('Crew name (optional)'), 'Nova');
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(localStorage.getItem('mbc.crewName')).toBe('Nova');
    expect(loadCrewName()).toBe('Nova');
    unmount();
    render(<StartScreen onStart={() => {}} />);
    expect(screen.getByLabelText('Crew name (optional)')).toHaveValue('Nova');
  });

  it('still works when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadCrewName()).toBe('');
    expect(() => saveCrewName('x')).not.toThrow();
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(onStart).toHaveBeenCalledWith('Cadets', 'moon');
  });
});
