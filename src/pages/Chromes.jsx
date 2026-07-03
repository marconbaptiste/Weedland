import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros, formatDateFr } from '../lib/format';
import { aujourdhuiISO } from '../lib/dates';
import { soldeClient, statutSolde, somme } from '../lib/comptabilite';
import ChampMontant from '../components/ChampMontant';
import ModaleQR from '../components/ModaleQR';
import ModaleQRInscription from '../components/ModaleQRInscription';

// Libellés des actions du journal des chromes.
const LIB_ACTION = { creation: 'Créé', modification: 'Modifié', suppression: 'Supprimé' };

// Heure locale « HH:mm » d'un horodatage (affichée à côté de la date d'un chrome).
const formatHeure = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);
};

// Module 2 — Chromes (avances / crédits clients).
// RGPD : les clients sont identifiés par un SURNOM uniquement, jamais par leur
// nom/prénom réel. La description est interne (visible seulement du personnel).
export default function Chromes() {
  const { utilisateur, estAdmin, magasinId } = useAuth();
  const [recherche, setRecherche] = useState('');
  const [clients, setClients] = useState([]);
  const [clientSel, setClientSel] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [histoChrome, setHistoChrome] = useState([]); // journal des modifs de chromes du client
  const [promos, setPromos] = useState([]);
  const [clientsAvecPromo, setClientsAvecPromo] = useState(new Set());
  const [nouvellePromo, setNouvellePromo] = useState({ description: '', date: aujourdhuiISO() });
  const [editPromo, setEditPromo] = useState(null); // id
  const [editPromoForm, setEditPromoForm] = useState({ description: '', date: '' });
  const [msgClient, setMsgClient] = useState('');
  // Fidélité : palier du magasin + état de la carte du client sélectionné.
  const [palier, setPalier] = useState(10);
  const [fidelite, setFidelite] = useState({ tampons: 0, recompenses: 0 });
  const [qrModal, setQrModal] = useState(null); // { clientId, surnom } | null
  const [qrInscription, setQrInscription] = useState(false); // QR d'inscription magasin
  const [inscriptionsOuvertes, setInscriptionsOuvertes] = useState(true);
  const [faveurs, setFaveurs] = useState([]); // raccourcis de faveurs du magasin

  const [nouveau, setNouveau] = useState({ surnom: '', description: '', telephone: '' });
  const [creationOuverte, setCreationOuverte] = useState(false);

  // Fenêtre client scindée en 3 onglets-boutons : Fiche / Chromes / Note.
  const [ongletClient, setOngletClient] = useState('fiche'); // 'fiche' | 'chromes' | 'note'
  const [note, setNote] = useState('');
  const [noteMsg, setNoteMsg] = useState('');

  const [type, setType] = useState('avance');
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(aujourdhuiISO());

  // Édition en ligne d'une ligne de chrome (partagée : tout membre du magasin).
  const [editChrome, setEditChrome] = useState(null); // id
  const [editChromeForm, setEditChromeForm] = useState({ type: 'avance', montant: '', date: '', employe_id: '' });
  const [employes, setEmployes] = useState([]); // employés du magasin (réaffectation)

  const chargerClients = useCallback(async () => {
    const [{ data }, { data: pr }] = await Promise.all([
      supabase
        .from('v_solde_client')
        .select('client_id, surnom, description, telephone, solde')
        .order('surnom'),
      supabase.from('promos').select('client_id'),
    ]);
    setClients(data ?? []);
    setClientsAvecPromo(new Set((pr ?? []).map((p) => p.client_id)));
  }, []);

  useEffect(() => {
    chargerClients();
  }, [chargerClients]);

  // Palier de fidélité du magasin.
  useEffect(() => {
    if (!magasinId) return;
    supabase
      .from('magasins')
      .select('fidelite_palier, faveurs_raccourcis, inscriptions_ouvertes')
      .eq('id', magasinId)
      .single()
      .then(({ data }) => {
        setPalier(data?.fidelite_palier ?? 10);
        setFaveurs(data?.faveurs_raccourcis ?? []);
        setInscriptionsOuvertes(data?.inscriptions_ouvertes ?? true);
      });
  }, [magasinId]);

  // Employés du magasin : pour réaffecter un chrome lors d'une correction
  // (ex. chrome saisi par le mauvais employé / mauvaise date).
  useEffect(() => {
    supabase.rpc('collegues').then(({ data }) => setEmployes(data ?? []));
  }, [magasinId]);

  const chargerFidelite = useCallback(async (clientId) => {
    const { data } = await supabase
      .from('clients')
      .select('tampons, recompenses')
      .eq('id', clientId)
      .single();
    setFidelite({ tampons: data?.tampons ?? 0, recompenses: data?.recompenses ?? 0 });
  }, []);

  const ouvrirClient = useCallback(
    async (client) => {
      setClientSel(client);
      setMsgClient('');
      setOngletClient('fiche');
      setNote(client.description ?? '');
      setNoteMsg('');
      const [{ data: chr }, { data: pr }, { data: evt }] = await Promise.all([
        supabase
          .from('chromes')
          .select('id, type, montant, date, created_at, employe_id, users(nom)')
          .eq('client_id', client.client_id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('promos')
          .select('id, description, date, employe_id, users(nom)')
          .eq('client_id', client.client_id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('chrome_evenements')
          .select('id, action, type, montant, date_chrome, created_at, auteur:employe_id(nom)')
          .eq('client_id', client.client_id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      setLignes(chr ?? []);
      setPromos(pr ?? []);
      setHistoChrome(evt ?? []);
      chargerFidelite(client.client_id);
    },
    [chargerFidelite],
  );

  // Fidélité — actions (fonctions SECURITY DEFINER côté base).
  async function ajouterTampon() {
    await supabase.rpc('fidelite_ajouter', { p_client: clientSel.client_id });
    chargerFidelite(clientSel.client_id);
  }
  async function retirerTampon() {
    await supabase.rpc('fidelite_retirer', { p_client: clientSel.client_id });
    chargerFidelite(clientSel.client_id);
  }
  async function utiliserRecompense() {
    const { error } = await supabase.rpc('fidelite_utiliser', { p_client: clientSel.client_id });
    if (!error) setMsgClient('Récompense utilisée 🎁');
    chargerFidelite(clientSel.client_id);
  }
  async function changerPalier() {
    const v = window.prompt('Nombre de tampons pour une récompense :', String(palier));
    const n = parseInt(v, 10);
    if (!n || n < 1) return;
    const { error } = await supabase.rpc('fidelite_palier', { p_palier: n });
    if (!error) setPalier(n);
  }

  async function creerClient(e) {
    e.preventDefault();
    const surnom = nouveau.surnom.trim();
    if (!surnom) return;
    const { data, error } = await supabase
      .from('clients')
      .insert({
        surnom,
        description: nouveau.description.trim() || null,
        telephone: nouveau.telephone.trim() || null,
      })
      .select()
      .single();
    if (!error && data) {
      setNouveau({ surnom: '', description: '', telephone: '' });
      setCreationOuverte(false);
      await chargerClients();
      ouvrirClient({
        client_id: data.id,
        surnom: data.surnom,
        description: data.description,
        telephone: data.telephone,
        solde: 0,
      });
      // Affiche tout de suite le QR en grand : le client le prend en photo.
      setQrModal({ clientId: data.id, surnom: data.surnom });
    }
  }

  // Édition partagée de la fiche (surnom / téléphone / note) via la fonction
  // SECURITY DEFINER `client_maj` : tout membre du magasin peut corriger une
  // fiche, sans pouvoir toucher aux colonnes sensibles (fidélité, magasin…).
  async function majFiche({ surnom, telephone, description }) {
    return supabase.rpc('client_maj', {
      p_client: clientSel.client_id,
      p_surnom: surnom,
      p_telephone: telephone,
      p_note: description,
    });
  }

  async function renommerClient() {
    const surnom = window.prompt('Nouveau surnom du client :', clientSel.surnom);
    if (surnom == null) return;
    const s = surnom.trim();
    if (!s) return;
    const { error } = await majFiche({ surnom: s, telephone: clientSel.telephone, description: clientSel.description });
    if (error) {
      setMsgClient(`Renommage impossible : ${error.message}`);
      return;
    }
    setClientSel((c) => ({ ...c, surnom: s }));
    setMsgClient('Client renommé ✅');
    chargerClients();
  }

  async function modifierTelephone() {
    const saisie = window.prompt(
      'Numéro de téléphone du client (laisser vide pour effacer) :',
      clientSel.telephone ?? '',
    );
    if (saisie == null) return;
    const telephone = saisie.trim() || null;
    const { error } = await majFiche({ surnom: clientSel.surnom, telephone, description: clientSel.description });
    if (error) {
      setMsgClient(`Modification impossible : ${error.message}`);
      return;
    }
    setClientSel((c) => ({ ...c, telephone }));
    setMsgClient('Téléphone mis à jour ✅');
    chargerClients();
  }

  // Note interne (= description du client) — éditable par tout membre du magasin
  // via `client_maj` (fonction SECURITY DEFINER, colonnes limitées).
  async function enregistrerNote() {
    const valeur = note.trim() || null;
    const { error } = await majFiche({
      surnom: clientSel.surnom,
      telephone: clientSel.telephone,
      description: valeur,
    });
    if (error) {
      setNoteMsg(`Enregistrement impossible : ${error.message}`);
      return;
    }
    setClientSel((c) => ({ ...c, description: valeur }));
    setNoteMsg('Note enregistrée ✅');
    chargerClients();
  }

  // Notification push individuelle (ex. objet oublié) → carte du client.
  async function notifierClient() {
    const saisie = window.prompt('Message à envoyer sur la carte de ce client :', '');
    if (saisie == null) return;
    const texte = saisie.trim();
    if (!texte) return;
    const { data, error } = await supabase.functions.invoke('envoyer-push', {
      body: {
        magasinId,
        clientId: clientSel.client_id,
        titre: 'Message du magasin',
        corps: texte,
        url: `/carte/${clientSel.client_id}`,
      },
    });
    if (error || data?.error) {
      let detail = data?.error || error?.message || '';
      try {
        const c = await error?.context?.json?.();
        if (c?.error) detail = c.error;
      } catch {
        /* corps illisible */
      }
      setMsgClient(`Notification impossible : ${detail}`);
      return;
    }
    setMsgClient(
      data.envoyes > 0
        ? `🔔 Notification envoyée (${data.envoyes}).`
        : "Ce client n'a pas activé les notifications sur sa carte.",
    );
  }

  async function supprimerClient() {
    if (!window.confirm(`Supprimer définitivement la fiche « ${clientSel.surnom} » ?`)) return;
    const { error } = await supabase.from('clients').delete().eq('id', clientSel.client_id);
    if (error) {
      setMsgClient(
        'Suppression impossible : ce client a un historique de chromes. Soldez/supprimez ses lignes d’abord.',
      );
      return;
    }
    setClientSel(null);
    setLignes([]);
    setPromos([]);
    setMsgClient('');
    chargerClients();
  }

  async function supprimerLigne(id) {
    if (!window.confirm('Supprimer cette ligne ?')) return;
    await supabase.from('chromes').delete().eq('id', id);
    await ouvrirClient(clientSel);
    await chargerClients();
  }

  function commencerEditChrome(l) {
    setEditChrome(l.id);
    setEditChromeForm({
      type: l.type,
      montant: String(l.montant),
      date: l.date,
      employe_id: l.employe_id,
    });
  }

  async function enregistrerEditChrome(id) {
    const valeur = parseMontant(editChromeForm.montant);
    if (valeur <= 0) return;
    const { error } = await supabase
      .from('chromes')
      .update({
        type: editChromeForm.type,
        montant: valeur,
        date: editChromeForm.date,
        employe_id: editChromeForm.employe_id,
      })
      .eq('id', id);
    if (!error) {
      setEditChrome(null);
      await ouvrirClient(clientSel);
      await chargerClients();
    }
  }

  async function creerPromo(e) {
    e.preventDefault();
    const description = nouvellePromo.description.trim();
    if (!clientSel || !description) return;
    const { error } = await supabase.from('promos').insert({
      client_id: clientSel.client_id,
      description,
      date: nouvellePromo.date,
      employe_id: utilisateur.id,
    });
    if (!error) {
      setNouvellePromo({ description: '', date: aujourdhuiISO() });
      await ouvrirClient(clientSel);
      await chargerClients();
    }
  }

  // Ajout rapide d'une faveur via un raccourci configuré.
  async function ajouterFaveur(libelle) {
    if (!clientSel) return;
    const { error } = await supabase.from('promos').insert({
      client_id: clientSel.client_id,
      description: libelle,
      date: aujourdhuiISO(),
      employe_id: utilisateur.id,
    });
    if (!error) {
      await ouvrirClient(clientSel);
      await chargerClients();
    }
  }

  async function configurerFaveurs() {
    const v = window.prompt(
      'Raccourcis de faveurs (séparés par des virgules) :',
      faveurs.join(', '),
    );
    if (v == null) return;
    const liste = v.split(',').map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.rpc('faveurs_set', { p_libelles: liste });
    if (!error) setFaveurs(liste);
  }

  // Ouvre/ferme l'auto-inscription publique du magasin (admin).
  async function basculerInscriptions(ouvert) {
    const { error } = await supabase.rpc('inscriptions_set', { p_ouvert: ouvert });
    if (!error) setInscriptionsOuvertes(ouvert);
  }

  async function supprimerPromo(id) {
    if (!window.confirm('Supprimer cette promo ?')) return;
    await supabase.from('promos').delete().eq('id', id);
    await ouvrirClient(clientSel);
    await chargerClients();
  }

  function commencerEditPromo(p) {
    setEditPromo(p.id);
    setEditPromoForm({ description: p.description, date: p.date });
  }

  async function enregistrerEditPromo(id) {
    const description = editPromoForm.description.trim();
    if (!description) return;
    const { error } = await supabase
      .from('promos')
      .update({ description, date: editPromoForm.date })
      .eq('id', id);
    if (!error) {
      setEditPromo(null);
      await ouvrirClient(clientSel);
    }
  }

  async function ajouterLigne(e) {
    e.preventDefault();
    const valeur = parseMontant(montant);
    if (!clientSel || valeur <= 0) return;
    const { error } = await supabase.from('chromes').insert({
      client_id: clientSel.client_id,
      type,
      montant: valeur,
      date,
      employe_id: utilisateur.id,
    });
    if (!error) {
      setMontant('');
      await ouvrirClient(clientSel);
      await chargerClients();
    }
  }

  function fermerClient() {
    setClientSel(null);
    setLignes([]);
    setPromos([]);
    setMsgClient('');
  }

  const clientsFiltres = clients.filter((c) =>
    (c.surnom ?? '').toLowerCase().includes(recherche.toLowerCase()),
  );
  const solde = clientSel ? soldeClient(lignes) : 0;
  // Clients qui doivent (dette en cours) : solde > 0, du plus gros au plus petit.
  const debiteurs = clients
    .filter((c) => Number(c.solde) > 0)
    .sort((a, b) => Number(b.solde) - Number(a.solde));
  const totalDette = somme(debiteurs.map((c) => c.solde));

  return (
    <div className="page page-chromes">
      <h1>Clients</h1>
      {qrModal && (
        <ModaleQR
          clientId={qrModal.clientId}
          surnom={qrModal.surnom}
          onClose={() => setQrModal(null)}
        />
      )}
      {qrInscription && magasinId && (
        <ModaleQRInscription
          magasinId={magasinId}
          estAdmin={estAdmin}
          ouvert={inscriptionsOuvertes}
          onToggle={basculerInscriptions}
          onClose={() => setQrInscription(false)}
        />
      )}

      <div className="card">
          <input
            type="search"
            placeholder="Rechercher un surnom…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          <ul className="liste-clients">
            {clientsFiltres.map((c) => (
              <li key={c.client_id}>
                <button
                  className={`ligne-client ${clientSel?.client_id === c.client_id ? 'actif' : ''}`}
                  onClick={() => ouvrirClient(c)}
                >
                  <span>
                    {clientsAvecPromo.has(c.client_id) && <span title="Promo / faveur">★ </span>}
                    {c.surnom}
                  </span>
                  <span className={Number(c.solde) > 0 ? 'dette' : 'solde-ok'}>
                    {formatEuros(c.solde)}
                  </span>
                </button>
              </li>
            ))}
            {clientsFiltres.length === 0 && <li className="vide">Aucun client.</li>}
          </ul>

          {creationOuverte ? (
            <form className="form-chrome" onSubmit={creerClient}>
              <label className="field">
                <span>Surnom</span>
                <input
                  autoFocus
                  value={nouveau.surnom}
                  onChange={(e) => setNouveau((n) => ({ ...n, surnom: e.target.value }))}
                  placeholder="ex. Le Grand"
                />
              </label>
              <label className="field">
                <span>Téléphone (facultatif)</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={nouveau.telephone}
                  onChange={(e) => setNouveau((n) => ({ ...n, telephone: e.target.value }))}
                  placeholder="ex. 06 12 34 56 78 (avec l'accord du client)"
                />
              </label>
              <label className="field">
                <span>Description (interne)</span>
                <textarea
                  rows={2}
                  value={nouveau.description}
                  onChange={(e) => setNouveau((n) => ({ ...n, description: e.target.value }))}
                  placeholder="Signe distinctif, repère… (jamais de nom réel)"
                />
              </label>
              <div className="form-inline">
                <button className="btn btn-primary" type="submit">
                  Créer la fiche
                </button>
                <button className="btn" type="button" onClick={() => setCreationOuverte(false)}>
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <div className="form-inline">
              <button className="btn" onClick={() => setCreationOuverte(true)}>
                + Nouvelle fiche client
              </button>
              <button type="button" className="btn" onClick={() => setQrInscription(true)}>
                📲 QR d’inscription
              </button>
            </div>
          )}
        </div>

      <div className="card">
        <h2>Clients qui doivent</h2>
        {debiteurs.length === 0 ? (
          <p className="vide">Aucune dette en cours 🎉</p>
        ) : (
          <>
            <ul className="liste-clients">
              {debiteurs.map((c) => (
                <li key={c.client_id}>
                  <button className="ligne-client" onClick={() => ouvrirClient(c)}>
                    <span>
                      {clientsAvecPromo.has(c.client_id) && <span title="Promo / faveur">★ </span>}
                      {c.surnom}
                    </span>
                    <span className="dette">{formatEuros(c.solde)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="recap-ligne">
              <span>Total dû ({debiteurs.length} client{debiteurs.length > 1 ? 's' : ''})</span>
              <strong className="dette">{formatEuros(totalDette)}</strong>
            </div>
          </>
        )}
      </div>

      {clientSel && (
        <div className="aide-fond" role="dialog" aria-modal="true" aria-label="Fiche client" onClick={fermerClient}>
          <div className="modale-client" onClick={(e) => e.stopPropagation()}>
            <div className="modale-client-tete">
              <strong>{clientSel.surnom}</strong>
              <button type="button" className="btn btn-discret" onClick={fermerClient}>
                Fermer
              </button>
            </div>
              <div className="entete-client">
                <span className={`badge ${solde > 0 ? 'badge-dette' : 'badge-solde'}`}>
                  {statutSolde(solde)} · {formatEuros(solde)}
                </span>
              </div>
              {/* 3 onglets-boutons : Fiche / Chromes / Note */}
              <div className="bascule">
                <button type="button" className={ongletClient === 'fiche' ? 'actif' : ''} onClick={() => setOngletClient('fiche')}>
                  Fiche
                </button>
                <button type="button" className={ongletClient === 'chromes' ? 'actif' : ''} onClick={() => setOngletClient('chromes')}>
                  Chromes
                </button>
                <button type="button" className={ongletClient === 'note' ? 'actif' : ''} onClick={() => setOngletClient('note')}>
                  Note
                </button>
              </div>
              {msgClient && <p className="statut">{msgClient}</p>}

              {ongletClient === 'fiche' && clientSel.telephone && (
                <p className="telephone-client">
                  📞 <a href={`tel:${clientSel.telephone.replace(/\s/g, '')}`}>{clientSel.telephone}</a>
                </p>
              )}
              {ongletClient === 'fiche' && (
                <div className="form-inline">
                  <button type="button" className="btn" onClick={renommerClient}>
                    Renommer
                  </button>
                  <button type="button" className="btn" onClick={modifierTelephone}>
                    {clientSel.telephone ? 'Modifier le téléphone' : 'Ajouter un téléphone'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setQrModal({ clientId: clientSel.client_id, surnom: clientSel.surnom })}
                  >
                    🎫 QR carte
                  </button>
                  {estAdmin && (
                    <button type="button" className="btn btn-discret" onClick={notifierClient}>
                      🔔 Notifier
                    </button>
                  )}
                  {estAdmin && (
                    <button type="button" className="btn btn-discret" onClick={supprimerClient}>
                      Supprimer la fiche
                    </button>
                  )}
                </div>
              )}

              {ongletClient === 'chromes' && (
              <div className="section-promos">
                <div className="entete-client">
                  <h3>💸 Chromes — avances / remboursements</h3>
                </div>
                <form className="form-chrome" onSubmit={ajouterLigne}>
                  <div className="bascule">
                    <button
                      type="button"
                      className={type === 'avance' ? 'actif' : ''}
                      onClick={() => setType('avance')}
                    >
                      Avance (+)
                    </button>
                    <button
                      type="button"
                      className={type === 'remboursement' ? 'actif' : ''}
                      onClick={() => setType('remboursement')}
                    >
                      Remboursement (−)
                    </button>
                  </div>
                  <ChampMontant label="Montant" valeur={montant} onChange={setMontant} />
                  <label className="field">
                    <span>Date</span>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </label>
                  <button className="btn btn-primary" type="submit">
                    Enregistrer la ligne
                  </button>
                </form>

                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="droite">Montant</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) =>
                      editChrome === l.id ? (
                        <tr key={l.id}>
                          <td colSpan={3}>
                            <div className="bloc-form">
                              <label className="field">
                                <span>Date</span>
                                <input
                                  type="date"
                                  value={editChromeForm.date}
                                  onChange={(e) => setEditChromeForm((f) => ({ ...f, date: e.target.value }))}
                                />
                              </label>
                              <label className="field">
                                <span>Employé</span>
                                <select
                                  value={editChromeForm.employe_id ?? ''}
                                  onChange={(e) =>
                                    setEditChromeForm((f) => ({ ...f, employe_id: e.target.value }))
                                  }
                                >
                                  {employes.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                      {emp.nom}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="field">
                                <span>Type</span>
                                <select
                                  value={editChromeForm.type}
                                  onChange={(e) => setEditChromeForm((f) => ({ ...f, type: e.target.value }))}
                                >
                                  <option value="avance">Avance</option>
                                  <option value="remboursement">Remboursement</option>
                                </select>
                              </label>
                              <ChampMontant
                                label="Montant"
                                valeur={editChromeForm.montant}
                                onChange={(v) => setEditChromeForm((f) => ({ ...f, montant: v }))}
                              />
                              <div className="form-inline">
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => enregistrerEditChrome(l.id)}
                                >
                                  Enregistrer
                                </button>
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() => setEditChrome(null)}
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={l.id}>
                          <td>
                            {formatDateFr(l.date)}
                            {l.created_at && <span className="chrome-heure"> · {formatHeure(l.created_at)}</span>}
                          </td>
                          <td className={`droite ${l.type === 'avance' ? 'dette' : 'solde-ok'}`}>
                            {l.type === 'avance' ? '+' : '−'} {formatEuros(l.montant)}
                          </td>
                          <td className="actions-cellule">
                            {/* Registre partagé : tout employé du magasin peut ajuster un chrome. */}
                            <button
                              type="button"
                              className="btn btn-discret"
                              onClick={() => commencerEditChrome(l)}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="btn btn-discret"
                              onClick={() => supprimerLigne(l.id)}
                              aria-label="Supprimer la ligne"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ),
                    )}
                    {lignes.length === 0 && (
                      <tr>
                        <td colSpan={3} className="vide">
                          Aucune ligne.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="chrome-histo">
                  <h4>🕓 Historique des modifications</h4>
                  {histoChrome.length === 0 ? (
                    <p className="vide">Aucune modification enregistrée.</p>
                  ) : (
                    <ul className="chrome-histo-liste">
                      {histoChrome.map((e) => (
                        <li key={e.id}>
                          <span className="chrome-histo-quand">
                            {formatDateFr(e.created_at)} · {formatHeure(e.created_at)}
                          </span>
                          <span className={`chrome-histo-action action-${e.action}`}>
                            {LIB_ACTION[e.action] ?? e.action}
                          </span>
                          <span className="chrome-histo-montant">
                            {e.type === 'avance' ? '+' : e.type === 'remboursement' ? '−' : ''}
                            {e.montant != null ? formatEuros(e.montant) : ''}
                          </span>
                          <span className="chrome-histo-qui">{e.auteur?.nom ?? '—'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              )}

              {ongletClient === 'fiche' && (
              <div className="section-promos">
                <div className="entete-client">
                  <h3>🎟️ Carte de fidélité</h3>
                  <span className="promo-qui">
                    {fidelite.tampons}/{palier}
                    <button
                      type="button"
                      className="btn btn-discret"
                      onClick={() => setQrModal({ clientId: clientSel.client_id, surnom: clientSel.surnom })}
                    >
                      QR
                    </button>
                    {estAdmin && (
                      <button type="button" className="btn btn-discret" onClick={changerPalier}>
                        Palier
                      </button>
                    )}
                  </span>
                </div>
                <div className="tampons">
                  {Array.from({ length: palier }).map((_, i) => (
                    <span key={i} className={`tampon ${i < fidelite.tampons ? 'plein' : ''}`}>
                      {i < fidelite.tampons ? '★' : '☆'}
                    </span>
                  ))}
                </div>
                {fidelite.tampons >= palier ? (
                  <div className="form-inline">
                    <div className="voyant voyant-vert" style={{ flex: 1 }}>
                      🎁 Carte complète — récompense disponible
                    </div>
                    <button type="button" className="btn btn-primary" onClick={utiliserRecompense}>
                      Utiliser
                    </button>
                  </div>
                ) : (
                  <div className="form-inline">
                    <button type="button" className="btn btn-primary" onClick={ajouterTampon}>
                      + 1 tampon
                    </button>
                    <button type="button" className="btn btn-discret" onClick={retirerTampon}>
                      −
                    </button>
                  </div>
                )}
                {fidelite.recompenses > 0 && (
                  <p className="statut">{fidelite.recompenses} récompense(s) déjà utilisée(s).</p>
                )}
              </div>
              )}

              {ongletClient === 'fiche' && (
              <div className="section-promos">
                <div className="entete-client">
                  <h3>★ Promos / traitements de faveur</h3>
                  {estAdmin && (
                    <button type="button" className="btn btn-discret" onClick={configurerFaveurs}>
                      ⚙️ Raccourcis
                    </button>
                  )}
                </div>
                {faveurs.length > 0 && (
                  <div className="faveurs-rapides">
                    {faveurs.map((f) => (
                      <button key={f} type="button" className="btn" onClick={() => ajouterFaveur(f)}>
                        + {f}
                      </button>
                    ))}
                  </div>
                )}
                <form className="form-inline" onSubmit={creerPromo}>
                  <input
                    placeholder="ex. -10% sur tout, 1 g offert…"
                    value={nouvellePromo.description}
                    onChange={(e) => setNouvellePromo((p) => ({ ...p, description: e.target.value }))}
                  />
                  <input
                    type="date"
                    value={nouvellePromo.date}
                    onChange={(e) => setNouvellePromo((p) => ({ ...p, date: e.target.value }))}
                  />
                  <button className="btn" type="submit">
                    Ajouter
                  </button>
                </form>
                <ul className="liste-promos">
                  {promos.map((p) =>
                    editPromo === p.id ? (
                      <li key={p.id}>
                        <input
                          type="date"
                          value={editPromoForm.date}
                          onChange={(e) => setEditPromoForm((f) => ({ ...f, date: e.target.value }))}
                        />
                        <input
                          className="promo-desc"
                          value={editPromoForm.description}
                          onChange={(e) =>
                            setEditPromoForm((f) => ({ ...f, description: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-discret"
                          onClick={() => enregistrerEditPromo(p.id)}
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          className="btn btn-discret"
                          onClick={() => setEditPromo(null)}
                        >
                          ✕
                        </button>
                      </li>
                    ) : (
                      <li key={p.id}>
                        <span className="promo-date">{formatDateFr(p.date)}</span>
                        <span className="promo-desc">{p.description}</span>
                        <span className="promo-qui">{p.users?.nom ?? '—'}</span>
                        {(estAdmin || p.employe_id === utilisateur.id) && (
                          <>
                            <button
                              type="button"
                              className="btn btn-discret"
                              onClick={() => commencerEditPromo(p)}
                              aria-label="Modifier la promo"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="btn btn-discret"
                              onClick={() => supprimerPromo(p.id)}
                              aria-label="Supprimer la promo"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </li>
                    ),
                  )}
                  {promos.length === 0 && <li className="vide">Aucune promo enregistrée.</li>}
                </ul>
              </div>
              )}

              {ongletClient === 'note' && (
                <div className="section-promos">
                  <div className="entete-client">
                    <h3>📝 Note interne</h3>
                  </div>
                  <p className="statut">
                    Repère interne pour le personnel (jamais de nom réel).
                  </p>
                  <textarea
                    rows={5}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Signe distinctif, préférences, rappel…"
                  />
                  <div className="form-inline">
                    <button type="button" className="btn btn-primary" onClick={enregistrerNote}>
                      Enregistrer la note
                    </button>
                  </div>
                  {noteMsg && <p className="statut">{noteMsg}</p>}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
