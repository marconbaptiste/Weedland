import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant } from '../lib/format';
import { useInvite } from '../components/ModalePrompt';
import HorairesEmploye from '../components/HorairesEmploye';
import { horairesMagasinDefaut } from '../lib/horaires';

// Module — Gestion des comptes (réservé admin).
// La création de compte passe par l'Edge Function `creer-employe` (clé
// service_role côté serveur). Le changement de rôle se fait directement (RLS).
export default function Comptes() {
  const { utilisateur, profil, magasinId } = useAuth();
  const { invite, elementInvite } = useInvite();
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
  const [creationOuverte, setCreationOuverte] = useState(false); // modale « Nouveau compte »
  // Allowlist des emails autorisés à se connecter (notamment via Google).
  const [autorises, setAutorises] = useState([]);
  const [nouvelEmail, setNouvelEmail] = useState('');
  // Horaires : défaut du magasin (pré-remplissage) + employé en cours d'édition.
  const [horairesMag, setHorairesMag] = useState(horairesMagasinDefaut());
  const [horairesEmp, setHorairesEmp] = useState(null); // employé { id, nom, horaires_fixes } | null
  const [gestion, setGestion] = useState(null); // id de l'employé géré (fiche modale) | null

  const charger = useCallback(async () => {
    if (!magasinId) return;
    // Cloisonnement explicite au magasin actif : la RLS de `users` autorise un
    // superadmin à lire TOUS les magasins (pour le pilotage) — sans ce filtre,
    // la gestion des comptes d'un magasin afficherait les employés des autres.
    const [{ data }, { data: aut }, { data: mag }] = await Promise.all([
      supabase
        .from('users')
        .select('id, nom, role, pourcentage_interessement, horaires_fixes, email')
        .eq('magasin_id', magasinId)
        .order('nom'),
      supabase.from('comptes_autorises').select('email, role').eq('magasin_id', magasinId).order('email'),
      supabase.from('magasins').select('horaires').eq('id', magasinId).single(),
    ]);
    setUsers(data ?? []);
    setAutorises(aut ?? []);
    setHorairesMag({ ...horairesMagasinDefaut(), ...(mag?.horaires ?? {}) });
  }, [magasinId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function autoriserEmail(e) {
    e.preventDefault();
    const email = nouvelEmail.trim().toLowerCase();
    if (!email) return;
    await supabase
      .from('comptes_autorises')
      .upsert({ email, magasin_id: profil?.magasin_id }, { onConflict: 'email' });
    setNouvelEmail('');
    charger();
  }

  async function retirerEmail(email) {
    if (!window.confirm(`Retirer ${email} des comptes autorisés ?`)) return;
    await supabase.from('comptes_autorises').delete().eq('email', email).eq('magasin_id', magasinId);
    charger();
  }

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

  async function reinitialiserMdp(id, nom) {
    const motDePasse = await invite({
      titre: 'Réinitialiser le mot de passe',
      label: `Nouveau mot de passe pour ${nom} (min. 6 caractères)`,
      type: 'password',
    });
    if (!motDePasse) return;
    setStatut('');
    const { data, error } = await supabase.functions.invoke('creer-employe', {
      body: { action: 'reset', userId: id, motDePasse },
    });
    if (error) {
      let message = 'Erreur (fonction à jour ?).';
      try {
        const corps = await error.context.json();
        if (corps?.error) message = corps.error;
      } catch {
        /* message générique */
      }
      setStatut(message);
      return;
    }
    if (data?.error) {
      setStatut(data.error);
      return;
    }
    setStatut(`Mot de passe de ${nom} réinitialisé ✅`);
  }

  async function creer(e) {
    e.preventDefault();
    setEnvoi(true);
    setStatut('');
    // Le profil n'est créé que pour un email autorisé : on l'ajoute à l'allowlist
    // AVANT de créer le compte (le trigger handle_new_user le lit à la création).
    await supabase.from('comptes_autorises').upsert(
      {
        email: form.email.trim().toLowerCase(),
        role: form.role,
        pourcentage_interessement: parseMontant(form.pourcentage),
        magasin_id: profil?.magasin_id,
      },
      { onConflict: 'email' },
    );
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
    setCreationOuverte(false);
    charger();
  }

  return (
    <div className="page">
      <div className="entete-client">
        <h1>Comptes</h1>
        <button
          type="button"
          className="btn btn-primary btn-compact"
          onClick={() => {
            setForm({ nom: '', email: '', motDePasse: '', role: 'employe', pourcentage: '' });
            setStatut('');
            setCreationOuverte(true);
          }}
        >
          + Nouveau compte
        </button>
      </div>

      {!creationOuverte && !gestion && statut && <p className="statut">{statut}</p>}

      <div className="card">
        <h2>Employés</h2>
        {/* Liste compacte (mobile) : nom + rôle, bouton « Gérer » → fiche modale. */}
        <ul className="liste-produits">
          {users.map((u) => (
            <li key={u.id} className="ligne-produit">
              <div className="ligne-produit-nom">
                <span>{u.nom || '—'}</span>
                {u.id === utilisateur.id ? (
                  <span className="badge badge-solde tag-partage">Admin (vous)</span>
                ) : (
                  <span className="badge tag-partage">{u.role === 'admin' ? 'Admin' : 'Employé'}</span>
                )}
              </div>
              <span className="ligne-produit-qte">
                {Number(u.pourcentage_interessement) > 0 ? `${u.pourcentage_interessement} %` : '—'}
              </span>
              <button
                type="button"
                className="btn btn-discret ligne-produit-gerer"
                onClick={() => setGestion(u.id)}
              >
                Gérer
              </button>
            </li>
          ))}
          {users.length === 0 && <li className="vide">Aucun compte.</li>}
        </ul>
      </div>

      {(() => {
        // L'email autorisé de chaque compte se gère depuis sa fiche. Ici on ne
        // garde QUE les emails autorisés sans compte encore créé (connexion
        // Google en attente), pour ne pas dupliquer la liste des comptes.
        const emailsComptes = new Set(
          users.map((u) => (u.email ?? '').toLowerCase()).filter(Boolean),
        );
        const orphelins = autorises.filter(
          (a) => !emailsComptes.has((a.email ?? '').toLowerCase()),
        );
        return (
          <div className="card">
            <h2>Autoriser un email (connexion Google)</h2>
            <p className="statut">
              Autorise un email à se connecter <strong>sans créer de compte tout de suite</strong> :
              la personne se connecte via Google et son profil se crée automatiquement. Les comptes
              créés ci-dessus autorisent déjà leur email — leur accès se retire depuis leur fiche.
            </p>
            <form className="form-inline" onSubmit={autoriserEmail}>
              <input
                type="email"
                placeholder="email@exemple.com"
                value={nouvelEmail}
                onChange={(e) => setNouvelEmail(e.target.value)}
              />
              <button className="btn" type="submit">
                Autoriser
              </button>
            </form>
            {orphelins.length > 0 && (
              <ul className="liste-produits">
                {orphelins.map((a) => (
                  <li key={a.email} className="ligne-produit">
                    <span className="ligne-produit-nom">{a.email}</span>
                    <button
                      type="button"
                      className="btn btn-discret ligne-produit-gerer"
                      onClick={() => retirerEmail(a.email)}
                      aria-label="Retirer l’autorisation"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}
      {creationOuverte && (
        <div
          className="aide-fond"
          role="dialog"
          aria-modal="true"
          aria-label="Nouveau compte"
          onClick={() => setCreationOuverte(false)}
        >
          <form className="modale-client" onClick={(e) => e.stopPropagation()} onSubmit={creer}>
            <div className="modale-client-tete">
              <strong>Nouveau compte</strong>
              <button type="button" className="btn btn-discret" onClick={() => setCreationOuverte(false)}>
                Fermer
              </button>
            </div>
            <div className="form-chrome">
              <label className="field">
                <span>Nom</span>
                <input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} required />
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
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
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
            </div>
          </form>
        </div>
      )}

      {gestion && (() => {
        const u = users.find((x) => x.id === gestion);
        if (!u) return null;
        const estMoi = u.id === utilisateur.id;
        return (
          <div
            className="aide-fond"
            role="dialog"
            aria-modal="true"
            aria-label="Fiche employé"
            onClick={() => setGestion(null)}
          >
            <div className="modale-client" onClick={(e) => e.stopPropagation()}>
              <div className="modale-client-tete">
                <strong>{u.nom || 'Employé'}</strong>
                <button type="button" className="btn btn-discret" onClick={() => setGestion(null)}>
                  Fermer
                </button>
              </div>
              <div className="form-chrome">
                <label className="field">
                  <span>Nom</span>
                  <input
                    type="text"
                    value={u.nom ?? ''}
                    onChange={(e) => majNomLocal(u.id, e.target.value)}
                    onBlur={(e) => enregistrerNom(u.id, e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Rôle</span>
                  {estMoi ? (
                    <span className="badge badge-solde">Admin (vous)</span>
                  ) : (
                    <select value={u.role} onChange={(e) => changerRole(u.id, e.target.value)}>
                      <option value="employe">Employé</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                </label>
                <label className="field">
                  <span>% d’intéressement</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={u.pourcentage_interessement ?? ''}
                    onChange={(e) => majPourcentageLocal(u.id, e.target.value)}
                    onBlur={(e) => enregistrerPourcentage(u.id, e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Email de connexion</span>
                  <input type="email" value={u.email ?? '—'} readOnly disabled />
                </label>
                <div className="form-inline">
                  <button type="button" className="btn" onClick={() => setHorairesEmp(u)}>
                    🗓️ Horaires fixes
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => reinitialiserMdp(u.id, u.nom)}
                  >
                    🔑 Réinit. mot de passe
                  </button>
                </div>
                {u.email && (
                  <button
                    type="button"
                    className="btn btn-discret fiche-supprimer"
                    onClick={() => retirerEmail(u.email)}
                  >
                    🚫 Retirer l’accès (email autorisé)
                  </button>
                )}
                {statut && <p className="statut">{statut}</p>}
              </div>
            </div>
          </div>
        );
      })()}

      {horairesEmp && (
        <HorairesEmploye
          employe={horairesEmp}
          defautMagasin={horairesMag}
          onClose={() => setHorairesEmp(null)}
          onSaved={(h) =>
            setUsers((liste) =>
              liste.map((u) => (u.id === horairesEmp.id ? { ...u, horaires_fixes: h } : u)),
            )
          }
        />
      )}
      {elementInvite}
    </div>
  );
}
