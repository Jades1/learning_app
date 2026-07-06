import { MAX_RUNG, rungName } from './scaffold';

/** Visual `▮▮▯▯▯` of how much scaffolding the learner has pulled — this IS the grade
 *  signal, not decoration (more help => weaker memory => sooner review). */
export function SupportMeter({ rung }: { rung: number }) {
  return (
    <div className="support-meter" title="How much help you've used">
      {Array.from({ length: MAX_RUNG }, (_, i) => (
        <span key={i} className={`support-cell ${i < rung ? 'filled' : ''}`} />
      ))}
      <span className="support-meter__caption">{rungName(rung)}</span>
    </div>
  );
}
