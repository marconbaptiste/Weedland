import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { JOURS_SEMAINE, horairesMagasinDefaut } from '../lib/horaires';

// Personnalisation (Gestion) — coordonnées du magasin + horaires d'ouverture.
// Les horaires servent de base au planning (créneaux pré-remplis). Écriture
// réservée à l'admin via la fonction SECURITY DEFINER `magasin_infos_set`.
export default function InfosMagasin() {
  const { magasinId } = useAuth();
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [horaires, setHoraires] = useState(horairesMagasinDefaut());
  const [msg, setMsg] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!magasinId) return;
    supabase
      .from('magasins')
      .select('adresse, telephone, horaires')
      .eq('id', magasinId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setAdresse(data.adresse ?? '');
        setTelephone(data.telephone ?? '');
        setHoraires({ ...horairesMagasinDefaut(), ...(data.horaires ?? {}) });
      });
  }, [magasinId]);

  function majJour(cle, champ, valeur) {
    setHoraires((h) => ({ ...h, [cle]: { ...h[cle], [champ]: valeur } }));
  }

  async function enregistrer() {
    setEnCours(true);
    setMsg('');
    const { error } = await supabase.rpc('magasin_infos_set', {
      p_adresse: adresse.trim() || null,
      p_telephone: telephone.trim() || null,
      p_horaires: horaires,
    });
    setEnCours(false);
    setMsg(error ? `Erreur : ${error.message}` : 'Coordonnées enregistrées ✅');
  }

  return (
    <div className="card">
      <h2>Coordonnées & horaires</h2>
      <p className="statut">
        L’adresse et les horaires d’ouverture servent de base au planning (les créneaux se calent
        dessus).
      </p>
      <label className="field">
        <span>Adresse du magasin</span>
        <textarea
          rows={2}
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          placeholder="N°, rue, code postal, ville"
        />
      </label>
      <label className="field">
        <span>Numéro du magasin</span>
        <input
          type="tel"
          inputMode="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="ex. 01 23 45 67 89"
        />
      </label>
      <div className="horaires-grille">
        {JOURS_SEMAINE.map(({ cle, long }) => {
          const j = horaires[cle] ?? {};
          return (
            <div key={cle} className="horaire-jour">
              <label className="horaire-check">
                <input
                  type="checkbox"
                  checked={!!j.ouvert}
                  onChange={(e) => majJour(cle, 'ouvert', e.target.checked)}
                />
                <span>{long}</span>
              </label>
              {j.ouvert ? (
                <div className="horaire-plage">
                  <input
                    type="time"
                    value={j.debut ?? '10:00'}
                    onChange={(e) => majJour(cle, 'debut', e.target.value)}
                  />
                  <span>–</span>
                  <input
                    type="time"
                    value={j.fin ?? '20:00'}
                    onChange={(e) => majJour(cle, 'fin', e.target.value)}
                  />
                </div>
              ) : (
                <span className="horaire-ferme">Fermé</span>
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
  );
}
