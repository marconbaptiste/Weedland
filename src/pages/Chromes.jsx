import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros, formatDateFr } from '../lib/format';
import { aujourdhuiISO } from '../lib/dates';
import { soldeClient, statutSolde } from '../lib/comptabilite';
import ChampMontant from '../components/ChampMontant';

// Module 2 — Chromes (avances / crédits clients).
export default function Chromes() {
  const { utilisateur } = useAuth();
  const [recherche, setRecherche] = useState('');
  const [clients, setClients] = useState([]);
  const [clientSel, setClientSel] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [nouveauNom, setNouveauNom] = useState('');

  const [type, setType] = useState('avance');
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(aujourdhuiISO());

  const chargerClients = useCallback(async () => {
    const { data } = await supabase
      .from('v_solde_client')
      .select('client_id, nom, solde')
      .order('nom');
    setClients(data ?? []);
  }, []);

  useEffect(() => {
    chargerClients();
  }, [chargerClients]);

  const ouvrirClient = useCallback(async (client) => {
    setClientSel(client);
    const { data } = await supabase
      .from('chromes')
      .select('id, type, montant, date, employe_id, users(nom)')
      .eq('client_id', client.client_id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    setLignes(data ?? []);
  }, []);

  async function creerClient(e) {
    e.preventDefault();
    const nom = nouveauNom.trim();
    if (!nom) return;
    const { data, error } = await supabase.from('clients').insert({ nom }).select().single();
    setNouveauNom('');
    if (!error && data) {
      await chargerClients();
      ouvrirClient({ client_id: data.id, nom: data.nom, solde: 0 });
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

  const clientsFiltres = clients.filter((c) =>
    c.nom.toLowerCase().includes(recherche.toLowerCase()),
  );
  const solde = clientSel ? soldeClient(lignes) : 0;

  return (
    <div className="page page-chromes">
      <h1>Chromes</h1>

      <div className="colonnes">
        <div className="card">
          <input
            type="search"
            placeholder="Rechercher un client…"
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
                  <span>{c.nom}</span>
                  <span className={Number(c.solde) > 0 ? 'dette' : 'solde-ok'}>
                    {formatEuros(c.solde)}
                  </span>
                </button>
              </li>
            ))}
            {clientsFiltres.length === 0 && <li className="vide">Aucun client.</li>}
          </ul>
          <form className="form-inline" onSubmit={creerClient}>
            <input
              placeholder="Nouveau client (nom)"
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
            />
            <button className="btn" type="submit">
              Ajouter
            </button>
          </form>
        </div>

        <div className="card">
          {!clientSel ? (
            <p className="vide">Sélectionnez un client pour voir son historique.</p>
          ) : (
            <>
              <div className="entete-client">
                <h2>{clientSel.nom}</h2>
                <span className={`badge ${solde > 0 ? 'badge-dette' : 'badge-solde'}`}>
                  {statutSolde(solde)} · {formatEuros(solde)}
                </span>
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
                    </tr>
                  ))}
                  {lignes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="vide">
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
