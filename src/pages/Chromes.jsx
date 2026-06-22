import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros, formatDateFr } from '../lib/format';
import { aujourdhuiISO } from '../lib/dates';
import { soldeClient, statutSolde } from '../lib/comptabilite';
import ChampMontant from '../components/ChampMontant';
import ModaleQR from '../components/ModaleQR';

// Module 2 — Chromes (avances / crédits clients).
// RGPD : les clients sont identifiés par un SURNOM uniquement, jamais par leur
// nom/prénom réel. La description est interne (visible seulement du personnel).
export default function Chromes() {
  const { utilisateur, estAdmin, magasinId } = useAuth();
  const [recherche, setRecherche] = useState('');
  const [clients, setClients] = useState([]);
  const [clientSel, setClientSel] = useState(null);
  const [lignes, setLignes] = useState([]);
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

  const [nouveau, setNouveau] = useState({ surnom: '', description: '' });
  const [creationOuverte, setCreationOuverte] = useState(false);

  const [type, setType] = useState('avance');
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(aujourdhuiISO());

  // Édition en ligne d'une ligne de chrome (admin ou auteur).
  const [editChrome, setEditChrome] = useState(null); // id
  const [editChromeForm, setEditChromeForm] = useState({ type: 'avance', montant: '', date: '' });

  const chargerClients = useCallback(async () => {
    const [{ data }, { data: pr }] = await Promise.all([
      supabase.from('v_solde_client').select('client_id, surnom, description, solde').order('surnom'),
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
      .select('fidelite_palier')
      .eq('id', magasinId)
      .single()
      .then(({ data }) => setPalier(data?.fidelite_palier ?? 10));
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
      const [{ data: chr }, { data: pr }] = await Promise.all([
        supabase
          .from('chromes')
          .select('id, type, montant, date, employe_id, users(nom)')
          .eq('client_id', client.client_id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('promos')
          .select('id, description, date, employe_id, users(nom)')
          .eq('client_id', client.client_id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);
      setLignes(chr ?? []);
      setPromos(pr ?? []);
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
      .insert({ surnom, description: nouveau.description.trim() || null })
      .select()
      .single();
    if (!error && data) {
      setNouveau({ surnom: '', description: '' });
      setCreationOuverte(false);
      await chargerClients();
      ouvrirClient({
        client_id: data.id,
        surnom: data.surnom,
        description: data.description,
        solde: 0,
      });
      // Affiche tout de suite le QR en grand : le client le prend en photo.
      setQrModal({ clientId: data.id, surnom: data.surnom });
    }
  }

  async function renommerClient() {
    const surnom = window.prompt('Nouveau surnom du client :', clientSel.surnom);
    if (surnom == null) return;
    const s = surnom.trim();
    if (!s) return;
    const { error } = await supabase.from('clients').update({ surnom: s }).eq('id', clientSel.client_id);
    if (error) {
      setMsgClient(`Renommage impossible : ${error.message}`);
      return;
    }
    setClientSel((c) => ({ ...c, surnom: s }));
    setMsgClient('Client renommé ✅');
    chargerClients();
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
    setEditChromeForm({ type: l.type, montant: String(l.montant), date: l.date });
  }

  async function enregistrerEditChrome(id) {
    const valeur = parseMontant(editChromeForm.montant);
    if (valeur <= 0) return;
    const { error } = await supabase
      .from('chromes')
      .update({ type: editChromeForm.type, montant: valeur, date: editChromeForm.date })
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
            <button className="btn" onClick={() => setCreationOuverte(true)}>
              + Nouvelle fiche client
            </button>
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
              {clientSel.description && (
                <p className="description-client">{clientSel.description}</p>
              )}
              {estAdmin && (
                <div className="form-inline">
                  <button type="button" className="btn" onClick={renommerClient}>
                    Renommer
                  </button>
                  <button type="button" className="btn btn-discret" onClick={supprimerClient}>
                    Supprimer la fiche
                  </button>
                </div>
              )}
              {msgClient && <p className="statut">{msgClient}</p>}

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

              <div className="section-promos">
                <h3>★ Promos / traitements de faveur</h3>
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
                    <th>Type</th>
                    <th className="droite">Montant</th>
                    <th>Employé</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) =>
                    editChrome === l.id ? (
                      <tr key={l.id}>
                        <td>
                          <input
                            type="date"
                            value={editChromeForm.date}
                            onChange={(e) => setEditChromeForm((f) => ({ ...f, date: e.target.value }))}
                          />
                        </td>
                        <td>
                          <select
                            value={editChromeForm.type}
                            onChange={(e) => setEditChromeForm((f) => ({ ...f, type: e.target.value }))}
                          >
                            <option value="avance">Avance</option>
                            <option value="remboursement">Remboursement</option>
                          </select>
                        </td>
                        <td className="droite">
                          <input
                            className="champ-pourcentage"
                            type="text"
                            inputMode="decimal"
                            value={editChromeForm.montant}
                            onChange={(e) => setEditChromeForm((f) => ({ ...f, montant: e.target.value }))}
                          />
                        </td>
                        <td>{l.users?.nom ?? '—'}</td>
                        <td className="actions-cellule">
                          <button
                            type="button"
                            className="btn btn-discret"
                            onClick={() => enregistrerEditChrome(l.id)}
                          >
                            Enregistrer
                          </button>
                          <button
                            type="button"
                            className="btn btn-discret"
                            onClick={() => setEditChrome(null)}
                          >
                            Annuler
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={l.id}>
                        <td>{formatDateFr(l.date)}</td>
                        <td>{l.type === 'avance' ? 'Avance' : 'Remboursement'}</td>
                        <td className={`droite ${l.type === 'avance' ? 'dette' : 'solde-ok'}`}>
                          {l.type === 'avance' ? '+' : '−'} {formatEuros(l.montant)}
                        </td>
                        <td>{l.users?.nom ?? '—'}</td>
                        <td className="actions-cellule">
                          {(estAdmin || l.employe_id === utilisateur.id) && (
                            <>
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
                            </>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                  {lignes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="vide">
                        Aucune ligne.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
          </div>
        </div>
      )}
    </div>
  );
}
