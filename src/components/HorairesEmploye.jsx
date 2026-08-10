import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { JOURS_SEMAINE } from '../lib/horaires';

// Modale (Comptes) — horaires fixes hebdomadaires d'un employé. Sert de base au
// planning (pré-remplissage), ajustable ensuite jour par jour dans Plannings.
// Écriture réservée à l'admin via la RLS `users_admin_update`.
export default function HorairesEmploye({ employe, defautMagasin, onClose, onSaved }) {
  const [horaires, setHoraires] = useState(() => {
    const base = {};
    JOURS_SEMAINE.forEach(({ cle }) => {
      const src = employe.horaires_fixes?.[cle];
      const mag = defautMagasin?.[cle];
      base[cle] = src
        ? {
            travaille: !!src.travaille,
            debut: (src.debut ?? '10:00').slice(0, 5),
            fin: (src.fin ?? '18:00').slice(0, 5),
          }
        : {
            travaille: false,
            debut: (mag?.debut ?? '10:00').slice(0, 5),
            fin: (mag?.fin ?? '18:00').slice(0, 5),
          };
    });
    return base;
  });
  const [msg, setMsg] = useState('');
  const [enCours, setEnCours] = useState(false);

  function maj(cle, champ, valeur) {
    setHoraires((h) => ({ ...h, [cle]: { ...h[cle], [champ]: valeur } }));
  }

  async function enregistrer() {
    setEnCours(true);
    setMsg('');
    const { error } = await supabase
      .from('users')
      .update({ horaires_fixes: horaires })
      .eq('id', employe.id);
    setEnCours(false);
    if (error) {
      setMsg(`Erreur : ${error.message}`);
      return;
    }
    onSaved?.(horaires);
    onClose();
  }

  return (
    <div
      className="aide-fond"
      role="dialog"
      aria-modal="true"
      aria-label="Horaires de l’employé"
      onClick={onClose}
    >
      <div className="modale-client" onClick={(e) => e.stopPropagation()}>
        <div className="modale-client-tete">
          <strong>Horaires fixes — {employe.nom}</strong>
          <button type="button" className="btn btn-discret" onClick={onClose}>
            Fermer
          </button>
        </div>
        <p className="statut">
          Coche les jours travaillés et renseigne les horaires. Le planning les reprendra
          automatiquement ; tu pourras ajuster jour par jour ensuite.
        </p>
        <div className="horaires-grille">
          {JOURS_SEMAINE.map(({ cle, long }) => {
            const j = horaires[cle];
            return (
              <div key={cle} className="horaire-jour">
                <label className="horaire-check">
                  <input
                    type="checkbox"
                    checked={j.travaille}
                    onChange={(e) => maj(cle, 'travaille', e.target.checked)}
                  />
                  <span>{long}</span>
                </label>
                {j.travaille ? (
                  <div className="horaire-plage">
                    <input
                      type="time"
                      value={j.debut}
                      onChange={(e) => maj(cle, 'debut', e.target.value)}
                    />
                    <span>–</span>
                    <input
                      type="time"
                      value={j.fin}
                      onChange={(e) => maj(cle, 'fin', e.target.value)}
                    />
                  </div>
                ) : (
                  <span className="horaire-ferme">Repos</span>
                )}
              </div>
            );
          })}
        </div>
        <button className="btn btn-primary" type="button" onClick={enregistrer} disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {msg && <p className="statut">{msg}</p>}
      </div>
    </div>
  );
}
