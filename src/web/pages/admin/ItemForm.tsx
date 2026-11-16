import { useEffect, useState } from 'preact/hooks';
import type { ItemDto, Priority } from '../../../shared/types';
import { toMinor } from '../../../shared/money';
import { ApiError, api } from '../../api';
import { ErrorState, Loading, Screen, errorText } from '../../components/Chrome';
import { ImagePicker } from '../../components/ImagePicker';
import { useAsync } from '../../hooks';
import { t } from '../../i18n';
import { href, navigate } from '../../router';
import { useApp } from '../../state';
import { ask } from '../../tg';

interface Preview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  priceMinor: number | null;
  currency: string | null;
  error?: 'blocked' | 'unreachable' | 'too_large';
}

interface Form {
  url: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  priority: Priority;
  note: string;
  groupFunding: boolean;
}

const priceText = (minor: number) => (minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2));
const fromItem = (i: ItemDto): Form => ({
  url: i.url ?? '', title: i.title, description: i.description, price: i.priceMinor == null ? '' : priceText(i.priceMinor),
  currency: i.currency ?? '', priority: i.priority, note: i.note, groupFunding: i.groupFunding,
});

function Field({ id, label, children }: { id: string; label: string; children: preact.ComponentChildren }) {
  return (
    <div class="field">
      <label for={id}>{label}</label>
      {children}
    </div>
  );
}

/** Create (no id) or edit (id) a gift. */
export function ItemForm({ id }: { id?: number }) {
  const { config } = useApp();
  const empty: Form = { url: '', title: '', description: '', price: '', currency: config.defaultCurrency, priority: 'want', note: '', groupFunding: false };
  const [f, setF] = useState<Form>(empty);
  const [savedId, setSavedId] = useState(id);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [linkImage, setLinkImage] = useState<string | null>(null);

  const q = useAsync(() => (id ? api<ItemDto>(`/api/items/${id}`) : Promise.resolve(null)), [id]);
  const loaded = q.data ?? null;
  useEffect(() => {
    if (loaded) setF(fromItem(loaded));
  }, [loaded?.id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const currencies = loaded?.currency && !config.currencies.includes(loaded.currency) ? [...config.currencies, loaded.currency] : config.currencies;

  async function fetchPreview() {
    setHint(null);
    setError(null);
    setFetching(true);
    try {
      const p = await api<Preview>('/api/link-preview', { method: 'POST', json: { url: f.url } });
      if (p.error) return setHint(t(p.error === 'blocked' ? 'form.preview.blocked' : 'form.preview.unreachable'));
      const priceOk = p.priceMinor != null && p.currency != null && config.currencies.includes(p.currency);
      const incoming: Partial<Form> = {
        ...(p.title ? { title: p.title } : {}),
        ...(p.description ? { description: p.description } : {}),
        ...(priceOk ? { price: priceText(p.priceMinor!), currency: p.currency! } : {}),
      };
      const keys = Object.keys(incoming) as (keyof Form)[];
      if (keys.length === 0 && !p.imageUrl) return setHint(t('form.preview.empty'));
      const typed = keys.filter((k) => (f[k] as string) !== '' && f[k] !== incoming[k] && !(k === 'currency' && f.price === ''));
      const replace = typed.length > 0 ? await ask(t('form.replace')) : true;
      setF((cur) => {
        const next = { ...cur };
        for (const k of keys) if (replace || (cur[k] as string) === '' || (k === 'currency' && cur.price === '')) (next as Record<string, unknown>)[k] = incoming[k];
        return next;
      });
      if (p.imageUrl && !file && !loaded?.imageUrl) setLinkImage(p.imageUrl);
    } catch (e) {
      setHint(errorText(e instanceof ApiError ? e.code : 'network'));
    } finally {
      setFetching(false);
    }
  }

  function validate(): { priceMinor: number | null; currency: string | null } | string {
    if (!f.title.trim()) return t('form.error.title');
    if (f.price.trim() === '') return { priceMinor: null, currency: null };
    const minor = toMinor(f.price);
    if (minor == null || minor <= 0) return t('form.error.price');
    if (!f.currency) return t('form.error.currency');
    return { priceMinor: minor, currency: f.currency };
  }

  async function save() {
    const v = validate();
    if (typeof v === 'string') return setError(v);
    setError(null);
    setBusy(true);
    try {
      const json = {
        title: f.title.trim(), description: f.description, url: f.url.trim() || null, ...v,
        priority: f.priority, note: f.note, groupFunding: f.groupFunding,
      };
      const dto = savedId
        ? await api<ItemDto>(`/api/items/${savedId}`, { method: 'PATCH', json })
        : await api<ItemDto>('/api/items', { method: 'POST', json });
      setSavedId(dto.id);
      try {
        if (file) {
          const body = new FormData();
          body.append('file', file);
          await api(`/api/items/${dto.id}/image`, { method: 'POST', body });
        } else if (linkImage) {
          await api(`/api/items/${dto.id}/image-from-url`, { method: 'POST', json: { url: linkImage } });
        }
      } catch {
        return setError(t('form.error.image'));
      }
      navigate(href.item(dto.id));
    } catch (e) {
      setError(errorText(e instanceof ApiError ? e.code : 'unknown'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!savedId || !(await ask(t('form.deleteConfirm')))) return;
    setBusy(true);
    try {
      await api(`/api/items/${savedId}`, { method: 'DELETE' });
      navigate(href.list());
    } catch (e) {
      setError(errorText(e instanceof ApiError ? e.code : 'unknown'));
    } finally {
      setBusy(false);
    }
  }

  const title = savedId ? t('form.edit') : t('form.new');
  if (id && q.error && !loaded) return <Screen title={title} back={href.list()}><ErrorState error={q.error} onRetry={q.reload} /></Screen>;
  if (id && !loaded) return <Screen title={title} back={href.list()}><Loading /></Screen>;

  return (
    <Screen title={title} back={savedId ? href.item(savedId) : href.list()}>
      <form class="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field id="f-url" label={t('form.url')}>
          <div class="inline">
            <input id="f-url" type="url" inputMode="url" value={f.url} onInput={(e) => set('url', e.currentTarget.value)} />
            <button type="button" class="btn" disabled={fetching || !f.url.trim()} onClick={() => void fetchPreview()}>
              {fetching ? t('form.fetching') : t('form.fetch')}
            </button>
          </div>
        </Field>
        {hint && <p class="muted small" role="status">{hint}</p>}
        <Field id="f-title" label={t('form.title')}><input id="f-title" maxLength={200} value={f.title} onInput={(e) => set('title', e.currentTarget.value)} /></Field>
        <Field id="f-desc" label={t('form.description')}><textarea id="f-desc" rows={3} maxLength={4000} value={f.description} onInput={(e) => set('description', e.currentTarget.value)} /></Field>
        <div class="inline">
          <Field id="f-price" label={t('form.price')}><input id="f-price" inputMode="decimal" value={f.price} onInput={(e) => set('price', e.currentTarget.value)} /></Field>
          <Field id="f-cur" label={t('form.currency')}>
            <select id="f-cur" value={f.currency} onChange={(e) => set('currency', e.currentTarget.value)}>
              <option value="">{t('form.noCurrency')}</option>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field id="f-prio" label={t('form.priority')}>
          <select id="f-prio" value={f.priority} onChange={(e) => set('priority', e.currentTarget.value as Priority)}>
            {(['must', 'want', 'nice'] as const).map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
          </select>
        </Field>
        <Field id="f-note" label={t('form.note')}><input id="f-note" maxLength={500} value={f.note} onInput={(e) => set('note', e.currentTarget.value)} /></Field>
        <ImagePicker id="f-image" currentUrl={loaded?.imageUrl ?? linkImage} fromLink={!!linkImage && !file} onFile={setFile} />
        <div class="check">
          <input id="f-group" type="checkbox" checked={f.groupFunding} onChange={(e) => set('groupFunding', e.currentTarget.checked)} />
          <label for="f-group">{t('form.groupFunding')}</label>
        </div>
        {error && <p class="msg" role="alert">{error}</p>}
        <div class="actions static">
          <button type="submit" class="main" disabled={busy}>{t('common.save')}</button>
          {savedId && <button type="button" class="main danger" disabled={busy} onClick={() => void remove()}>{t('common.delete')}</button>}
        </div>
      </form>
    </Screen>
  );
}
