import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { findNode, labelFor, nodesAt, validateDocument, type PresetDocument, type PresetNode } from '../presets/model';
import { addNode, editNode, deleteNode, descendantCount, pathToNode, changesBetween, hasChanges, restoreDraft, publicationFingerprint, DRAFT_STORAGE_KEY, type PresetDraft, type PendingPublication } from '../presets/editor';
import { money } from '../domain/pos';
import { sound } from '../sound/sound-manager';
import { Dialog } from './Dialog';
import { PosButton as Button, preventTapThrough } from './PosButton';
import { PresetEditor, type PresetForm } from './PresetEditor';
import { PresetReview } from './PresetReview';
import '../presets/manager.css';

export type PresetManagerProps = {
  document: PresetDocument;
  publish: (document: PresetDocument, expectedRevision: number, requestId: string) => Promise<PresetDocument>;
  checkPublication: (requestId: string) => Promise<PresetDocument | null>;
  close: () => void;
};

type Session = PresetDraft & { storageError: string; restored: boolean };
type Confirmation = 'close' | 'reload' | 'cancel-form' | 'discard-close' | { deleteKey: string } | null;
let cleanupWarning = '';
const messageFor = (error: unknown) => error instanceof Error ? error.message : 'Please try again. Your draft is kept.';
const nodeName = (node: PresetNode) => node.kind === 'item' ? labelFor(node) : node.label;

function startSession(document: PresetDocument): Session {
  const fresh = { base: document, draft: document, storageError: cleanupWarning, restored: false };
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) return { ...restoreDraft(saved), storageError: cleanupWarning, restored: true };
  } catch (error) {
    return { ...fresh, storageError: `Saved draft could not be opened. ${messageFor(error)} Keep this manager open while editing.` };
  }
  return fresh;
}

function rememberDraft(base: PresetDocument, draft: PresetDocument, current?: PresetDocument | null, pending?: PendingPublication): string {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ base, draft, ...(current ? { current } : {}), ...(pending ? { pending } : {}) }));
    return '';
  } catch {
    return 'Your draft could not be saved on this device. Keep this manager open; closing or restarting can lose these edits.';
  }
}

function forgetDraft(): string {
  try { localStorage.removeItem(DRAFT_STORAGE_KEY); cleanupWarning = ''; return ''; }
  catch {
    cleanupWarning = 'Storage cleanup failed; the saved draft may remain on this device. If it reappears next time, discard it explicitly again.';
    return cleanupWarning;
  }
}

function formChanged(form: PresetForm | null): boolean {
  return !!form && (form.label !== form.initialLabel || form.price !== form.initialPrice || form.visible !== form.initialVisible);
}

export function PresetManager({ document, publish, checkPublication, close }: PresetManagerProps) {
  const [session, setSession] = useState(() => startSession(document));
  const [parentKey, setParentKey] = useState<string | null>(null);
  const [form, setForm] = useState<PresetForm | null>(null);
  const [formError, setFormError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(() => session.restored ? 'Saved draft restored. Checkout changes only after publishing.' : '');
  const [review, setReview] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [undo, setUndo] = useState<{ draft: PresetDocument; parentKey: string | null } | null>(null);
  const [staleCurrent, setStaleCurrent] = useState<PresetDocument | null>(() => session.current ?? null);
  const [busy, setBusy] = useState(false);
  const publishing = useRef(false);
  const request = useRef<PendingPublication | null>(session.pending ?? null);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const dirty = hasChanges(session.base, session.draft);
  const unsaved = formChanged(form);
  const closeState = useRef({ dirty, unsaved, close });
  const changes = changesBetween(session.base, session.draft);
  const remote = staleCurrent && staleCurrent.revision > document.revision ? staleCurrent : document;
  // The parent can still expose its older snapshot after an explicit reload.
  // A newer document alone cannot tell whether our request succeeded. Keep its
  // identity until status confirms success or an explicit retry receives 412.
  const pending = session.pending;
  const latest = !pending && remote.revision > session.base.revision ? remote : null;
  const current = parentKey ? findNode(session.draft, parentKey) : undefined;
  const selectedKey = current?.kind === 'group' ? current.key : null;
  const path = selectedKey ? pathToNode(session.draft, selectedKey) : [];
  const selectedRoot = path[0]?.key;
  const rows = nodesAt(session.draft, selectedKey);
  const blocked = busy || !!form || !!confirmation || review;
  const editBlocked = blocked || !!pending;
  const deleting = confirmation && typeof confirmation === 'object' ? findNode(session.draft, confirmation.deleteKey) : undefined;
  const deleteCounts = deleting ? descendantCount(deleting) : null;
  let validationError = '';
  if (review) {
    try { validateDocument(session.draft); }
    catch (problem) { validationError = messageFor(problem); }
  }

  useLayoutEffect(() => {
    // Isolate management keys before Counter's window listener sees Enter/digits.
    const stopCheckout = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) return;
      event.stopPropagation();
    };
    window.document.addEventListener('keydown', stopCheckout);
    return () => window.document.removeEventListener('keydown', stopCheckout);
  }, []);
  useLayoutEffect(() => {
    if (confirmation) confirmationHeading.current?.focus({ preventScroll: true });
    else if (!form) heading.current?.focus({ preventScroll: true });
  }, [selectedKey, confirmation, review, form]);
  useLayoutEffect(() => { closeState.current = { dirty, unsaved, close }; }, [dirty, unsaved, close]);

  const requestClose = useCallback(() => {
    if (publishing.current) return;
    const state = closeState.current;
    if (state.dirty || state.unsaved) setConfirmation('close');
    else state.close();
  }, []);

  const completePublication = useCallback((result: PresetDocument) => {
    const validated = validateDocument(result);
    const published = document.revision > validated.revision ? document : validated;
    // If deletion is blocked, replace the old draft with the confirmed document.
    const removalError = forgetDraft();
    const storageError = removalError ? rememberDraft(published, published) : '';
    request.current = null;
    setSession({ base: published, draft: published, storageError, restored: false });
    setUndo(null); setStaleCurrent(null); setReview(false); setAcknowledged(false); setConfirmation(null); setError('');
    setMessage(`Published revision ${published.revision}. Presets will reach the other device automatically.`);
    sound.playPositive();
  }, [document]);

  useEffect(() => {
    if (!pending || busy) return;
    let active = true;
    // Recovery on opening or receiving a newer revision is read-only. An unknown
    // or unavailable status preserves the draft and never triggers another POST.
    void checkPublication(pending.id).then(result => {
      if (active && !publishing.current && request.current?.id === pending.id && result) completePublication(result);
    }).catch(() => { /* Unconfirmed requests remain available for explicit retry. */ });
    return () => { active = false; };
  }, [pending, busy, checkPublication, completePublication]);

  function fail(problem: unknown, field = false) {
    sound.playError();
    if (field) setFormError(messageFor(problem)); else setError(messageFor(problem));
  }

  function commit(draft: PresetDocument, text: string) {
    setUndo({ draft: session.draft, parentKey: selectedKey });
    const storageError = rememberDraft(session.base, draft, staleCurrent);
    setSession({ ...session, draft, storageError });
    setForm(null); setFormError(''); setError(''); setMessage(text); setAcknowledged(false);
    return storageError;
  }

  function browse(key: string | null) {
    if (blocked) return;
    setParentKey(key); setError(''); setMessage('');
  }

  function openForm(kind: 'group' | 'item', node?: PresetNode) {
    if (editBlocked) return;
    const price = node?.kind === 'item' ? (node.priceCents / 100).toFixed(2) : '';
    const label = node?.label ?? '', visible = node?.visible ?? true;
    setForm({ mode: node ? 'edit' : 'add', kind, key: node?.key ?? `edit-${crypto.randomUUID()}`, parentKey: selectedKey,
      label, price, visible, initialLabel: label, initialPrice: price, initialVisible: visible });
    setFormError(''); setError(''); setMessage('');
  }

  function draftFromForm(): PresetDocument {
    if (!form) return session.draft;
    if (form.mode === 'edit') return editNode(session.draft, form.key, { label: form.label, visible: form.visible, ...(form.kind === 'item' ? { price: form.price } : {}) });
    return addNode(session.draft, form.parentKey, form.kind === 'group'
      ? { key: form.key, kind: 'group', label: form.label, visible: form.visible }
      : { key: form.key, kind: 'item', label: form.label, price: form.price, visible: form.visible });
  }

  function saveForm() {
    if (publishing.current || !form) return;
    try { commit(draftFromForm(), 'Saved to draft. Review and publish to share.'); sound.playPositive(); }
    catch (problem) { fail(problem, true); }
  }

  function keepAndClose() {
    if (publishing.current) return;
    try {
      const draft = unsaved ? draftFromForm() : session.draft;
      const storageError = rememberDraft(session.base, draft, staleCurrent, pending);
      setSession({ ...session, draft, storageError });
      if (storageError) { setConfirmation(null); sound.playError(); return; }
      close();
    } catch (problem) { setConfirmation(null); fail(problem, true); }
  }

  function discard(reload: boolean) {
    if (publishing.current) return;
    const storageError = forgetDraft();
    if (storageError) { setSession({ ...session, storageError }); setConfirmation('discard-close'); sound.playError(); return; }
    if (!reload) { request.current = null; close(); return; }
    const fresh = latest ?? document;
    setSession({ base: fresh, draft: fresh, storageError: '', restored: false });
    setStaleCurrent(null); setForm(null); setFormError(''); setUndo(null); setParentKey(null); setReview(false);
    setConfirmation(null); setError(''); setAcknowledged(false); setMessage('Latest presets loaded. Local draft discarded.');
    request.current = null;
  }

  function undoLast() {
    if (editBlocked || !undo) return;
    const storageError = rememberDraft(session.base, undo.draft, staleCurrent);
    setSession({ ...session, draft: undo.draft, storageError }); setParentKey(undo.parentKey);
    setUndo(null); setError(''); setMessage('Last draft change undone.'); setAcknowledged(false);
  }

  async function publishDraft() {
    if (publishing.current || !review || confirmation || latest || !dirty || (changes.some(change => change.significant) && !acknowledged)) return;
    try { validateDocument(session.draft); } catch (problem) { fail(problem); return; }
    publishing.current = true; setBusy(true); setError(''); setMessage('Publishing changes…');
    const fingerprint = publicationFingerprint(session.base, session.draft);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    const identity = request.current;
    try {
      const storageError = rememberDraft(session.base, session.draft, staleCurrent, identity);
      if (storageError) {
        setSession({ ...session, storageError });
        throw new Error('Publication could not start because its recovery details could not be saved. Your edits are kept in this manager.');
      }
      setSession({ ...session, pending: identity, storageError: '' });
      if (pending) {
        let recovered: PresetDocument | null = null;
        try { recovered = await checkPublication(identity.id); }
        catch { /* The user explicitly requested retry; reuse the durable id. */ }
        if (recovered) { completePublication(recovered); return; }
      }
      completePublication(await publish(session.draft, session.base.revision, identity.id));
    } catch (problem) {
      const remote = problem && typeof problem === 'object' && 'current' in problem ? problem.current : undefined;
      if (remote) {
        try {
          const current = validateDocument(remote);
          request.current = null;
          setStaleCurrent(current);
          const storageError = rememberDraft(session.base, session.draft, current);
          setSession({ ...session, current, pending: undefined, storageError });
        }
        catch { /* Preserve the draft even if an error contains an invalid remote document. */ }
      }
      setMessage('');
      fail(problem);
    } finally { publishing.current = false; setBusy(false); }
  }

  const formPath = form?.mode === 'edit'
    ? pathToNode(session.draft, form.key).slice(0, -1).map(nodeName).join(' / ') || 'All presets'
    : path.map(nodeName).join(' / ') || 'All presets';

  return <Dialog title="Manage presets" className="preset-manager" close={requestClose}>
    <div className="pm-topbar">
      <p>Local draft · Base revision {session.base.revision} · {session.draft.roots.length}/5 preset groups</p>
      <Button disabled={busy} onClick={event => { preventTapThrough(event); requestClose(); }}>Close manager</Button>
    </div>
    <div className="pm-scroll">
      {(session.storageError || error || formError) && <div className="pm-warning" role="alert">
        {session.storageError && <p>{session.storageError}</p>}{error && <p>{error}</p>}{formError && <p>{formError}</p>}
      </div>}
      <p className="pm-status" role="status" aria-label="Preset manager message">{message}</p>
      {pending && <div className="pm-conflict">
        <strong>An earlier publication is unconfirmed.</strong>
        <p>Your draft and its request are kept. Review and publish again to check its status and retry the same request. Editing is paused until it is confirmed or you explicitly discard the draft.</p>
        {remote.revision > session.base.revision && <p>Latest known revision: {remote.revision}. This alone does not confirm your publication.</p>}
      </div>}
      {latest && <div className="pm-conflict">
        <strong>Presets changed on another device.</strong>
        <p>Your draft is kept at revision {session.base.revision}. Latest revision: {latest.revision}. Reloading discards your local changes after confirmation.</p>
        <Button disabled={busy || !!confirmation} onClick={() => setConfirmation('reload')}>Reload latest</Button>
      </div>}
      {confirmation ? <div className="pm-confirmation">
        <h3 ref={confirmationHeading} tabIndex={-1}>{deleting ? `Delete ${nodeName(deleting)}?` : confirmation === 'reload' ? 'Discard draft and reload latest?' : confirmation === 'cancel-form' ? 'Discard this unfinished entry?' : confirmation === 'discard-close' ? 'Discard edits and close?' : 'Keep your draft?'}</h3>
        {deleting ? <>
          <p>{pathToNode(session.draft, deleting.key).map(nodeName).join(' / ')}</p>
          <p>{deleting.kind === 'group'
            ? `This group and all ${deleteCounts?.total} descendants (${deleteCounts?.groups} groups and ${deleteCounts?.items} prices) will be removed from the draft. Undo restores them before publishing.`
            : 'This price will be removed from the draft. Undo restores it before publishing.'}</p>
          <div className="pm-actions">
            <Button onClick={event => { preventTapThrough(event, true); setConfirmation(null); }}>Cancel delete</Button>
            <Button tone="delete" onClick={event => {
              preventTapThrough(event);
              try { commit(deleteNode(session.draft, deleting.key), `Deleted ${nodeName(deleting)} from draft. Undo is available.`); setConfirmation(null); }
              catch (problem) { fail(problem); }
            }}>Confirm delete</Button>
          </div>
        </> : confirmation === 'reload' ? <>
          <p>Discard all local edits and load revision {latest?.revision ?? document.revision}? Your draft will be removed from this device.</p>
          <div className="pm-actions">
            <Button onClick={event => { preventTapThrough(event, true); setConfirmation(null); }}>Continue editing</Button>
            <Button tone="delete" onClick={event => { preventTapThrough(event); discard(true); }}>Discard draft and reload</Button>
          </div>
        </> : confirmation === 'cancel-form' ? <>
          <p>Your saved draft edits will be kept. This entry has not been saved to the draft.</p>
          <div className="pm-actions">
            <Button onClick={event => { preventTapThrough(event, true); setConfirmation(null); }}>Continue editing</Button>
            <Button tone="delete" onClick={event => { preventTapThrough(event, true); setForm(null); setFormError(''); setConfirmation(null); }}>Discard entry</Button>
          </div>
        </> : confirmation === 'discard-close' ? <>
          <p>Closing discards the edits held in memory. Storage cleanup is blocked, so a saved draft may remain. If it reappears when you reopen the manager, discard it explicitly again.</p>
          <div className="pm-actions">
            <Button onClick={event => { preventTapThrough(event, true); setConfirmation(null); }}>Continue editing</Button>
            <Button tone="delete" onClick={event => { preventTapThrough(event, true); request.current = null; close(); }}>Discard and close</Button>
          </div>
        </> : <>
          <p>Keep the draft on this device for later, discard it, or continue editing. Checkout uses the published presets.</p>
          {unsaved && <p>Keep draft will save the unfinished entry too. Complete any required fields first.</p>}
          <div className="pm-actions">
            <Button onClick={event => { preventTapThrough(event, true); setConfirmation(null); }}>Continue editing</Button>
            <Button disabled={!!session.storageError} onClick={event => { preventTapThrough(event); keepAndClose(); }}>Keep draft</Button>
            <Button tone="delete" onClick={event => { preventTapThrough(event); discard(false); }}>Discard draft</Button>
          </div>
        </>}
      </div> : review ? <PresetReview changes={changes} validationError={validationError} acknowledged={acknowledged} acknowledge={setAcknowledged} busy={busy} /> : <div className="pm-layout">
        <aside className="pm-sidebar" aria-label="Preset groups">
          <Button disabled={blocked} aria-pressed={selectedKey === null} onClick={() => browse(null)}>Browse all presets</Button>
          {session.draft.roots.map(root => <Button key={root.key} disabled={blocked} aria-label={`Browse ${root.label}`} aria-pressed={selectedRoot === root.key} onClick={() => browse(root.key)}>
            {root.label}{!root.visible && <span className="pm-hint">Hidden</span>}
          </Button>)}
          <p className="pm-hint">Edits stay in your draft until you review and publish.</p>
        </aside>
        <div className="pm-main">
          <nav className="pm-breadcrumbs" aria-label="Preset breadcrumb">
            <Button disabled={blocked} aria-current={selectedKey === null ? 'page' : undefined} onClick={() => browse(null)}>All presets</Button>
            {path.map(node => <Button key={node.key} disabled={blocked} aria-current={selectedKey === node.key ? 'page' : undefined} onClick={() => browse(node.key)}>{nodeName(node)}</Button>)}
          </nav>
          {form ? <PresetEditor form={form} path={formPath} busy={busy} error={formError}
            update={patch => { setForm({ ...form, ...patch }); setFormError(''); }} save={saveForm}
            cancel={() => { if (unsaved) setConfirmation('cancel-form'); else { setForm(null); setFormError(''); } }} /> : <>
            <h3 ref={heading} tabIndex={-1}>{current?.kind === 'group' ? current.label : 'Your preset groups'}</h3>
            <div className="pm-actions pm-add-actions">
              {selectedKey === null ? <Button disabled={editBlocked || session.draft.roots.length >= 5} onClick={() => openForm('group')}>Add preset</Button> : <>
                <Button disabled={editBlocked || path.length >= 3} onClick={() => openForm('group')}>Add type or brand</Button>
                <Button disabled={editBlocked || path.length >= 4} onClick={() => openForm('item')}>Add price</Button>
              </>}
            </div>
            {selectedKey === null && <p className="pm-hint">Five preset groups total, including Ghee and Oil.{session.draft.roots.length >= 5 ? ' Delete a group to make room.' : ' Add prices directly, or organize them into types and brands.'}</p>}
            {path.length >= 3 && <p className="pm-hint">Four levels maximum, including the price. Add prices directly at this level.</p>}
            {!rows.length && <p className="pm-empty">{selectedKey ? 'This draft group is empty. Add a price or type/brand to continue.' : 'Add a preset group to start.'}</p>}
            <div className="pm-rows">
              {rows.map(node => <article className="pm-row" key={node.key}>
                <div className="pm-row-title">
                  {node.kind === 'group' ? <Button disabled={blocked} aria-label={`Open ${node.label}`} onClick={() => browse(node.key)}>{node.label}<span className="pm-hint">{descendantCount(node).items} prices · Open group</span></Button>
                    : <><strong>{nodeName(node)}</strong>{node.label && <span className="pm-price">{money(node.priceCents)}</span>}</>}
                  {!node.visible && <span className="pm-hidden">Hidden in checkout</span>}
                </div>
                <div className="pm-row-actions">
                  <Button disabled={editBlocked} aria-label={`Edit ${nodeName(node)}`} onClick={() => openForm(node.kind, node)}>Edit</Button>
                  <Button disabled={editBlocked} aria-label={`Delete ${nodeName(node)}`} onClick={() => { setError(''); setConfirmation({ deleteKey: node.key }); }}>Delete</Button>
                </div>
              </article>)}
            </div>
          </>}
        </div>
      </div>}
    </div>
    <footer className="pm-footer">
      <span>{changes.length} {changes.length === 1 ? 'change' : 'changes'} in draft{unsaved ? ' · Entry not saved' : ''}</span>
      <div className="pm-actions">
        {review ? <>
          <Button disabled={busy || !!confirmation} onClick={event => { preventTapThrough(event, true); setReview(false); setError(''); }}>Back to editing</Button>
          <Button className="primary" tone="positive" disabled={busy || !!confirmation || !!latest || !dirty || !!validationError || (changes.some(change => change.significant) && !acknowledged)} onClick={event => { preventTapThrough(event); void publishDraft(); }}>{busy ? 'Publishing…' : 'Publish changes'}</Button>
        </> : <>
          <Button disabled={editBlocked || !undo} tone="positive" onClick={undoLast}>Undo</Button>
          <Button disabled={blocked || !dirty} className="primary" onClick={event => { preventTapThrough(event, true); setReview(true); setAcknowledged(false); setError(''); setMessage(''); }}>Review changes</Button>
        </>}
      </div>
    </footer>
  </Dialog>;
}
