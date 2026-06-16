import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros, formatDateFr } from '../lib/format';
import { aujourdhuiISO } from '../lib/dates';
import { soldeClient, statutSolde } from '../lib/comptabilite';
import ChampMontant from '../components/ChampMontant';

// Module 2 — Chromes (avances / crédits clients).
// RGPD : les clients sont identifiés par un SURNOM uniquement, jamais par leur
// nom/prénom réel. La description est interne (visible seulement du personnel).
export default function Chromes() {
  const { utilisateur, estAdmin } = useAuth();
  const [recherche, setRecherche] = useState('');
  const [clients, setClients] = useState([]);
  const [clientSel, setClientSel] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [promos, setPromos] = useState([]);
  const [clientsAvecPromo, setClientsAvecPromo] = useState(new Set());
  const [nouvellePromo, setNouvellePromo] = useState({ description: '', date: aujourdhuiISO() });

  const [nouveau, setNouveau] = useState({ surnom: '', description: '' });
  const [creationOuverte, setCreationOuverte] = useState(false);

  const [type, setType] = useState('avance');
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(aujourdhuiISO());

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

  const ouvrirClient = useCallback(async (client) => {
    setClientSel(client);
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
  }, []);

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
    }
  }

  async function supprimerLigne(id) {
    await supabase.from('chromes').delete().eq('id', id);
    await ouvrirClient(clientSel);
    await chargerClients();
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
    await supabase.from('promos').delete().eq('id', id);
    await ouvrirClient(clientSel);
    await chargerClients();
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

  const clientsFiltres = clients.filter((c) =>
    (c.surnom ?? '').toLowerCase().includes(recherche.toLowerCase()),
  );
  const solde = clientSel ? soldeClient(lignes) : 0;

  return (
    <div className="page page-chromes">
      <h1>Chromes</h1>

      <div className="colonnes">
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

        <div className="card">
          {!clientSel ? (
            <p className="vide">Sélectionnez un client pour voir son historique.</p>
          ) : (
            <>
              <div className="entete-client">
                <h2>{clientSel.surnom}</h2>
                <span className={`badge ${solde > 0 ? 'badge-dette' : 'badge-solde'}`}>
                  {statutSolde(solde)} · {formatEuros(solde)}
                </span>
              </div>
              {clientSel.description && (
                <p className="description-client">{clientSel.description}</p>
              )}

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
                  {promos.map((p) => (
                    <li key={p.id}>
                      <span className="promo-date">{formatDateFr(p.date)}</span>
                      <span className="promo-desc">{p.description}</span>
                      <span className="promo-qui">{p.users?.nom ?? '—'}</span>
                      {(estAdmin || p.employe_id === utilisateur.id) && (
                        <button
                          type="button"
                          className="btn btn-discret"
                          onClick={() => supprimerPromo(p.id)}
                          aria-label="Supprimer la promo"
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
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
                  {lignes.map((l) => (
                    <tr key={l.id}>
                      <td>{formatDateFr(l.date)}</td>
                      <td>{l.type === 'avance' ? 'Avance' : 'Remboursement'}</td>
                      <td className={`droite ${l.type === 'avance' ? 'dette' : 'solde-ok'}`}>
                        {l.type === 'avance' ? '+' : '−'} {formatEuros(l.montant)}
                      </td>
                      <td>{l.users?.nom ?? '—'}</td>
                      <td>
                        {(estAdmin || l.employe_id === utilisateur.id) && (
                          <button
                            type="button"
                            className="btn btn-discret"
                            onClick={() => supprimerLigne(l.id)}
                            aria-label="Supprimer la ligne"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {lignes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="vide">
                        Aucune ligne.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
