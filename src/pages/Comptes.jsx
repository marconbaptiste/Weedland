import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// Module — Gestion des comptes (réservé admin).
// La création de compte passe par l'Edge Function `creer-employe` (clé
// service_role côté serveur). Le changement de rôle se fait directement (RLS).
export default function Comptes() {
  const { utilisateur } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ nom: '', email: '', motDePasse: '', role: 'employe' });
  const [statut, setStatut] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    const { data } = await supabase.from('users').select('id, nom, role').order('nom');
    setUsers(data ?? []);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function changerRole(id, role) {
    await supabase.from('users').update({ role }).eq('id', id);
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
    setForm({ nom: '', email: '', motDePasse: '', role: 'employe' });
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
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.nom}</td>
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
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={2} className="vide">
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
