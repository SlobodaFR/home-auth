import { useEffect, useId, useState } from 'react';
import { MAX_LENGTH, generateRandomString } from '../../domain/random-string';

const MIN_LENGTH = 8;
const COPIED_FEEDBACK_MS = 2000;
// Points to no form: detaches the controls from the enclosing create-client form so they take
// part neither in its constraint validation nor in its implicit (Enter) submission.
const DETACHED_FORM = 'random-string-generator-detached';

const CHARSET_OPTIONS = [
  { key: 'uppercase', short: 'A-Z', label: 'Majuscules' },
  { key: 'lowercase', short: 'a-z', label: 'Minuscules' },
  { key: 'digits', short: '0-9', label: 'Chiffres' },
  { key: 'special', short: '!@#', label: 'Caracteres speciaux' },
] as const;

type CharsetKey = (typeof CHARSET_OPTIONS)[number]['key'];

const DEFAULT_LENGTH = 32;
const DEFAULT_CHARSETS: Record<CharsetKey, boolean> = {
  uppercase: true,
  lowercase: true,
  digits: true,
  special: true,
};

export function RandomStringGenerator() {
  const [length, setLength] = useState(DEFAULT_LENGTH.toString());
  const [charsets, setCharsets] =
    useState<Record<CharsetKey, boolean>>(DEFAULT_CHARSETS);
  // Generated once at first render so the output is never empty.
  const [value, setValue] = useState(() =>
    generateRandomString({ length: DEFAULT_LENGTH, ...DEFAULT_CHARSETS }),
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const hasCharset = Object.values(charsets).some(Boolean);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  function handleGenerate() {
    setError(null);
    setCopied(false);
    const requested = Number(length);
    if (requested < MIN_LENGTH) {
      setError(`Longueur invalide: minimum ${MIN_LENGTH.toString()}`);
      return;
    }
    try {
      setValue(generateRandomString({ length: requested, ...charsets }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  async function handleCopy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
      setError('Copie impossible: presse-papiers indisponible');
    }
  }

  const iconButton =
    'h-10 w-10 shrink-0 flex items-center justify-center border border-hairline rounded-lg transition-all disabled:opacity-50';

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="border border-hairline rounded-lg p-md flex flex-col gap-md min-w-0"
    >
      <span
        id={titleId}
        className="font-label-sm text-label-sm text-charcoal uppercase tracking-wider"
      >
        Generateur de chaine
      </span>
      <label className="flex items-center justify-between gap-sm min-w-0">
        <span className="font-label-sm text-label-sm text-charcoal">
          Longueur
        </span>
        <input
          type="number"
          form={DETACHED_FORM}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (hasCharset) handleGenerate();
            }
          }}
          value={length}
          min={MIN_LENGTH}
          max={MAX_LENGTH}
          onChange={(event) => setLength(event.target.value)}
          className="w-20 min-w-0 px-sm py-xs text-center bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
        />
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm">
        {CHARSET_OPTIONS.map(({ key, short, label }) => {
          const selected = charsets[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              title={label}
              onClick={() =>
                setCharsets((current) => ({ ...current, [key]: !current[key] }))
              }
              className={`min-w-0 h-9 flex items-center justify-center rounded-lg border font-label-sm text-label-sm text-center transition-all ${
                selected
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'border-hairline text-mute'
              }`}
            >
              {short}
              <span className="sr-only"> {label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-sm min-w-0">
        <input
          type="text"
          readOnly
          form={DETACHED_FORM}
          value={value}
          aria-label="Chaine generee"
          className="flex-1 min-w-0 px-md py-sm bg-soft-cloud border border-hairline rounded-lg text-ink font-mono text-body-md truncate outline-none"
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!hasCharset}
          aria-label="Generer"
          title="Generer"
          className={`${iconButton} text-primary hover:bg-primary/10`}
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!value}
          aria-label="Copier"
          title={copied ? 'Copie !' : 'Copier'}
          className={`${iconButton} text-charcoal hover:bg-soft-cloud`}
        >
          <span className="material-symbols-outlined">
            {copied ? 'check' : 'content_copy'}
          </span>
        </button>
      </div>
      <p role="status" className="sr-only">
        {copied ? 'Copie !' : ''}
      </p>
      {error && (
        <p role="alert" className="font-caption text-caption text-error">
          {error}
        </p>
      )}
    </div>
  );
}
