import { Fragment, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros, formatNombre, formatDateFr } from '../lib/format';
import { premierDuMois, intervallePeriode } from '../lib/dates';
import { somme } from '../lib/comptabilite';
import ChampMontant from '../components/ChampMontant';

// Module Historique.
// - Admin : historique GÉNÉRAL (toutes les clôtures, tous les employés) en
//   fiches lisibles, avec le détail des chromes par client.
// - Employé : son propre historique (clôtures + journées partagées).
export default function Historique() {
  const { utilisateur, estAdmin, magasinId } = useAuth();

  // ---------- Vue employé (personnelle) ----------
  const [perso, setPerso] = useState([]);
  const [chromesPerso, setChromesPerso] = useState({}); // date -> {avances, remboursements, autres}
  useEffect(() => {
    if (estAdmin) return undefined;
    let annule = false;
    (async () => {
      const [{ data: p }, { data: chr }] = await Promise.all([
        supabase
          .from('v_interessement_employe')
          .select('caisse_id, date, est_proprietaire, ca_jour, encaissements, ecart, heures_travaillees, interessement')
          .eq('employe_id', utilisateur.id)
          .order('date', { ascending: false }),
        supabase
          .from('chromes')
          .select('date, type, montant, clients(surnom)')
          .eq('employe_id', utilisateur.id),
      ]);
      if (annule) return;
      setPerso(p ?? []);
      const map = {};
      (chr ?? []).forEach((c) => {
        if (!map[c.date]) map[c.date] = { avances: [], remboursements: [], autres: [] };
        const cible =
          c.type === 'avance' ? map[c.date].avances : c.type === 'autre' ? map[c.date].autres : map[c.date].remboursements;
        cible.push({ surnom: c.clients?.surnom ?? 'client', montant: c.montant });
      });
      setChromesPerso(map);
    })();
    return () => {
      annule = true;
    };
  }, [estAdmin, utilisateur.id]);

  // ---------- Vue admin (générale) ----------
  const [mois, setMois] = useState(premierDuMois());
  const [closures, setClosures] = useState([]);
  const [noms, setNoms] = useState({});
  const [chromes, setChromes] = useState({}); // clé `employe|date` -> {avances, remboursements}
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ cb: '', especes: '', fond_caisse: '', employe_id: '' });
  const [editMsg, setEditMsg] = useState('');

  const chargerAdmin = useCallback(async () => {
    const [debut, fin] = intervallePeriode('mois', mois);
    const [cl, emps, chr] = await Promise.all([
      supabase
        .from('v_ca_jour')
        .select('caisse_id, date, employe_id, ventes_directes, cb, especes, virements, fond_caisse, avances, remboursements, autres, ca_jour, encaissements, ecart')
        .gte('date', debut)
        .lte('date', fin)
        .order('date', { ascending: false }),
      supabase.from('users').select('id, nom').eq('magasin_id', magasinId),
      supabase
        .from('chromes')
        .select('date, employe_id, type, montant, modifie_le, modifie_par, clients(surnom)')
        .gte('date', debut)
        .lte('date', fin),
    ]);
    setClosures(cl.data ?? []);
    setNoms(Object.fromEntries((emps.data ?? []).map((e) => [e.id, e.nom])));
    const map = {};
    (chr.data ?? []).forEach((c) => {
      const k = `${c.employe_id}|${c.date}`;
      if (!map[k]) map[k] = { avances: [], remboursements: [], autres: [] };
      const cible =
        c.type === 'avance' ? map[k].avances : c.type === 'autre' ? map[k].autres : map[k].remboursements;
      cible.push({
        surnom: c.clients?.surnom ?? 'client',
        montant: c.montant,
        modifie_le: c.modifie_le,
        modifie_par: c.modifie_par,
      });
    });
    setChromes(map);
  }, [mois, magasinId]);

  useEffect(() => {
    if (estAdmin) chargerAdmin();
  }, [estAdmin, chargerAdmin]);

  if (!estAdmin) {
    return (
      <div className="page">
        <h1>Mon historique</h1>
        <div className="card">
          <table className="tableau tableau-cartes">
            <thead>
              <tr>
                <th>Date</th>
                <th className="droite">CA</th>
                <th className="droite">Encaissements</th>
                <th className="droite">Heures</th>
                <th className="droite">Intéress.</th>
              </tr>
            </thead>
            <tbody>
              {perso.map((l) => {
                const d = chromesPerso[l.date];
                const aChromes = d && (d.avances.length || d.remboursements.length || d.autres.length);
                return (
                  <Fragment key={l.caisse_id}>
                    <tr>
                      <td data-label="Date">
                        {formatDateFr(l.date)}
                        {!l.est_proprietaire && <span className="badge badge-solde tag-partage">partagée</span>}
                      </td>
                      <td className="droite" data-label="CA">{l.est_proprietaire ? formatEuros(l.ca_jour) : '—'}</td>
                      <td className="droite" data-label="Encaissements">{l.est_proprietaire ? formatEuros(l.encaissements) : '—'}</td>
                      <td className="droite" data-label="Heures">{formatNombre(l.heures_travaillees)}</td>
                      <td className="droite" data-label="Intéress.">{formatEuros(l.interessement)}</td>
                    </tr>
                    {aChromes && (
                      <tr className="histo-chromes-ligne">
                        <td colSpan={5}>
                          <div className="histo-chromes-jour">
                            <span className="histo-chromes-label">Chromes du jour :</span>
                            {d.avances.map((a, i) => (
                              <span key={`a${i}`} className="chip-chrome">
                                {a.surnom} <span className="dette">+{formatEuros(a.montant)}</span>
                              </span>
                            ))}
                            {d.remboursements.map((r, i) => (
                              <span key={`r${i}`} className="chip-chrome">
                                {r.surnom} <span className="solde-ok">−{formatEuros(r.montant)}</span>
                              </span>
                            ))}
                            {d.autres.map((v, i) => (
                              <span key={`o${i}`} className="chip-chrome">
                                {v.surnom} <span>{formatEuros(v.montant)}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {perso.length === 0 && (
                <tr><td colSpan={5} className="vide">Aucune clôture enregistrée.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --- Admin : édition d'une clôture ---
  function ouvrirEdition(c) {
    setEditId(c.caisse_id);
    setEditMsg('');
    setEditForm({
      cb: String(c.cb),
      especes: String(c.especes),
      virements: String(c.virements ?? 0),
      fond_caisse: String(c.fond_caisse),
      employe_id: c.employe_id,
    });
  }
  const majEdit = (champ) => (v) => setEditForm((f) => ({ ...f, [champ]: v }));

  async function enregistrerEdition(id) {
    // CA recalculé automatiquement : ventes_directes = CB + espèces + virements
    // (même convention que la Clôture — oublier les virements ici faisait
    // chuter le CA de la journée à chaque correction).
    const cb = parseMontant(editForm.cb);
    const especes = parseMontant(editForm.especes);
    const virements = parseMontant(editForm.virements);
    const fond = parseMontant(editForm.fond_caisse);
    if ([cb, especes, virements, fond].some((v) => v < 0)) {
      setEditMsg('Les montants ne peuvent pas être négatifs.');
      return;
    }
    const { error } = await supabase
      .from('caisse_jour')
      .update({
        employe_id: editForm.employe_id,
        ventes_directes: somme([cb, especes, virements]),
        cb,
        especes,
        virements,
        fond_caisse: fond,
      })
      .eq('id', id);
    if (error) {
      setEditMsg(
        error.code === '23505'
          ? 'Cet employé a déjà une clôture à cette date.'
          : `Erreur : ${error.message}`,
      );
      return;
    }
    setEditId(null);
    setEditMsg('');
    chargerAdmin();
  }

  async function supprimerCloture(id) {
    if (!window.confirm('Supprimer cette clôture ? Action irréversible.')) return;
    await supabase.from('caisse_jour').delete().eq('id', id);
    setEditId(null);
    chargerAdmin();
  }

  // --- Admin : fiches par clôture ---
  // On affiche une fiche par « jour travaillé » = union des clôtures ET des
  // dates de chromes. Ainsi un chrome anté/postdaté un jour SANS clôture (ex.
  // remboursement saisi des mois après) reste visible dans l'historique.
  const cles = new Set([
    ...closures.map((c) => `${c.employe_id}|${c.date}`),
    ...Object.keys(chromes),
  ]);
  const jours = [...cles]
    .map((cle) => {
      const [employe_id, date] = cle.split('|');
      return {
        cle,
        employe_id,
        date,
        closure: closures.find((c) => `${c.employe_id}|${c.date}` === cle) ?? null,
        det: chromes[cle] || { avances: [], remboursements: [], autres: [] },
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <div className="page">
      <h1>Historique général</h1>

      <div className="card filtres">
        <label className="field">
          <span>Mois</span>
          <input type="month" value={mois.slice(0, 7)} onChange={(e) => setMois(`${e.target.value}-01`)} />
        </label>
        <p className="periode-info">{closures.length} clôture(s)</p>
      </div>

      {jours.map((j) => {
        const c = j.closure;
        const det = j.det;
        const enEdition = c && editId === c.caisse_id;
        return (
          <div key={j.cle} className="card histo">
            <div className="histo-tete">
              <strong>{noms[j.employe_id] ?? '—'}</strong>
              <span className="histo-date">{formatDateFr(j.date)}</span>
            </div>

            {enEdition ? (
              <div className="bloc-form">
                <label className="field">
                  <span>Employé</span>
                  <select value={editForm.employe_id} onChange={(e) => majEdit('employe_id')(e.target.value)}>
                    {Object.entries(noms)
                      .sort((a, b) => a[1].localeCompare(b[1]))
                      .map(([id, nom]) => (
                        <option key={id} value={id}>
                          {nom}
                        </option>
                      ))}
                  </select>
                </label>
                <ChampMontant label="Encaissements CB" valeur={editForm.cb} onChange={majEdit('cb')} />
                <ChampMontant label="Espèces" valeur={editForm.especes} onChange={majEdit('especes')} />
                <ChampMontant label="Virements / autres" valeur={editForm.virements} onChange={majEdit('virements')} />
                <ChampMontant label="Fond de caisse" valeur={editForm.fond_caisse} onChange={majEdit('fond_caisse')} />
                <div className="form-inline">
                  <button className="btn btn-primary" onClick={() => enregistrerEdition(c.caisse_id)}>Enregistrer</button>
                  <button className="btn" onClick={() => setEditId(null)}>Annuler</button>
                  <button className="btn btn-discret" onClick={() => supprimerCloture(c.caisse_id)}>Supprimer</button>
                </div>
                {editMsg && <p className="message-erreur">{editMsg}</p>}
                <p className="statut">Les avances/remboursements se corrigent dans l’onglet Clients.</p>
              </div>
            ) : (
              <>
                {c ? (
                  <div className="histo-grille">
                    <span>CA</span><strong>{formatEuros(c.ca_jour)}</strong>
                    <span>CB</span><span>{formatEuros(c.cb)}</span>
                    <span>Espèces</span><span>{formatEuros(c.especes)}</span>
                    {Number(c.virements) > 0 && (
                      <>
                        <span>Virements / autres</span><span>{formatEuros(c.virements)}</span>
                      </>
                    )}
                    <span>Fond de caisse</span><span>{formatEuros(c.fond_caisse)}</span>
                  </div>
                ) : (
                  <p className="statut">Aucune clôture de caisse ce jour — chromes uniquement.</p>
                )}

                {det.avances.length > 0 && (
                  <div className="histo-bloc">
                    <span className="histo-titre">Avances</span>
                    {det.avances.map((a, i) => (
                      <div key={i} className="histo-chrome">
                        <span>{a.surnom}</span>
                        <span className="dette">+ {formatEuros(a.montant)}</span>
                        {a.modifie_le && (
                          <span className="histo-modif">
                            ✏️ corrigé par {noms[a.modifie_par] ?? '—'} le {formatDateFr(a.modifie_le)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {det.remboursements.length > 0 && (
                  <div className="histo-bloc">
                    <span className="histo-titre">Remboursements</span>
                    {det.remboursements.map((r, i) => (
                      <div key={i} className="histo-chrome">
                        <span>{r.surnom}</span>
                        <span className="solde-ok">− {formatEuros(r.montant)}</span>
                        {r.modifie_le && (
                          <span className="histo-modif">
                            ✏️ corrigé par {noms[r.modifie_par] ?? '—'} le {formatDateFr(r.modifie_le)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {det.autres.length > 0 && (
                  <div className="histo-bloc">
                    <span className="histo-titre">Autres</span>
                    {det.autres.map((v, i) => (
                      <div key={i} className="histo-chrome">
                        <span>{v.surnom}</span>
                        <span>{formatEuros(v.montant)}</span>
                        {v.modifie_le && (
                          <span className="histo-modif">
                            ✏️ corrigé par {noms[v.modifie_par] ?? '—'} le {formatDateFr(v.modifie_le)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {c && (
                  <button className="btn btn-discret" onClick={() => ouvrirEdition(c)}>Modifier</button>
                )}
              </>
            )}
          </div>
        );
      })}

      {jours.length === 0 && <p className="vide">Aucune activité ce mois-ci.</p>}
    </div>
  );
}
