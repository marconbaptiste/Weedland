import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatDateFr } from '../lib/format';

// Page admin — Promotions du magasin. Créées ici, elles s'affichent sur les
// cartes de fidélité des clients (page publique /carte/:id) tant qu'elles sont
// actives et dans leur période de validité.
const VIDE = { titre: '', remise: '', stock_id: '', description: '', date_debut: '', date_fin: '' };

export default function Promotions() {
  const [promotions, setPromotions] = useState([]);
  const [produits, setProduits] = useState([]);
  const [form, setForm] = useState(VIDE);
  const [msg, setMsg] = useState('');

  const charger = useCallback(async () => {
    const [{ data: pr }, { data: st }] = await Promise.all([
      supabase
        .from('promotions')
        .select('id, titre, description, remise, stock_id, date_debut, date_fin, actif, stocks(nom)')
        .order('created_at', { ascending: false }),
      supabase.from('stocks').select('id, nom, categorie').order('nom'),
    ]);
    setPromotions(pr ?? []);
    setProduits(st ?? []);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creer(e) {
    e.preventDefault();
    setMsg('');
    const titre = form.titre.trim();
    if (!titre) return;
    const { error } = await supabase.from('promotions').insert({
      titre,
      remise: form.remise.trim() || null,
      stock_id: form.stock_id || null,
      description: form.description.trim() || null,
      date_debut: form.date_debut || null,
      date_fin: form.date_fin || null,
    });
    if (error) {
      setMsg(`Création impossible : ${error.message}`);
      return;
    }
    setForm(VIDE);
    setMsg('Promotion créée ✅');
    charger();
  }

  async function basculerActif(p) {
    await supabase.from('promotions').update({ actif: !p.actif }).eq('id', p.id);
    charger();
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer cette promotion ?')) return;
    await supabase.from('promotions').delete().eq('id', id);
    charger();
  }

  return (
    <div className="page">
      <h1>Promotions</h1>
      <p className="statut">
        Les promotions actives s’affichent directement sur la carte de fidélité des clients.
      </p>

      <div className="card">
        <h2>Nouvelle promotion</h2>
        <form className="form-chrome" onSubmit={creer}>
          <label className="field">
            <span>Titre</span>
            <input
              value={form.titre}
              onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))}
              placeholder="ex. Offre du week-end"
            />
          </label>
          <label className="field">
            <span>Remise (facultatif)</span>
            <input
              value={form.remise}
              onChange={(e) => setForm((f) => ({ ...f, remise: e.target.value }))}
              placeholder="ex. -10%, 2g offerts…"
            />
          </label>
          <label className="field">
            <span>Produit concerné (facultatif)</span>
            <select
              value={form.stock_id}
              onChange={(e) => setForm((f) => ({ ...f, stock_id: e.target.value }))}
            >
              <option value="">— Aucun (promo générale) —</option>
              {produits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.categorie ? `${p.categorie} · ${p.nom}` : p.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Description (facultatif)</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Détails de l’offre…"
            />
          </label>
          <div className="form-inline">
            <label className="field">
              <span>Du (facultatif)</span>
              <input
                type="date"
                value={form.date_debut}
                onChange={(e) => setForm((f) => ({ ...f, date_debut: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Au (facultatif)</span>
              <input
                type="date"
                value={form.date_fin}
                min={form.date_debut || undefined}
                onChange={(e) => setForm((f) => ({ ...f, date_fin: e.target.value }))}
              />
            </label>
          </div>
          <button className="btn btn-primary" type="submit">
            Créer la promotion
          </button>
        </form>
        {msg && <p className="statut">{msg}</p>}
      </div>

      <div className="card">
        <h2>Promotions ({promotions.length})</h2>
        <ul className="liste-promos">
          {promotions.map((p) => {
            const periode =
              p.date_debut || p.date_fin
                ? `${p.date_debut ? formatDateFr(p.date_debut) : '…'} → ${p.date_fin ? formatDateFr(p.date_fin) : '…'}`
                : 'Permanente';
            return (
              <li key={p.id} className={`promo-item ${p.actif ? '' : 'promo-inactive'}`}>
                <div className="promo-corps">
                  <strong>{p.titre}</strong>
                  {p.remise && <span className="badge badge-remise">{p.remise}</span>}
                  {p.stocks?.nom && <span className="promo-produit">🏷️ {p.stocks.nom}</span>}
                  {p.description && <p className="promo-desc">{p.description}</p>}
                  <span className="promo-date">{periode}</span>
                </div>
                <div className="promo-actions">
                  <button type="button" className="btn btn-discret" onClick={() => basculerActif(p)}>
                    {p.actif ? 'Désactiver' : 'Activer'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-discret"
                    onClick={() => supprimer(p.id)}
                    aria-label="Supprimer la promotion"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
          {promotions.length === 0 && <li className="vide">Aucune promotion.</li>}
        </ul>
      </div>
    </div>
  );
}
