// The docked study control bar (React Flow Panel, bottom-center). Non-blocking — the graph
// stays visible above it while the due node glows and centers. Hosts the prompt, the
// scaffolding controls + Support meter, and card-type-specific actions. Per-blank
// reconstruction feedback renders on the edges themselves (StudyEdge), not here.
import { Panel } from '@xyflow/react';
import { useStudy } from './StudyContext';
import { useStore } from '../store/store';
import { SupportMeter } from './SupportMeter';
import { formatDue } from './format';
import { cueForRung } from './scaffold';

export function StudyBar() {
  const study = useStudy();
  const lastResult = useStore((s) => s.lastResult);
  const endStudy = useStore((s) => s.endStudy);

  if (!study) return null;

  // Session complete.
  if (!study.active) {
    return (
      <Panel position="bottom-center">
        <div className="study-bar study-bar--done">
          <strong>Session complete</strong>
          {lastResult && (
            <span className="study-bar__muted">
              {' '}
              · last {lastResult.rating}, next {formatDue(lastResult.due)}
            </span>
          )}
          <button className="primary" onClick={endStudy}>
            Back to graph
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel position="bottom-center">
      <div className="study-bar">
        <div className="study-bar__head">
          <span className="study-bar__count">
            Card {study.index + 1} of {study.queueLen}
          </span>
          <button className="ghost" onClick={endStudy}>
            End session
          </button>
        </div>

        {lastResult && (
          <div className={`study-bar__result rating-${lastResult.rating}`}>
            Graded <strong>{lastResult.rating}</strong> · next review{' '}
            {formatDue(lastResult.due)}
          </div>
        )}

        <SupportMeter rung={study.rung} />

        {study.kind === 'connections' ? <ReconControls /> : <BodyControls />}
      </div>
    </Panel>
  );
}

function ReconControls() {
  const study = useStudy()!;
  const { task } = study;
  const filled = task ? task.blanks.filter((b) => study.valueFor(b.edgeId).trim() !== '').length : 0;

  if (study.reconPhase === 'attempt') {
    return (
      <>
        <p className="study-bar__prompt">
          Rebuild the connections of <strong>{study.node?.label}</strong> — fill the blanks on
          the edges. ({filled}/{task?.blanks.length ?? 0})
          {task?.sampled && <> Showing {task.blanks.length} of {task.totalIncident}.</>}
        </p>
        <div className="study-bar__actions">
          <button className="primary" onClick={study.submitRecon}>
            Submit
          </button>
          <button onClick={study.requestHint} disabled={!study.canHint}>
            Need a hint
          </button>
          <button className="ghost" onClick={study.revealRecon}>
            Reveal answers
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="study-bar__prompt">
        {study.reconRevealed ? (
          <>Revealed — counts as <strong>Again</strong>.</>
        ) : (
          <>
            <strong>{Math.round(study.correctness * 100)}%</strong> correct. Tap “same” on any
            edge whose wording you feel matches.
          </>
        )}
      </p>
      <div className="study-bar__actions">
        <button className="primary" onClick={() => study.finish(study.reconRevealed ? 'revealed' : 'success')}>
          Finish review
        </button>
      </div>
    </>
  );
}

function BodyControls() {
  const study = useStudy()!;

  if (study.bodyPhase === 'attempt') {
    return (
      <>
        <p className="study-bar__prompt">
          Recall: <strong>{study.node?.label}</strong>
        </p>
        {study.rung > 0 && (
          <div className="study-bar__cue" aria-label="hint">
            {cueForRung(study.bodyText, study.rung)}
          </div>
        )}
        {study.inputMode === 'typed' ? (
          <>
            <textarea
              className="study-bar__input"
              rows={2}
              autoFocus
              value={study.typed}
              placeholder="Type what you recall…"
              onChange={(e) => study.setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) study.submitTyped();
              }}
            />
            {study.match && !study.match.pass && (
              <p className="study-bar__nomatch">
                Not a close match ({Math.round(study.match.score * 100)}%). Try again, hint, or
                reveal.
              </p>
            )}
            <div className="study-bar__actions">
              <button className="primary" onClick={study.submitTyped} disabled={!study.typed.trim()}>
                Submit
              </button>
              <button onClick={study.requestHint} disabled={!study.canHint}>
                Need a hint
              </button>
              <button className="ghost" onClick={study.revealBodyAnswer}>
                Reveal answer
              </button>
            </div>
          </>
        ) : (
          <div className="study-bar__actions">
            <button className="primary" onClick={study.revealBodyAnswer}>
              Reveal &amp; check
            </button>
            <button onClick={study.requestHint} disabled={!study.canHint}>
              Need a hint
            </button>
          </div>
        )}
      </>
    );
  }

  // reveal phase
  return (
    <>
      <div className="study-bar__answer">
        <span className="study-bar__answer-label">Answer</span>
        <div className="study-bar__answer-text">{study.bodyText || <em>(none)</em>}</div>
      </div>
      {study.bodyGaveUp ? (
        <div className="study-bar__actions">
          <button className="primary" onClick={() => study.finish('success', true)}>
            I was actually right
          </button>
          <button className="danger" onClick={() => study.finish('revealed')}>
            I didn't have it
          </button>
        </div>
      ) : (
        <div className="study-bar__actions">
          <button className="primary" onClick={() => study.finish('success')}>
            I had it
          </button>
          <button className="danger" onClick={() => study.finish('fail')}>
            I missed it
          </button>
        </div>
      )}
    </>
  );
}
