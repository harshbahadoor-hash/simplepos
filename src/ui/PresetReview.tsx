import type { PresetChange } from '../presets/editor';
import { sound } from '../sound/sound-manager';

const names: Record<PresetChange['kind'], string> = {
  add: 'Added', delete: 'Deleted', label: 'Name', price: 'Price', visibility: 'Visibility',
};

export function PresetReview({ changes, validationError, acknowledged, acknowledge, busy }: {
  changes: PresetChange[]; validationError: string; acknowledged: boolean;
  acknowledge: (checked: boolean) => void; busy: boolean;
}) {
  const significant = changes.some(change => change.significant);
  return <div className="pm-review">
    <h3>Review changes</h3>
    <p>Publishing shares these presets automatically with the laptop and tablet. Publishing is unrestricted; anyone with access can change shared presets.</p>
    {validationError && <p className="pm-warning" role="alert">{validationError} Return to editing to finish your draft.</p>}
    <ul className="pm-changes" aria-label="Preset changes">
      {changes.map(change => <li key={`${change.key}-${change.kind}`} className={change.significant ? 'pm-significant' : undefined}>
        <strong>{change.path}</strong>
        <span>{names[change.kind]}: {change.before && <span>{change.before}</span>}
          {change.before && change.after && ' → '}{change.after && <span>{change.after}</span>}</span>
        {change.significant && <span className="pm-hint">Large price change: at least 50% or Rs 500.</span>}
      </li>)}
    </ul>
    {significant && <label className="pm-checkbox">
      <input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => { sound.playTap(); acknowledge(event.target.checked); }} />
      I have checked the large price changes
    </label>}
  </div>;
}
