import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant } from '../lib/format';

// Module — Gestion des comptes (réservé admin).
// La création de compte passe par l'Edge Function `creer-employe` (clé
// service_role côté serveur). Le changement de rôle se fait directement (RLS).
export default function Comptes() {
  const { utilisateur } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    nom: '',
    email: '',
    motDePasse: '',
    role: 'employe',
    pourcentage: '',
  });
  const [statut, setStatut] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('id, nom, role, pourcentage_interessement')
      .order('nom');
    setUsers(data ?? []);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function changerRole(id, role) {
    await supabase.from('users').update({ role }).eq('id', id);
    charger();
  }

  // Met à jour l'affichage local du taux pendant la saisie.
  function majPourcentageLocal(id, valeur) {
    setUsers((liste) =>
      liste.map((u) => (u.id === id ? { ...u, pourcentage_interessement: valeur } : u)),
    );
  }

  // Persiste le taux d'intéressement de l'employé (au blur).
  async function enregistrerPourcentage(id, valeur) {
    const taux = parseMontant(valeur);
    await supabase.from('users').update({ pourcentage_interessement: taux }).eq('id', id);
    charger();
  }

  // Nom : édition locale puis persistance au blur.
  function majNomLocal(id, valeur) {
    setUsers((liste) => liste.map((u) => (u.id === id ? { ...u, nom: valeur } : u)));
  }

  async function enregistrerNom(id, valeur) {
    const nom = valeur.trim();
    if (!nom) {
      charger(); // restaure l'ancien nom si vidé
      return;
    }
    await supabase.from('users').update({ nom }).eq('id', id);
    charger();
  }

  async function creer(e) {
    e.preventDefault();
    setEnvoi(true);
    setStatut('');
    const { data, error } = await supabase.functions.invoke('creer-employe', { body: form });
    setEnvoi(false);
    if (error) {
      let message = 'Erreur lors de la création (la fonction creer-employe est-elle déployée ?).';
      try {
        const corps = await error.context.json();
        if (corps?.error) message = corps.error;
      } catch {
        /* corps non lisible : on garde le message générique */
      }
      setStatut(message);
      return;
    }
    if (data?.error) {
      setStatut(data.error);
      return;
    }
    setForm({ nom: '', email: '', motDePasse: '', role: 'employe', pourcentage: '' });
    setStatut('Compte créé ✅');
    charger();
  }

  return (
    <div className="page">
      <h1>Comptes</h1>

      <form className="card" onSubmit={creer}>
        <h2>Nouveau compte</h2>
        <label className="field">
          <span>Nom</span>
          <input
            value={form.nom}
            onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
            required
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input
            type="text"
            value={form.motDePasse}
            onChange={(e) => setForm((f) => ({ ...f, motDePasse: e.target.value }))}
            required
          />
        </label>
        <label className="field">
          <span>Rôle</span>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="employe">Employé</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="field">
          <span>% d’intéressement (par défaut)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="ex. 5"
            value={form.pourcentage}
            onChange={(e) => setForm((f) => ({ ...f, pourcentage: e.target.value }))}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={envoi}>
          {envoi ? 'Création…' : 'Créer le compte'}
        </button>
        {statut && <p className="statut">{statut}</p>}
      </form>

      <div className="card">
        <h2>Employés</h2>
        <table className="tableau">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Rôle</th>
              <th className="droite">% intéress.</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <input
                    className="champ-nom"
                    type="text"
                    value={u.nom ?? ''}
                    onChange={(e) => majNomLocal(u.id, e.target.value)}
                    onBlur={(e) => enregistrerNom(u.id, e.target.value)}
                  />
                </td>
                <td>
                  {u.id === utilisateur.id ? (
                    <span className="badge badge-solde">Admin (vous)</span>
                  ) : (
                    <select value={u.role} onChange={(e) => changerRole(u.id, e.target.value)}>
                      <option value="employe">Employé</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                </td>
                <td className="droite">
                  <input
                    className="champ-pourcentage"
                    type="text"
                    inputMode="decimal"
                    value={u.pourcentage_interessement ?? ''}
                    onChange={(e) => majPourcentageLocal(u.id, e.target.value)}
                    onBlur={(e) => enregistrerPourcentage(u.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="vide">
                  Aucun compte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
