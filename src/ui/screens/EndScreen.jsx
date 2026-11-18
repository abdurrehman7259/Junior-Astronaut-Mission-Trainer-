import { siteOf } from '../../shared/eventSet.js';
import { SITES } from '../../shared/sites.js';
import { dayWordCap } from '../../app/state.js';
import { isStubEvent } from '../../app/stub-events.js';
import { lessonFor, lossReason } from '../../app/verdict.js';
import { ScreenHeading } from '../components/ScreenHeading.jsx';
import { Meters } from '../components/Meters.jsx';
import { formatRealDate, kindWordFor, SEVERITY_WORDS } from '../components/EventCard.jsx';
import { END, EVENT, NAMES, START_END } from '../content/copy.js';

const LEARN_TEXT = {
  air: END.learnAir,
  storm: END.learnStorm,
  calm: END.learnCalm,
  mars: END.learnMars,
  battery: END.learnBattery,
  good: END.learnGood,
};

function HealthChange({ delta }) {
  const up = delta > 0;
  const arrow = delta === 0 ? '●' : up ? '▲' : '▼';
  const spoken =
    delta === 0 ? START_END.healthNone : up ? START_END.healthUp(delta) : START_END.healthDown(Math.abs(delta));
  return (
    <span className={`debrief-health${delta === 0 ? '' : up ? ' is-up' : ' is-down'}`}>
      <span aria-hidden="true">
        {NAMES.crew} {arrow} {Math.abs(delta)}
      </span>
      <span className="visually-hidden">{spoken}</span>
    </span>
  );
}

/** Mission debrief (US-06, FR-09, FR-10; usability P8). */
export function EndScreen({ game, crewName, onPlayAgain, fact = null }) {
  const won = game.status === 'won';
  const site = siteOf(game);
  const dayWord = SITES[site].dayWord;
  const Word = dayWordCap(site);
  const why = won
    ? END.wonWhy(crewName, game.history.length, dayWord)
    : lossReason(game.history.at(-1)) === 'crew'
      ? END.lostWhyCrew
      : END.lostWhyAir;

  return (
    <section className="end-screen">
      <div className="end-summary stack">
        <ScreenHeading>{won ? END.wonTitle : END.lostTitleOn(dayWord, game.history.length)}</ScreenHeading>
        <p className="end-outcome">{why}</p>
        {!won && <p className="end-rescue">{END.lostRescue}</p>}

        <p className="end-score">
          <span className="end-score-number" aria-hidden="true">
            {NAMES.science} ★ {game.scienceScore}
          </span>
          <span className="visually-hidden">
            {END.scoreLabel}: {game.scienceScore}
          </span>
          <span className="end-rating">{END.scoreRating(game.scienceScore)}</span>
        </p>

        <div className="end-learned">
          <h2>{END.learnedTitle}</h2>
          <p className="debrief-tip">{LEARN_TEXT[lessonFor(game.history, site)]}</p>
        </div>

        <div className="stack end-actions">
          <button type="button" className="btn btn-primary btn-large" onClick={onPlayAgain}>
            {END.playAgain}
          </button>
          <p className="debrief-meta">{END.playAgainNote}</p>
        </div>

        <div className="card stack end-meters">
          <Meters meters={game.meters} scienceScore={game.scienceScore} />
        </div>
      </div>

      <div className="card stack end-timeline">
        <h2>{END.timelineTitle}</h2>
        <ol className="debrief-list" aria-label={START_END.timelineAria(Word, dayWord)}>
          {game.history.map((r) => {
            const stub = isStubEvent(r.event);
            const { life, shield, science } = r.allocation;
            return (
              <li key={r.day} className="debrief-row">
                <p className="debrief-title">
                  <strong>
                    {Word} {r.day}
                  </strong>
                  <span>{kindWordFor(r.event.kind, dayWord)}</span>
                </p>
                <p className="debrief-meta">
                  {formatRealDate(r.event.realDate)}
                  {stub ? ` ${START_END.placeholder}` : ''} · {EVENT.stormSize} {SEVERITY_WORDS[r.event.severity]}
                </p>
                <p className="debrief-meta">{END.plan(life, shield, science)}</p>
                <p className="debrief-meta">
                  <HealthChange delta={r.deltas.crewHealth} />
                </p>
                {!stub && (
                  <a className="debrief-link" href={r.event.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {END.nasaLink}
                    <span className="visually-hidden">{START_END.opensNewTab}</span>
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {fact && (
        <div className="card stack debrief-fact end-fact">
          <p className="debrief-label">{END.factLabel}</p>
          <h2>{END.factTitle}</h2>
          <p>{fact.text}</p>
          <p className="debrief-meta debrief-study">
            {START_END.studyLabel} {fact.studyTitle}
          </p>
          <a className="debrief-link" href={fact.osdrUrl} target="_blank" rel="noopener noreferrer">
            {END.factLink}
            <span className="visually-hidden">{START_END.opensNewTab}</span>
          </a>
        </div>
      )}
    </section>
  );
}
