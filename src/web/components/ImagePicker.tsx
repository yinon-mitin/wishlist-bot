import { t } from '../i18n';

interface Props {
  id: string;
  currentUrl: string | null;
  fromLink: boolean;
  onFile: (file: File | null) => void;
}

export function ImagePicker({ id, currentUrl, fromLink, onFile }: Props) {
  return (
    <div class="field">
      <label for={id}>{t('form.image')}</label>
      {currentUrl && <img class="preview" src={currentUrl} alt="" />}
      {fromLink && <p class="muted small">{t('form.imageFromLink')}</p>}
      <input id={id} type="file" accept="image/*" onChange={(e) => onFile((e.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
    </div>
  );
}
