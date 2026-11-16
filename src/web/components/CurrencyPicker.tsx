import { useApp } from '../state';

export function CurrencyPicker() {
  const { config, currency, setCurrency } = useApp();
  return (
    <div class="chips" role="group">
      {config.currencies.map((c) => (
        <button type="button" key={c} class={c === currency ? 'chip on' : 'chip'} aria-pressed={c === currency} onClick={() => setCurrency(c)}>
          {c}
        </button>
      ))}
    </div>
  );
}
