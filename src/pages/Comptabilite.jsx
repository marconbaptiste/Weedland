import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { parseMontant, formatEuros, formatDateFr } from '../lib/format';
import {
  premierDuMois,
  moisPrecedent,
  intervallePeriode,
  intervalleAnnee,
  semaineDuMois,
} from '../lib/dates';
import { somme } from '../lib/comptabilite';
import { telechargerPDF } from '../lib/export';
import { compresserImage } from '../lib/image';
import ListeMontants from '../components/ListeMontants';
import { Courbe, Barres, Camembert } from '../components/Graphiques';

// Module admin — Comptabilité : CA mois/semaine/année, charges, fournisseurs,
// bénéfice. Charges et fournisseurs sont mensuels (repris du mois précédent).
export default function Comptabilite() {
  const [mois, setMois] = useState(premierDuMois());
  const [caRows, setCaRows] = useState([]);
  const [caAnnee, setCaAnnee] = useState(0);
  const [charges, setCharges] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);

  const [debut, fin] = intervallePeriode('mois', mois);

  const charger = useCallback(async () => {
    const [anneeDebut, anneeFin] = intervalleAnnee(mois);
    const [ca, an, ch, fo] = await Promise.all([
      supabase.from('v_ca_jour').select('date, ca_jour, encaissements').gte('date', debut).lte('date', fin),
      supabase.from('v_ca_jour').select('ca_jour').gte('date', anneeDebut).lte('date', anneeFin),
      supabase.from('charges').select('id, libelle, montant, justificatif').eq('mois', mois).order('created_at'),
      supabase.from('fournisseurs').select('id, libelle, montant, justificatif').eq('mois', mois).order('created_at'),
    ]);
    setCaRows(ca.data ?? []);
    setCaAnnee(somme((an.data ?? []).map((r) => r.ca_jour)));
    setCharges(ch.data ?? []);
    setFournisseurs(fo.data ?? []);
  }, [debut, fin, mois]);

  useEffect(() => {
    charger();
  }, [charger]);

  // --- CRUD générique charges / fournisseurs ---
  const setteur = { charges: setCharges, fournisseurs: setFournisseurs };
  const donnees = { charges, fournisseurs };

  async function ajouter(table) {
    const { data } = await supabase
      .from(table)
      .insert({ libelle: '', montant: 0, mois })
      .select()
      .single();
    if (data) setteur[table]((prev) => [...prev, data]);
  }

  function majLigne(table, id, champ, valeur) {
    setteur[table]((prev) => prev.map((x) => (x.id === id ? { ...x, [champ]: valeur } : x)));
  }

  async function enregistrer(table, id) {
    const it = donnees[table].find((x) => x.id === id);
    if (!it) return;
    await supabase
      .from(table)
      .update({ libelle: it.libelle || '', montant: parseMontant(it.montant) })
      .eq('id', id);
  }

  async function supprimer(table, id) {
    await supabase.from(table).delete().eq('id', id);
    setteur[table]((prev) => prev.filter((x) => x.id !== id));
  }

  // Justificatifs (photos de factures/tickets) — bucket privé "justificatifs".
  async function ajouterJustificatif(table, id, file) {
    const blob = await compresserImage(file);
    const chemin = `${table}/${id}.jpg`;
    const { error: up } = await supabase.storage
      .from('justificatifs')
      .upload(chemin, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (up) {
      window.alert(`Échec de l'envoi : ${up.message}`);
      return;
    }
    await supabase.from(table).update({ justificatif: chemin }).eq('id', id);
    setteur[table]((prev) => prev.map((x) => (x.id === id ? { ...x, justificatif: chemin } : x)));
  }

  async function voirJustificatif(chemin) {
    const { data, error } = await supabase.storage
      .from('justificatifs')
      .createSignedUrl(chemin, 120);
    if (error || !data?.signedUrl) {
      window.alert("Impossible d'ouvrir le justificatif.");
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  async function copierPrecedent(table) {
    const precedent = moisPrecedent(mois);
    const { data } = await supabase
      .from(table)
      .select('libelle, montant')
      .eq('mois', precedent);
    if (!data || data.length === 0) return;
    const { data: inserts } = await supabase
      .from(table)
      .insert(data.map((d) => ({ libelle: d.libelle, montant: d.montant, mois })))
      .select();
    setteur[table]((prev) => [...prev, ...(inserts ?? [])]);
  }

  // --- Totaux ---
  const caMois = somme(caRows.map((r) => r.ca_jour));
  const encaissementsMois = somme(caRows.map((r) => r.encaissements));
  const totalCharges = somme(charges.map((c) => parseMontant(c.montant)));
  const totalFournisseurs = somme(fournisseurs.map((f) => parseMontant(f.montant)));
  const benefice = somme([caMois, -totalCharges, -totalFournisseurs]);

  // CA par semaine (1 à 5) du mois.
  const semaines = [1, 2, 3, 4, 5].map((n) => ({
    n,
    ca: somme(caRows.filter((r) => semaineDuMois(r.date) === n).map((r) => r.ca_jour)),
  }));

  // Données graphiques.
  const pointsCA = [...caRows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ label: r.date.slice(8, 10), valeur: r.ca_jour }));
  const barresSemaine = semaines.map((s) => ({ label: `S${s.n}`, valeur: s.ca }));
  const partsCharges = charges.map((c) => ({ label: c.libelle, valeur: parseMontant(c.montant) }));
  const partsDepenses = [
    ...charges.map((c) => ({ label: c.libelle || 'Charge', valeur: parseMontant(c.montant) })),
    ...fournisseurs.map((f) => ({ label: f.libelle || 'Fournisseur', valeur: parseMontant(f.montant) })),
  ];
  const totalDepenses = somme([totalCharges, totalFournisseurs]);

  function exporterPDF() {
    telechargerPDF(`comptabilite-${mois.slice(0, 7)}.pdf`, {
      titre: 'Weedland — Comptabilité',
      sousTitre: `${formatDateFr(debut)} → ${formatDateFr(fin)}`,
      resume: [
        ['CA du mois', formatEuros(caMois)],
        ['Encaissements', formatEuros(encaissementsMois)],
        ['Charges', formatEuros(totalCharges)],
        ['Fournisseurs', formatEuros(totalFournisseurs)],
        ['Bénéfice', formatEuros(benefice)],
        [`CA cumulé ${mois.slice(0, 4)}`, formatEuros(caAnnee)],
      ],
      sections: [
        {
          titre: 'CA par semaine',
          entetes: ['Semaine', 'CA'],
          lignes: semaines.map((s) => [`Semaine ${s.n}`, formatEuros(s.ca)]),
        },
        {
          titre: 'Charges',
          entetes: ['Libellé', 'Montant'],
          lignes: charges.map((c) => [c.libelle || '—', formatEuros(parseMontant(c.montant))]),
        },
        {
          titre: 'Fournisseurs',
          entetes: ['Libellé', 'Montant'],
          lignes: fournisseurs.map((f) => [f.libelle || '—', formatEuros(parseMontant(f.montant))]),
        },
      ],
    });
  }

  return (
    <div className="page">
      <h1>Comptabilité</h1>

      <div className="card filtres">
        <label className="field">
          <span>Mois</span>
          <input
            type="month"
            value={mois.slice(0, 7)}
            onChange={(e) => setMois(`${e.target.value}-01`)}
          />
        </label>
        <button type="button" className="btn" onClick={exporterPDF}>
          Export PDF
        </button>
        <p className="periode-info">
          {formatDateFr(debut)} → {formatDateFr(fin)}
        </p>
      </div>

      <div className="cartes-kpi">
        <div className="kpi">
          <span className="kpi-label">CA du mois</span>
          <span className="kpi-valeur">{formatEuros(caMois)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Encaissements</span>
          <span className="kpi-valeur">{formatEuros(encaissementsMois)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Charges</span>
          <span className="kpi-valeur">{formatEuros(totalCharges)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Fournisseurs</span>
          <span className="kpi-valeur">{formatEuros(totalFournisseurs)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Bénéfice</span>
          <span className={`kpi-valeur ${benefice >= 0 ? 'solde-ok' : 'dette'}`}>
            {formatEuros(benefice)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">CA cumulé {mois.slice(0, 4)}</span>
          <span className="kpi-valeur">{formatEuros(caAnnee)}</span>
        </div>
      </div>

      <div className="card">
        <h2>CA du mois (par jour)</h2>
        <Courbe points={pointsCA} />
      </div>

      <div className="card">
        <h2>CA par semaine</h2>
        <Barres items={barresSemaine} />
        <table className="tableau">
          <tbody>
            {semaines.map((s) => (
              <tr key={s.n}>
                <td>Semaine {s.n}</td>
                <td className="droite">{formatEuros(s.ca)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Répartition des charges</h2>
        <Camembert parts={partsCharges} />
      </div>

      <div className="card">
        <div className="entete-client">
          <h2>Dépenses totales</h2>
          <strong>{formatEuros(totalDepenses)}</strong>
        </div>
        <Camembert parts={partsDepenses} />
      </div>

      <ListeMontants
        titre="Charges"
        items={charges}
        total={totalCharges}
        onAjouter={() => ajouter('charges')}
        onMaj={(id, champ, v) => majLigne('charges', id, champ, v)}
        onEnregistrer={(id) => enregistrer('charges', id)}
        onSupprimer={(id) => supprimer('charges', id)}
        onCopierPrecedent={() => copierPrecedent('charges')}
        onJustificatif={(id, file) => ajouterJustificatif('charges', id, file)}
        onVoirJustificatif={voirJustificatif}
      />

      <ListeMontants
        titre="Fournisseurs"
        items={fournisseurs}
        total={totalFournisseurs}
        onAjouter={() => ajouter('fournisseurs')}
        onMaj={(id, champ, v) => majLigne('fournisseurs', id, champ, v)}
        onEnregistrer={(id) => enregistrer('fournisseurs', id)}
        onSupprimer={(id) => supprimer('fournisseurs', id)}
        onCopierPrecedent={() => copierPrecedent('fournisseurs')}
        onJustificatif={(id, file) => ajouterJustificatif('fournisseurs', id, file)}
        onVoirJustificatif={voirJustificatif}
      />

      <div className="card recap">
        <div className="recap-ligne">
          <span>CA du mois</span>
          <strong>{formatEuros(caMois)}</strong>
        </div>
        <div className="recap-ligne">
          <span>− Charges</span>
          <strong>{formatEuros(totalCharges)}</strong>
        </div>
        <div className="recap-ligne">
          <span>− Fournisseurs</span>
          <strong>{formatEuros(totalFournisseurs)}</strong>
        </div>
        <hr />
        <div className="recap-ligne">
          <span>= Bénéfice</span>
          <strong className={benefice >= 0 ? 'solde-ok' : 'dette'}>{formatEuros(benefice)}</strong>
        </div>
      </div>
    </div>
  );
}
