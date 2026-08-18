import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant } from '../lib/format';
import InfosMagasin from '../components/InfosMagasin';

// Assistant de configuration (SAS) — parcours guidé pour un nouveau magasin.
// Pensé pour un patron peu à l'aise avec l'informatique : une étape à la fois,
// libellés simples, possibilité de « Passer » et de revenir plus tard.
// Étapes : 1) Magasin  2) Équipe  3) Comptabilité (import CSV)  4) Produits.
const ETAPES = [
  { cle: 'magasin', titre: 'Ton magasin', emoji: '🏪' },
  { cle: 'equipe', titre: 'Ton équipe', emoji: '👥' },
  { cle: 'comptabilite', titre: 'Ta comptabilité', emoji: '📊' },
  { cle: 'produits', titre: 'Tes produits', emoji: '📦' },
];

export default function Configuration() {
  const { utilisateur, profil, magasinId, magasinNom } = useAuth();
  const navigate = useNavigate();
  const cleEtape = `config-etape:${utilisateur?.id}`;
  const [etape, setEtape] = useState(() => Number(localStorage.getItem(cleEtape)) || 0);

  useEffect(() => {
    localStorage.setItem(cleEtape, String(etape));
  }, [cleEtape, etape]);

  const suivant = () => setEtape((e) => Math.min(e + 1, ETAPES.length - 1));
  const precedent = () => setEtape((e) => Math.max(e - 1, 0));

  function terminer() {
    localStorage.setItem(`config-terminee:${utilisateur?.id}`, '1');
    navigate('/', { replace: true });
  }

  const courante = ETAPES[etape];

  return (
    <div className="page config-sas">
      <h1>Configuration de {magasinNom || 'ton magasin'}</h1>

      {/* Fil d'étapes cliquable */}
      <ol className="config-fil">
        {ETAPES.map((s, i) => (
          <li key={s.cle} className={`config-pas ${i === etape ? 'actif' : ''} ${i < etape ? 'fait' : ''}`}>
            <button type="button" onClick={() => setEtape(i)}>
              <span className="config-pas-num">{i < etape ? '✓' : i + 1}</span>
              <span className="config-pas-nom">{s.titre}</span>
            </button>
          </li>
        ))}
      </ol>

      <p className="config-intro">
        Étape {etape + 1} sur {ETAPES.length} · {courante.emoji} <strong>{courante.titre}</strong>
      </p>

      {courante.cle === 'magasin' && (
        <>
          <p className="statut">
            Renseigne les infos de ta boutique : elles s’affichent sur la carte de fidélité de tes
            clients et servent de base aux plannings. Clique sur <strong>Enregistrer</strong> en bas
            de la carte, puis <strong>Suivant</strong>.
          </p>
          <InfosMagasin />
        </>
      )}

      {courante.cle === 'equipe' && <EtapeEquipe magasinId={magasinId} profil={profil} moiId={utilisateur.id} />}

      {courante.cle === 'comptabilite' && (
        <div className="card">
          <h2>📊 Importer ta comptabilité (facultatif)</h2>
          <p className="statut">
            Tu as déjà un historique dans un tableur (Excel / Google Sheets) ? Exporte-le en{' '}
            <strong>CSV</strong> et importe-le : tes chiffres passés (caisse, charges, fournisseurs,
            dettes clients) arrivent directement dans l’app. Tu peux aussi le faire plus tard.
          </p>
          <Link to="/import" className="btn btn-primary">
            📥 Ouvrir l’import
          </Link>
        </div>
      )}

      {courante.cle === 'produits' && (
        <div className="card">
          <h2>📦 Ajouter tes produits (facultatif)</h2>
          <p className="statut">
            Crée tes produits en stock, ou <strong>importe une facture fournisseur en photo</strong>{' '}
            : l’app lit les lignes et pré-remplit ton inventaire. Là aussi, tu peux le faire quand tu
            veux.
          </p>
          <Link to="/stocks" className="btn btn-primary">
            📦 Ouvrir les stocks
          </Link>
        </div>
      )}

      <div className="config-nav">
        {etape > 0 && (
          <button type="button" className="btn" onClick={precedent}>
            ← Précédent
          </button>
        )}
        {etape < ETAPES.length - 1 ? (
          <button type="button" className="btn btn-primary" onClick={suivant}>
            Suivant →
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={terminer}>
            ✅ Terminer
          </button>
        )}
      </div>

      <button type="button" className="btn btn-discret config-plus-tard" onClick={terminer}>
        Je finirai plus tard — aller à l’application
      </button>
    </div>
  );
}

// Étape « Équipe » : ajout simple de salariés / managers (réutilise le même
// mécanisme sécurisé que la page Comptes — allowlist + Edge Function).
function EtapeEquipe({ magasinId, profil, moiId }) {
  const [membres, setMembres] = useState([]);
  const [form, setForm] = useState({ nom: '', email: '', motDePasse: '', role: 'employe', pourcentage: '' });
  const [envoi, setEnvoi] = useState(false);
  const [statut, setStatut] = useState('');

  const charger = useCallback(async () => {
    if (!magasinId) return;
    const { data } = await supabase
      .from('users')
      .select('id, nom, role')
      .eq('magasin_id', magasinId)
      .order('nom');
    setMembres(data ?? []);
  }, [magasinId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouter(e) {
    e.preventDefault();
    setEnvoi(true);
    setStatut('');
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
    if (error || data?.error) {
      let message = data?.error ?? 'Création impossible (réessaie).';
      try {
        const corps = await error?.context?.json();
        if (corps?.error) message = corps.error;
      } catch {
        /* message générique */
      }
      setStatut(message);
      return;
    }
    setForm({ nom: '', email: '', motDePasse: '', role: 'employe', pourcentage: '' });
    setStatut(`Compte de ${data?.nom ?? 'l’employé'} créé ✅`);
    charger();
  }

  return (
    <>
      <div className="card">
        <h2>👥 Tes salariés et managers</h2>
        <p className="statut">
          Ajoute chaque membre de ton équipe. Un <strong>manager</strong> (Admin) voit les chiffres
          et gère la boutique ; un <strong>employé</strong> saisit ses ventes. Tu pourras en ajouter
          d’autres plus tard.
        </p>
        <form className="form-chrome" onSubmit={ajouter}>
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
            <small className="champ-aide">6 caractères min. — à communiquer à l’employé.</small>
          </label>
          <div className="form-inline">
            <label className="field">
              <span>Rôle</span>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="employe">Employé</option>
                <option value="admin">Manager (Admin)</option>
              </select>
            </label>
            <label className="field">
              <span>% d’intéressement</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="ex. 5"
                value={form.pourcentage}
                onChange={(e) => setForm((f) => ({ ...f, pourcentage: e.target.value }))}
              />
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={envoi}>
            {envoi ? 'Création…' : '+ Ajouter ce membre'}
          </button>
          {statut && <p className="statut">{statut}</p>}
        </form>
      </div>

      <div className="card">
        <h2>Équipe ({membres.length})</h2>
        <ul className="liste-produits">
          {membres.map((m) => (
            <li key={m.id} className="ligne-produit">
              <div className="ligne-produit-nom">
                <span>{m.nom || '—'}</span>
                {m.id === moiId ? (
                  <span className="badge badge-solde tag-partage">Toi</span>
                ) : (
                  <span className="badge tag-partage">{m.role === 'admin' ? 'Manager' : 'Employé'}</span>
                )}
              </div>
            </li>
          ))}
          {membres.length === 0 && <li className="vide">Personne pour le moment.</li>}
        </ul>
      </div>
    </>
  );
}
