import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { parseMontant } from '../lib/format';

// Module — Gestion des magasins (réservé au super-admin / exploitant).
// Permet de créer un magasin et d'autoriser son premier administrateur.
export default function Magasins() {
  const [magasins, setMagasins] = useState([]);
  const [nomMagasin, setNomMagasin] = useState('');
  const [statut, setStatut] = useState('');
  const [admin, setAdmin] = useState({
    magasin_id: '',
    email: '',
    nom: '',
    motDePasse: '',
    pourcentage: '',
  });

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('magasins')
      .select('id, nom, actif, created_at')
      .order('created_at');
    setMagasins(data ?? []);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creerMagasin(e) {
    e.preventDefault();
    const nom = nomMagasin.trim();
    if (!nom) return;
    const { error } = await supabase.from('magasins').insert({ nom });
    if (error) {
      setStatut(`Erreur : ${error.message}`);
      return;
    }
    setNomMagasin('');
    setStatut('Magasin créé ✅');
    charger();
  }

  async function autoriserAdmin(e) {
    e.preventDefault();
    setStatut('');
    const email = admin.email.trim().toLowerCase();
    if (!email || !admin.magasin_id) {
      setStatut('Choisis un magasin et saisis un email.');
      return;
    }
    // 1) Autoriser l'email pour ce magasin, en rôle admin.
    const { error: errAuth } = await supabase.from('comptes_autorises').upsert(
      {
        email,
        role: 'admin',
        pourcentage_interessement: parseMontant(admin.pourcentage),
        magasin_id: admin.magasin_id,
      },
      { onConflict: 'email' },
    );
    if (errAuth) {
      setStatut(`Erreur autorisation : ${errAuth.message}`);
      return;
    }
    // 2) Si mot de passe + nom fournis, créer le compte tout de suite (Edge
    //    Function). Sinon, l'admin se connectera via Google avec cet email.
    if (admin.motDePasse && admin.nom.trim()) {
      const { data, error } = await supabase.functions.invoke('hyper-api', {
        body: {
          email,
          motDePasse: admin.motDePasse,
          nom: admin.nom.trim(),
          role: 'admin',
          pourcentage: admin.pourcentage,
        },
      });
      if (error || data?.error) {
        setStatut(
          `Email autorisé, mais création du compte en erreur : ${data?.error ?? error?.message}`,
        );
        return;
      }
      setStatut('Magasin + administrateur créés ✅');
    } else {
      setStatut('Email autorisé ✅ — l’admin peut se connecter avec Google (ou crée-lui un mot de passe).');
    }
    setAdmin({ magasin_id: '', email: '', nom: '', motDePasse: '', pourcentage: '' });
  }

  return (
    <div className="page">
      <h1>Magasins</h1>

      <form className="card" onSubmit={creerMagasin}>
        <h2>Nouveau magasin</h2>
        <label className="field">
          <span>Nom du magasin</span>
          <input
            value={nomMagasin}
            onChange={(e) => setNomMagasin(e.target.value)}
            placeholder="ex. Weedland Lyon"
          />
        </label>
        <button className="btn btn-primary" type="submit">
          Créer le magasin
        </button>
      </form>

      <form className="card" onSubmit={autoriserAdmin}>
        <h2>Autoriser un administrateur</h2>
        <p className="statut">
          Crée d’abord le magasin, puis autorise son admin. Avec un mot de passe + nom, le compte
          est créé immédiatement ; sinon l’admin se connecte avec Google via cet email.
        </p>
        <label className="field">
          <span>Magasin</span>
          <select
            value={admin.magasin_id}
            onChange={(e) => setAdmin((a) => ({ ...a, magasin_id: e.target.value }))}
          >
            <option value="">— Choisir —</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Email de l’admin</span>
          <input
            type="email"
            value={admin.email}
            onChange={(e) => setAdmin((a) => ({ ...a, email: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Nom (si création avec mot de passe)</span>
          <input value={admin.nom} onChange={(e) => setAdmin((a) => ({ ...a, nom: e.target.value }))} />
        </label>
        <label className="field">
          <span>Mot de passe (optionnel)</span>
          <input
            type="text"
            value={admin.motDePasse}
            onChange={(e) => setAdmin((a) => ({ ...a, motDePasse: e.target.value }))}
            placeholder="laisser vide pour connexion Google"
          />
        </label>
        <label className="field">
          <span>% d’intéressement (par défaut)</span>
          <input
            type="text"
            inputMode="decimal"
            value={admin.pourcentage}
            onChange={(e) => setAdmin((a) => ({ ...a, pourcentage: e.target.value }))}
          />
        </label>
        <button className="btn btn-primary" type="submit">
          Autoriser l’administrateur
        </button>
        {statut && <p className="statut">{statut}</p>}
      </form>

      <div className="card">
        <h2>Magasins existants</h2>
        <table className="tableau">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Créé le</th>
            </tr>
          </thead>
          <tbody>
            {magasins.map((m) => (
              <tr key={m.id}>
                <td>{m.nom}</td>
                <td>{new Date(m.created_at).toLocaleDateString('fr-FR')}</td>
              </tr>
            ))}
            {magasins.length === 0 && (
              <tr>
                <td colSpan={2} className="vide">
                  Aucun magasin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
