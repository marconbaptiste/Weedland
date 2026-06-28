import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant } from '../lib/format';
import Messagerie from '../components/Messagerie';

const ABONNEMENTS = ['essai', 'actif', 'suspendu'];

// Tableau de pilotage (super-admin) : vue d'ensemble, magasins + abonnement,
// codes d'inscription, messagerie/doléances.
export default function Magasins() {
  const { magasinId } = useAuth();
  const [onglet, setOnglet] = useState('apercu');
  const [magasins, setMagasins] = useState([]);
  const [codes, setCodes] = useState([]);
  const [users, setUsers] = useState([]);
  const [nonLus, setNonLus] = useState([]);
  const [statut, setStatut] = useState('');
  const [nomMagasin, setNomMagasin] = useState('');
  const [admin, setAdmin] = useState({ magasin_id: '', email: '', nom: '', motDePasse: '', pourcentage: '' });
  const [filActif, setFilActif] = useState(null); // magasin sélectionné pour la messagerie

  const charger = useCallback(async () => {
    const [{ data: mag }, { data: cod }, { data: us }, { data: msg }] = await Promise.all([
      supabase.from('magasins').select('id, nom, abonnement, essai_fin, created_at').order('created_at'),
      supabase.from('codes_inscription').select('code, actif, utilisations').order('created_at', { ascending: false }),
      supabase.from('users').select('id, magasin_id, role'),
      supabase.from('messages').select('magasin_id, de_superadmin, lu'),
    ]);
    setMagasins(mag ?? []);
    setCodes(cod ?? []);
    setUsers(us ?? []);
    setNonLus((msg ?? []).filter((m) => !m.lu && !m.de_superadmin));
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const nbEmployes = (id) => users.filter((u) => u.magasin_id === id).length;
  const nonLusMagasin = (id) => nonLus.filter((m) => m.magasin_id === id).length;

  // --- Magasins / abonnement ---
  async function creerMagasin(e) {
    e.preventDefault();
    const nom = nomMagasin.trim();
    if (!nom) return;
    const { error } = await supabase.from('magasins').insert({ nom });
    if (error) return setStatut(`Erreur : ${error.message}`);
    setNomMagasin('');
    setStatut('Magasin créé ✅');
    charger();
  }
  async function majMagasin(id, patch) {
    await supabase.from('magasins').update(patch).eq('id', id);
    charger();
  }
  function prolongerEssai(m) {
    const base = m.essai_fin && m.essai_fin > new Date().toISOString().slice(0, 10) ? new Date(m.essai_fin) : new Date();
    base.setDate(base.getDate() + 14);
    majMagasin(m.id, { essai_fin: base.toISOString().slice(0, 10), abonnement: 'essai' });
  }
  async function supprimerMagasin(m) {
    if (m.id === magasinId) return setStatut('Bascule sur un autre magasin (en haut) avant de supprimer celui-ci.');
    if (!window.confirm(`Supprimer « ${m.nom} » et TOUTES ses données ? Irréversible.`)) return;
    setStatut('Suppression…');
    const { data, error } = await supabase.functions.invoke('creer-employe', {
      body: { action: 'supprimer-magasin', magasinId: m.id },
    });
    if (error || data?.error) return setStatut(`Erreur : ${data?.error ?? error?.message}`);
    setStatut(`Magasin « ${m.nom} » supprimé.`);
    charger();
  }

  // --- Autoriser un admin ---
  async function autoriserAdmin(e) {
    e.preventDefault();
    setStatut('');
    const email = admin.email.trim().toLowerCase();
    if (!email || !admin.magasin_id) return setStatut('Choisis un magasin et saisis un email.');
    const { error: errAuth } = await supabase.from('comptes_autorises').upsert(
      { email, role: 'admin', pourcentage_interessement: parseMontant(admin.pourcentage), magasin_id: admin.magasin_id },
      { onConflict: 'email' },
    );
    if (errAuth) return setStatut(`Erreur autorisation : ${errAuth.message}`);
    if (admin.motDePasse && admin.nom.trim()) {
      const { data, error } = await supabase.functions.invoke('creer-employe', {
        body: { email, motDePasse: admin.motDePasse, nom: admin.nom.trim(), role: 'admin', pourcentage: admin.pourcentage },
      });
      if (error || data?.error) return setStatut(`Email autorisé, mais création en erreur : ${data?.error ?? error?.message}`);
      setStatut('Magasin + administrateur créés ✅');
    } else {
      setStatut('Email autorisé ✅ — l’admin peut se connecter avec Google.');
    }
    setAdmin({ magasin_id: '', email: '', nom: '', motDePasse: '', pourcentage: '' });
  }

  // --- Codes ---
  async function genererCode() {
    const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 8 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join('');
    await supabase.from('codes_inscription').insert({ code });
    charger();
  }
  async function basculerCode(code, actif) {
    await supabase.from('codes_inscription').update({ actif: !actif }).eq('code', code);
    charger();
  }
  async function supprimerCode(code) {
    if (!window.confirm(`Supprimer le code ${code} ?`)) return;
    await supabase.from('codes_inscription').delete().eq('code', code);
    charger();
  }
  function copierCode(code) {
    navigator.clipboard?.writeText(code);
    setStatut(`Code ${code} copié.`);
  }

  const kpis = {
    total: magasins.length,
    essai: magasins.filter((m) => m.abonnement === 'essai').length,
    actif: magasins.filter((m) => m.abonnement === 'actif').length,
    suspendu: magasins.filter((m) => m.abonnement === 'suspendu').length,
    comptes: users.length,
    messages: nonLus.length,
  };

  return (
    <div className="page">
      <h1>Pilotage</h1>

      <div className="bascule">
        {[
          ['apercu', 'Vue d’ensemble'],
          ['magasins', 'Magasins'],
          ['codes', 'Codes'],
          ['messages', `Messages${kpis.messages ? ` (${kpis.messages})` : ''}`],
        ].map(([k, libelle]) => (
          <button key={k} className={onglet === k ? 'actif' : ''} onClick={() => setOnglet(k)}>
            {libelle}
          </button>
        ))}
      </div>

      {statut && <p className="statut">{statut}</p>}

      {onglet === 'apercu' && (
        <div className="cartes-kpi">
          <div className="kpi"><span className="kpi-label">Magasins</span><span className="kpi-valeur">{kpis.total}</span></div>
          <div className="kpi"><span className="kpi-label">En essai</span><span className="kpi-valeur">{kpis.essai}</span></div>
          <div className="kpi"><span className="kpi-label">Actifs</span><span className="kpi-valeur solde-ok">{kpis.actif}</span></div>
          <div className="kpi"><span className="kpi-label">Suspendus</span><span className={`kpi-valeur ${kpis.suspendu ? 'dette' : ''}`}>{kpis.suspendu}</span></div>
          <div className="kpi"><span className="kpi-label">Comptes</span><span className="kpi-valeur">{kpis.comptes}</span></div>
          <div className="kpi"><span className="kpi-label">Messages non lus</span><span className={`kpi-valeur ${kpis.messages ? 'dette' : ''}`}>{kpis.messages}</span></div>
        </div>
      )}

      {onglet === 'magasins' && (
        <>
          <form className="card" onSubmit={creerMagasin}>
            <h2>Nouveau magasin</h2>
            <div className="form-inline">
              <input value={nomMagasin} onChange={(e) => setNomMagasin(e.target.value)} placeholder="Nom du magasin" />
              <button className="btn btn-primary" type="submit">Créer</button>
            </div>
          </form>

          {magasins.map((m) => (
            <div key={m.id} className="card">
              <div className="entete-client">
                <strong>{m.nom}{m.id === magasinId && <span className="badge badge-solde tag-partage">actuel</span>}</strong>
                <span className="promo-qui">{nbEmployes(m.id)} compte(s)</span>
              </div>
              <div className="form-inline">
                <label className="field">
                  <span>Abonnement</span>
                  <select value={m.abonnement} onChange={(e) => majMagasin(m.id, { abonnement: e.target.value })}>
                    {ABONNEMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Fin d’essai</span>
                  <input type="date" value={m.essai_fin ?? ''} onChange={(e) => majMagasin(m.id, { essai_fin: e.target.value })} />
                </label>
              </div>
              <div className="form-inline">
                <button type="button" className="btn" onClick={() => prolongerEssai(m)}>+14 j d’essai</button>
                {m.abonnement !== 'actif' && <button type="button" className="btn" onClick={() => majMagasin(m.id, { abonnement: 'actif' })}>Activer</button>}
                {m.abonnement !== 'suspendu' && <button type="button" className="btn btn-discret" onClick={() => majMagasin(m.id, { abonnement: 'suspendu' })}>Suspendre</button>}
                {m.id !== magasinId && <button type="button" className="btn btn-discret" onClick={() => supprimerMagasin(m)}>Supprimer</button>}
              </div>
            </div>
          ))}

          <form className="card" onSubmit={autoriserAdmin}>
            <h2>Autoriser un administrateur</h2>
            <label className="field">
              <span>Magasin</span>
              <select value={admin.magasin_id} onChange={(e) => setAdmin((a) => ({ ...a, magasin_id: e.target.value }))}>
                <option value="">— Choisir —</option>
                {magasins.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </label>
            <label className="field"><span>Email</span><input type="email" value={admin.email} onChange={(e) => setAdmin((a) => ({ ...a, email: e.target.value }))} /></label>
            <label className="field"><span>Nom (si mot de passe)</span><input value={admin.nom} onChange={(e) => setAdmin((a) => ({ ...a, nom: e.target.value }))} /></label>
            <label className="field"><span>Mot de passe (optionnel)</span><input type="text" value={admin.motDePasse} onChange={(e) => setAdmin((a) => ({ ...a, motDePasse: e.target.value }))} placeholder="vide = connexion Google" /></label>
            <button className="btn btn-primary" type="submit">Autoriser l’administrateur</button>
          </form>
        </>
      )}

      {onglet === 'codes' && (
        <div className="card">
          <div className="entete-client">
            <h2>Codes d’inscription</h2>
            <button type="button" className="btn btn-primary" onClick={genererCode}>+ Générer</button>
          </div>
          <p className="statut">Donne un code à un nouveau patron pour qu’il crée son magasin.</p>
          <table className="tableau">
            <thead><tr><th>Code</th><th className="droite">Utilisé</th><th></th></tr></thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.code} style={{ opacity: c.actif ? 1 : 0.5 }}>
                  <td><strong>{c.code}</strong>{!c.actif && ' (inactif)'}</td>
                  <td className="droite">{c.utilisations}×</td>
                  <td className="actions-cellule">
                    <button type="button" className="btn btn-discret" onClick={() => copierCode(c.code)}>Copier</button>
                    <button type="button" className="btn btn-discret" onClick={() => basculerCode(c.code, c.actif)}>{c.actif ? 'Désactiver' : 'Activer'}</button>
                    <button type="button" className="btn btn-discret" onClick={() => supprimerCode(c.code)}>✕</button>
                  </td>
                </tr>
              ))}
              {codes.length === 0 && <tr><td colSpan={3} className="vide">Aucun code.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {onglet === 'messages' && (
        <div className="card">
          <h2>Doléances par magasin</h2>
          <label className="field">
            <span>Magasin</span>
            <select value={filActif ?? ''} onChange={(e) => setFilActif(e.target.value || null)}>
              <option value="">— Choisir —</option>
              {magasins.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}{nonLusMagasin(m.id) ? ` (${nonLusMagasin(m.id)} non lu)` : ''}
                </option>
              ))}
            </select>
          </label>
          {filActif && <Messagerie magasinId={filActif} superadmin />}
        </div>
      )}
    </div>
  );
}
