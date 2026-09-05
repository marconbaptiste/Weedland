import { useCallback, useEffect, useRef, useState } from 'react';

// Fenêtre de saisie / message réutilisable — remplace window.prompt et
// window.alert par une modale intégrée (même habillage que les autres modales
// de l'app : .aide-fond / .modale-client), lisible en thème sombre et adaptée
// au tactile. À piloter via le hook useInvite() ci-dessous.
export default function ModalePrompt({
  titre,
  label,
  message,
  type = 'text',
  valeurInitiale = '',
  placeholder,
  okLabel = 'Valider',
  avecSaisie = true,
  onValider,
  onAnnuler,
}) {
  const [valeur, setValeur] = useState(valeurInitiale);
  const champRef = useRef(null);
  useEffect(() => {
    champRef.current?.focus();
  }, []);

  function soumettre(e) {
    e.preventDefault();
    onValider(avecSaisie ? valeur : true);
  }

  return (
    <div
      className="aide-fond"
      role="dialog"
      aria-modal="true"
      aria-label={titre || label || 'Saisie'}
      onClick={onAnnuler}
    >
      <div className="modale-client modale-invite" onClick={(e) => e.stopPropagation()}>
        <div className="modale-client-tete">
          <strong>{titre || (avecSaisie ? 'Saisie' : 'Information')}</strong>
          {onAnnuler && (
            <button type="button" className="btn btn-discret" onClick={onAnnuler}>
              Fermer
            </button>
          )}
        </div>
        <form className="form-chrome" onSubmit={soumettre}>
          {message && <p className="statut">{message}</p>}
          {avecSaisie &&
            (type === 'textarea' ? (
              <label className="field">
                {label && <span>{label}</span>}
                <textarea
                  ref={champRef}
                  rows={3}
                  value={valeur}
                  placeholder={placeholder}
                  onChange={(e) => setValeur(e.target.value)}
                />
              </label>
            ) : (
              <label className="field">
                {label && <span>{label}</span>}
                <input
                  ref={champRef}
                  type={type === 'number' ? 'text' : type}
                  inputMode={type === 'number' ? 'decimal' : type === 'tel' ? 'tel' : undefined}
                  value={valeur}
                  placeholder={placeholder}
                  onChange={(e) => setValeur(e.target.value)}
                />
              </label>
            ))}
          <div className="form-inline">
            <button className="btn btn-primary" type="submit">
              {okLabel}
            </button>
            {onAnnuler && avecSaisie && (
              <button className="btn" type="button" onClick={onAnnuler}>
                Annuler
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// Hook : API proche de window.prompt/alert mais promise-based.
//   const { invite, alerter, elementInvite } = useInvite();
//   const v = await invite({ titre, label, valeurInitiale });  // string | null
//   await alerter('Message'); // OK
// Penser à rendre {elementInvite} dans le JSX du composant.
export function useInvite() {
  const [config, setConfig] = useState(null);
  const resolveRef = useRef(null);

  const ouvrir = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setConfig(opts);
      }),
    [],
  );

  const invite = useCallback((opts) => ouvrir({ avecSaisie: true, ...opts }), [ouvrir]);
  const alerter = useCallback(
    (message, titre) => ouvrir({ avecSaisie: false, message, titre, okLabel: 'OK' }),
    [ouvrir],
  );

  const resoudre = (valeur) => {
    const r = resolveRef.current;
    resolveRef.current = null;
    setConfig(null);
    if (r) r(valeur);
  };

  const elementInvite = config ? (
    <ModalePrompt
      {...config}
      onValider={resoudre}
      onAnnuler={() => resoudre(config.avecSaisie ? null : true)}
    />
  ) : null;

  return { invite, alerter, elementInvite };
}
