import { useEffect, useState } from 'react';
import { MAX_LENGTH, generateRandomString } from '../../domain/random-string';

const MIN_LENGTH = 8;
const COPIED_FEEDBACK_MS = 2000;

const CHARSET_OPTIONS = [
  { key: 'uppercase', label: 'Majuscules' },
  { key: 'lowercase', label: 'Minuscules' },
  { key: 'digits', label: 'Chiffres' },
  { key: 'special', label: 'Caracteres speciaux' },
] as const;

type CharsetKey = (typeof CHARSET_OPTIONS)[number]['key'];

export function RandomStringGenerator() {
  const [length, setLength] = useState('32');
  const [charsets, setCharsets] = useState<Record<CharsetKey, boolean>>({
    uppercase: true,
    lowercase: true,
    digits: true,
    special: true,
  });
  const [value, setValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      setValue(generateRandomString({ length: Number(length), ...charsets }));
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

  return (
    <fieldset className="border border-hairline rounded-lg p-md flex flex-col gap-md">
      <legend className="font-label-sm text-label-sm text-charcoal uppercase tracking-wider px-xs">
        Generateur de chaine
      </legend>
      <label className="space-y-xs block">
        <span className="font-label-sm text-label-sm text-charcoal block px-xs">
          Longueur
        </span>
        <input
          type="number"
          value={length}
          min={MIN_LENGTH}
          max={MAX_LENGTH}
          onChange={(event) => setLength(event.target.value)}
          className="w-full px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
        />
      </label>
      <div className="flex flex-wrap gap-md">
        {CHARSET_OPTIONS.map(({ key, label }) => (
          <label
            key={key}
            className="flex items-center gap-xs font-body-md text-body-md text-ink"
          >
            <input
              type="checkbox"
              checked={charsets[key]}
              onChange={(event) =>
                setCharsets((current) => ({
                  ...current,
                  [key]: event.target.checked,
                }))
              }
            />
            {label}
          </label>
        ))}
      </div>
      <div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!hasCharset}
          className="px-lg py-sm bg-primary text-white rounded-lg font-button-md text-button-md hover:bg-primary-container transition-all disabled:opacity-50 flex items-center gap-sm"
        >
          <span className="material-symbols-outlined">casino</span>
          Generer
        </button>
      </div>
      <div className="flex gap-sm">
        <input
          type="text"
          readOnly
          value={value}
          aria-label="Chaine generee"
          className="flex-1 min-w-0 px-md py-sm bg-soft-cloud border border-hairline rounded-lg text-ink font-caption outline-none"
        />
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!value}
          className="px-lg py-sm border border-hairline rounded-lg font-button-md text-button-md text-charcoal hover:bg-soft-cloud transition-all disabled:opacity-50 flex items-center gap-sm"
        >
          <span className="material-symbols-outlined">content_copy</span>
          Copier
        </button>
      </div>
      {copied && (
        <p role="status" className="font-caption text-caption text-mute">
          Copie !
        </p>
      )}
      {error && (
        <p role="alert" className="font-caption text-caption text-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
