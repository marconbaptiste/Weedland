import { useState } from 'react';
import { parseMontant, formatEuros } from '../lib/format';
import { decomposer } from '../lib/monnaie';
import ChampMontant from './ChampMontant';

// Aide au comptoir : calcule la monnaie à rendre et la décompose en
// billets / pièces. Repliable (n'encombre pas la caisse).
export default function RenduMonnaie() {
  const [aPayer, setAPayer] = useState('');
  const [donne, setDonne] = useState('');

  const p = parseMontant(aPayer);
  const d = parseMontant(donne);
  const diff = Math.round((d - p) * 100) / 100;
  const aRendre = diff > 0 ? diff : 0;
  const coupures = aRendre > 0 ? decomposer(aRendre) : [];
  const actif = p > 0 || d > 0;

  return (
    <details className="card">
      <summary>💶 Rendu de monnaie</summary>
      <div className="bloc-form">
        <ChampMontant label="Montant à payer" valeur={aPayer} onChange={setAPayer} />
        <ChampMontant label="Montant donné" valeur={donne} onChange={setDonne} />
      </div>

      {actif && (
        <div className={`voyant ${diff < 0 ? 'voyant-rouge' : 'voyant-vert'}`}>
          {diff < 0
            ? `Il manque ${formatEuros(-diff)}`
            : `À rendre : ${formatEuros(aRendre)}`}
        </div>
      )}

      {coupures.length > 0 && (
        <ul className="coupures">
          {coupures.map((c) => (
            <li key={c.valeur}>
              <span className="coupure-nb">{c.nombre} ×</span>
              <span>{formatEuros(c.valeur)}</span>
            </li>
          ))}
        </ul>
      )}

      {(p > 0 || d > 0) && (
        <button
          type="button"
          className="btn btn-discret"
          onClick={() => {
            setAPayer('');
            setDonne('');
          }}
        >
          Effacer
        </button>
      )}
    </details>
  );
}
