import { useState } from 'react';
import { parseMontant, formatEuros } from '../lib/format';
import { decomposer } from '../lib/monnaie';
import ChampMontant from './ChampMontant';

// Cœur de la calculatrice de rendu de monnaie (réutilisable : modale, carte…).
export default function CalculatriceMonnaie() {
  const [aPayer, setAPayer] = useState('');
  const [donne, setDonne] = useState('');

  const p = parseMontant(aPayer);
  const d = parseMontant(donne);
  const diff = Math.round((d - p) * 100) / 100;
  const aRendre = diff > 0 ? diff : 0;
  const coupures = aRendre > 0 ? decomposer(aRendre) : [];
  const actif = p > 0 || d > 0;

  return (
    <div className="bloc-form">
      <ChampMontant label="Montant à payer" valeur={aPayer} onChange={setAPayer} autoFocus />
      <ChampMontant label="Montant donné" valeur={donne} onChange={setDonne} />

      {actif && (
        <div className={`voyant ${diff < 0 ? 'voyant-rouge' : 'voyant-vert'}`}>
          {diff < 0 ? `Il manque ${formatEuros(-diff)}` : `À rendre : ${formatEuros(aRendre)}`}
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

      {actif && (
        <button type="button" className="btn btn-discret" onClick={() => { setAPayer(''); setDonne(''); }}>
          Effacer
        </button>
      )}
    </div>
  );
}
