import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { parseMontant, formatEuros, formatDateFr } from '../lib/format';
import { urlPlan } from '../lib/plan';
import ChampMontant from '../components/ChampMontant';
import { useInvite } from '../components/ModalePrompt';

// Page — Bons de commande (livraisons). Registre PARTAGÉ du magasin (comme les
// chromes) : tout membre crée, encaisse, fait avancer et supprime une commande —
// cloisonné par magasin via la RLS. Cycle : 🕐 En cours → ✅ Traitée → 📦 Envoyée.
// Paiement : payée ou pas, et comment (CB / espèces / virement / autre).
// Les commandes « En cours » remontent sur l'accueil (avec leur note) tant
// qu'elles ne sont pas traitées.
const STATUTS = {
  en_cours: { emoji: '🕐', libelle: 'En cours', classe: 'cmd-encours' },
  traitee: { emoji: '✅', libelle: 'Traitée', classe: 'cmd-traitee' },
  envoyee: { emoji: '📦', libelle: 'Envoyée', classe: 'cmd-envoyee' },
  annulee: { emoji: '🚫', libelle: 'Annulée', classe: 'cmd-annulee' },
};
const MODES = { cb: '💳 CB', especes: '💵 Espèces', virement: '🏦 Virement', autre: '💠 Autre' };
const ORDRE_STATUT = { en_cours: 0, traitee: 1, envoyee: 2, annulee: 3 };

const FORM_VIDE = { client_id: '', montant: '', payee: false, mode_paiement: 'cb', adresse: '', note: '' };

export default function Commandes() {
  const [commandes, setCommandes] = useState([]);
  const [clients, setClients] = useState([]);
  const [charge, setCharge] = useState(false);
  const [msg, setMsg] = useState('');
  // ?nouvelle=1 (raccourci de l'accueil) → formulaire de création ouvert d'emblée.
  const [searchParams] = useSearchParams();
  const [creationOuverte, setCreationOuverte] = useState(searchParams.get('nouvelle') === '1');
  const [form, setForm] = useState(FORM_VIDE);
  const [paiementPour, setPaiementPour] = useState(null); // id de la commande en cours d'encaissement
  const { invite, elementInvite } = useInvite();

  const charger = useCallback(async () => {
    const [{ data: cmds }, { data: cls }] = await Promise.all([
      supabase
        .from('commandes')
        .select(
          'id, client_id, montant, payee, mode_paiement, statut, note, adresse_livraison, created_at, clients(surnom, telephone)'
        )
        .order('created_at', { ascending: false }),
      supabase.from('v_solde_client').select('client_id, surnom, telephone, adresse').order('surnom'),
    ]);
    const liste = Array.isArray(cmds) ? cmds : [];
    liste.sort(
      (a, b) =>
        (ORDRE_STATUT[a.statut] ?? 9) - (ORDRE_STATUT[b.statut] ?? 9) ||
        (a.created_at < b.created_at ? 1 : -1)
    );
    setCommandes(liste);
    setClients(Array.isArray(cls) ? cls : []);
    setCharge(true);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // À la sélection du client, on pré-remplit l'adresse de livraison depuis sa fiche.
  function choisirClient(clientId) {
    const c = clients.find((x) => x.client_id === clientId);
    setForm((f) => ({ ...f, client_id: clientId, adresse: f.adresse || c?.adresse || '' }));
  }

  async function creerCommande(e) {
    e.preventDefault();
    setMsg('');
    if (!form.client_id) {
      setMsg('Choisis un client.');
      return;
    }
    const montant = parseMontant(form.montant);
    const { error } = await supabase.from('commandes').insert({
      client_id: form.client_id,
      montant,
      payee: form.payee,
      mode_paiement: form.payee ? form.mode_paiement : null,
      adresse_livraison: form.adresse.trim() || null,
      note: form.note.trim() || null,
    });
    if (error) {
      setMsg(`Création impossible : ${error.message}`);
      return;
    }
    setForm(FORM_VIDE);
    setCreationOuverte(false);
    setMsg('Commande créée ✅');
    charger();
  }

  async function changerStatut(id, statut) {
    const { error } = await supabase.from('commandes').update({ statut }).eq('id', id);
    if (error) setMsg(`Modification impossible : ${error.message}`);
    else charger();
  }

  async function encaisser(id, mode) {
    const { error } = await supabase
      .from('commandes')
      .update({ payee: true, mode_paiement: mode })
      .eq('id', id);
    setPaiementPour(null);
    if (error) setMsg(`Encaissement impossible : ${error.message}`);
    else charger();
  }

  // Adresse ÉPHÉMÈRE de la commande (vacances, lieu de travail…) : modifier ici
  // ne touche QUE cette commande, jamais l'adresse de la fiche client.
  async function modifierAdresseCommande(c) {
    const saisie = await invite({
      titre: 'Adresse de livraison (cette commande)',
      label: 'Adresse ponctuelle — la fiche client reste inchangée',
      valeurInitiale: c.adresse_livraison ?? '',
    });
    if (saisie == null) return;
    const adresse = saisie.trim() || null;
    const { error } = await supabase.from('commandes').update({ adresse_livraison: adresse }).eq('id', c.id);
    if (error) setMsg(`Modification impossible : ${error.message}`);
    else charger();
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer cette commande ?')) return;
    const { error } = await supabase.from('commandes').delete().eq('id', id);
    if (error) setMsg(`Suppression impossible : ${error.message}`);
    else charger();
  }

  const enCours = commandes.filter((c) => c.statut === 'en_cours');

  return (
    <div className="page">
      <div className="entete-client">
        <h1>📦 Commandes</h1>
        {!creationOuverte && (
          <button type="button" className="btn btn-primary btn-compact" onClick={() => setCreationOuverte(true)}>
            + Nouvelle commande
          </button>
        )}
      </div>

      {msg && <p className="statut">{msg}</p>}

      {creationOuverte && (
        <div className="card">
          <form className="form-chrome" onSubmit={creerCommande}>
            <label className="field">
              <span>Client</span>
              <select autoFocus value={form.client_id} onChange={(e) => choisirClient(e.target.value)}>
                <option value="">— Choisir —</option>
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>
                    {c.surnom}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Montant</span>
              <ChampMontant value={form.montant} onChange={(v) => setForm((f) => ({ ...f, montant: v }))} />
            </label>
            <label className="field">
              <span>Adresse de livraison (pour cette commande)</span>
              <input
                value={form.adresse}
                onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))}
                placeholder="Pré-remplie depuis la fiche — modifiable (vacances, travail…)"
              />
            </label>
            <label className="field cmd-payee-ligne">
              <input
                type="checkbox"
                checked={form.payee}
                onChange={(e) => setForm((f) => ({ ...f, payee: e.target.checked }))}
              />
              <span>Déjà payée</span>
            </label>
            {form.payee && (
              <label className="field">
                <span>Mode de paiement</span>
                <select
                  value={form.mode_paiement}
                  onChange={(e) => setForm((f) => ({ ...f, mode_paiement: e.target.value }))}
                >
                  {Object.entries(MODES).map(([val, lib]) => (
                    <option key={val} value={val}>
                      {lib}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Note de la commande</span>
              <textarea
                rows={2}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Contenu, créneau de livraison, code porte… (visible sur l'accueil)"
              />
            </label>
            <div className="form-inline">
              <button className="btn btn-primary" type="submit">
                Créer la commande
              </button>
              <button className="btn" type="button" onClick={() => setCreationOuverte(false)}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {!charge ? (
        <p className="statut">Chargement…</p>
      ) : commandes.length === 0 ? (
        <div className="card">
          <p className="vide">Aucune commande pour l’instant.</p>
          <p className="statut">
            Crée un bon de commande pour une livraison : il restera affiché sur l’accueil tant
            qu’il n’est pas traité.
          </p>
        </div>
      ) : (
        <>
          {enCours.length > 0 && (
            <p className="statut">
              🕐 {enCours.length} commande{enCours.length > 1 ? 's' : ''} en cours — visible
              {enCours.length > 1 ? 's' : ''} sur l’accueil jusqu’au traitement.
            </p>
          )}
          <ul className="cmd-liste">
            {commandes.map((c) => {
              const st = STATUTS[c.statut] ?? STATUTS.en_cours;
              return (
                <li key={c.id} className={`cmd-item ${st.classe}`}>
                  <div className="cmd-tete">
                    <span className="cmd-client">{c.clients?.surnom ?? 'Client'}</span>
                    <span className="cmd-montant">{formatEuros(Number(c.montant))}</span>
                  </div>
                  <div className="cmd-badges">
                    <span className={`cmd-badge ${st.classe}`}>
                      {st.emoji} {st.libelle}
                    </span>
                    {c.payee ? (
                      <span className={`cmd-badge ${c.statut === 'annulee' ? 'cmd-impaye' : 'cmd-paye'}`}>
                        💰 Payée{c.mode_paiement ? ` · ${MODES[c.mode_paiement] ?? c.mode_paiement}` : ''}
                        {c.statut === 'annulee' ? ' — à rembourser' : ''}
                      </span>
                    ) : c.statut !== 'annulee' ? (
                      <span className="cmd-badge cmd-impaye">⏳ À encaisser</span>
                    ) : null}
                    <span className="chrome-heure">{formatDateFr(c.created_at)}</span>
                  </div>
                  {c.note && <p className="cmd-note">📝 {c.note}</p>}
                  {c.adresse_livraison && (
                    <p className="cmd-note">
                      📍{' '}
                      <a href={urlPlan(c.adresse_livraison)} target="_blank" rel="noopener noreferrer">
                        {c.adresse_livraison}
                      </a>
                    </p>
                  )}
                  {c.clients?.telephone && (
                    <p className="cmd-note">
                      📞 <a href={`tel:${c.clients.telephone.replace(/\s/g, '')}`}>{c.clients.telephone}</a>
                    </p>
                  )}

                  {paiementPour === c.id ? (
                    <div className="form-inline">
                      {Object.entries(MODES).map(([val, lib]) => (
                        <button key={val} type="button" className="btn btn-compact" onClick={() => encaisser(c.id, val)}>
                          {lib}
                        </button>
                      ))}
                      <button type="button" className="btn btn-compact btn-discret" onClick={() => setPaiementPour(null)}>
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <div className="form-inline">
                      {!c.payee && c.statut !== 'annulee' && (
                        <button type="button" className="btn btn-compact" onClick={() => setPaiementPour(c.id)}>
                          💶 Encaisser
                        </button>
                      )}
                      {c.statut === 'en_cours' && (
                        <button type="button" className="btn btn-compact" onClick={() => changerStatut(c.id, 'traitee')}>
                          ✅ Marquer traitée
                        </button>
                      )}
                      {c.statut === 'traitee' && (
                        <button type="button" className="btn btn-compact" onClick={() => changerStatut(c.id, 'envoyee')}>
                          📦 Marquer envoyée
                        </button>
                      )}
                      {c.statut === 'en_cours' && (
                        <button
                          type="button"
                          className="btn btn-compact btn-discret"
                          onClick={() => modifierAdresseCommande(c)}
                        >
                          ✏️ Adresse
                        </button>
                      )}
                      {(c.statut === 'en_cours' || c.statut === 'traitee') && (
                        <button
                          type="button"
                          className="btn btn-compact btn-discret"
                          onClick={() => changerStatut(c.id, 'annulee')}
                        >
                          🚫 Annuler
                        </button>
                      )}
                      {c.statut !== 'en_cours' && (
                        <button
                          type="button"
                          className="btn btn-compact btn-discret"
                          onClick={() => changerStatut(c.id, c.statut === 'envoyee' ? 'traitee' : 'en_cours')}
                        >
                          ↩︎ {c.statut === 'annulee' ? 'Rouvrir' : 'Revenir'}
                        </button>
                      )}
                      <button type="button" className="btn btn-compact btn-discret" onClick={() => supprimer(c.id)}>
                        Supprimer
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {elementInvite}
    </div>
  );
}
