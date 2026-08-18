import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { parseMontant, formatEuros, formatNombre, formatDateFr } from '../lib/format';
import {
  premierDuMois,
  moisPrecedent,
  intervallePeriode,
  intervalleAnnee,
  semaineDuMois,
} from '../lib/dates';
import { useAuth } from '../auth/AuthProvider';
import { somme } from '../lib/comptabilite';
import { telechargerCSV, telechargerPDF } from '../lib/export';
import { compresserImage } from '../lib/image';
import { lireMontant } from '../lib/ocr';
import ListeMontants from '../components/ListeMontants';
import { Courbe, Barres, Camembert } from '../components/Graphiques';
import { CATEGORIES_CHARGES, libelleCategorie, tvaRecuperable } from '../lib/categoriesCharges';

const TAUX_TVA = 20; // taux normal (produits CBD) — les prix saisis sont TTC.

const moisCourt = (ym) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(`${ym}-01T00:00:00`));

const pct1 = (v) => `${v.toFixed(1).replace('.', ',')} %`;

// Badge d'évolution vs période précédente (le réflexe des logiciels de compta) :
// ▲/▼ + %. `inverse` = une hausse est une mauvaise nouvelle (charges, dépenses).
function Evolution({ actuel, precedent, inverse = false }) {
  if (precedent == null || precedent === 0) return null;
  const pctEvo = ((actuel - precedent) / Math.abs(precedent)) * 100;
  const hausse = pctEvo >= 0;
  const bon = inverse ? !hausse : hausse;
  return (
    <span className={`kpi-evo ${bon ? 'evo-bon' : 'evo-mauvais'}`}>
      {hausse ? '▲' : '▼'} {pct1(Math.abs(pctEvo))} <span className="evo-ref">vs préc.</span>
    </span>
  );
}

// Module admin — Comptabilité : synthèse CA / charges / fournisseurs / bénéfice
// sur un mois, une année, ou une période personnalisée. L'édition des charges
// et fournisseurs se fait en mode « Mois ».
export default function Comptabilite() {
  const { magasinId, magasinNom, options } = useAuth();
  // Option d'abonnement « Compta Pro » : trésorerie, compte de résultat, TVA,
  // catégories de charges, résultat par mois. La compta de base (CA, charges,
  // fournisseurs, bénéfice, exports) reste dans le socle.
  const comptaPro = Boolean(options?.compta);
  const [periode, setPeriode] = useState('mois');
  const [mois, setMois] = useState(premierDuMois());
  const [perso, setPerso] = useState(() => {
    const [d, f] = intervallePeriode('mois');
    return { debut: d, fin: f };
  });
  const [encRows, setEncRows] = useState([]); // encaissements par clôture (date)
  const [chromesRows, setChromesRows] = useState([]); // tous les chromes de la période
  const [caAnnee, setCaAnnee] = useState(0);
  const [charges, setCharges] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [statutOcr, setStatutOcr] = useState('');
  // Comparaison période précédente + trésorerie + créances (style logiciel de compta).
  const [prevTot, setPrevTot] = useState(null); // { ca, charges, fournisseurs } de la période précédente
  const [paiements, setPaiements] = useState({ cb: 0, especes: 0, virements: 0 }); // encaissements des clôtures par moyen
  const [creances, setCreances] = useState({ total: 0, nb: 0 }); // dettes clients en cours (à ce jour)
  // Section « Équipe » (rapatriée de l'ancien Dashboard) : intéressement /
  // heures par employé, filtrable par employé, + total des paiements.
  const [employes, setEmployes] = useState([]);
  const [employeFiltre, setEmployeFiltre] = useState('');
  const [graphOuvert, setGraphOuvert] = useState(false); // section « Graphiques » repliée par défaut
  const [detailOuvert, setDetailOuvert] = useState(false); // détail par jour (équipe) replié par défaut
  const [caEmpRows, setCaEmpRows] = useState([]); // v_ca_jour par clôture (avances/rembours.)
  const [intRows, setIntRows] = useState([]); // v_interessement_employe (propriétaires + partagés)
  const [chromesEmpRows, setChromesEmpRows] = useState([]); // chromes avec employe_id
  const [totalPaiements, setTotalPaiements] = useState(0);

  const enMois = periode === 'mois';
  const [debut, fin] =
    periode === 'mois'
      ? intervallePeriode('mois', mois)
      : periode === 'annee'
        ? intervalleAnnee(mois)
        : [perso.debut, perso.fin];

  const charger = useCallback(async () => {
    const [anneeDebut, anneeFin] = intervalleAnnee(debut);
    const reqCharges = enMois
      ? supabase.from('charges').select('id, libelle, montant, categorie, justificatif').eq('mois', mois).order('created_at')
      : supabase.from('charges').select('id, libelle, montant, categorie, mois').gte('mois', premierDuMois(debut)).lte('mois', fin).order('mois');
    const reqFourn = enMois
      ? supabase.from('fournisseurs').select('id, libelle, montant, justificatif').eq('mois', mois).order('created_at')
      : supabase.from('fournisseurs').select('id, libelle, montant, mois').gte('mois', premierDuMois(debut)).lte('mois', fin).order('mois');

    // Période PRÉCÉDENTE pour la comparaison (mois précédent, année précédente,
    // ou même durée juste avant pour une période personnalisée).
    const [prevDebut, prevFin] = (() => {
      if (periode === 'mois') return intervallePeriode('mois', moisPrecedent(mois));
      if (periode === 'annee') return intervalleAnnee(`${Number(debut.slice(0, 4)) - 1}${debut.slice(4)}`);
      const d0 = new Date(`${debut}T00:00:00Z`);
      const f0 = new Date(`${fin}T00:00:00Z`);
      const span = Math.round((f0 - d0) / 86400000) + 1;
      const pf = new Date(d0.getTime() - 86400000);
      const pd = new Date(pf.getTime() - (span - 1) * 86400000);
      const iso = (x) => x.toISOString().slice(0, 10);
      return [iso(pd), iso(pf)];
    })();

    // CA = ventes directes (clôtures) + avances − remboursements + autres (TOUS
    // les chromes de la période, même ceux saisis un jour sans clôture). On part de
    // ventes_directes (CB+espèces, hors virement) et on ajoute les autres depuis
    // `chromes` : pas de double comptage (v_ca_jour.encaissements inclut déjà les
    // autres), et les autres des jours SANS clôture sont bien pris en compte.
    const [enc, an, chr, anChr, ch, fo, pEnc, pChr, pCh, pFo, cj, sc] = await Promise.all([
      supabase.from('v_ca_jour').select('date, ventes_directes').gte('date', debut).lte('date', fin),
      supabase.from('v_ca_jour').select('ventes_directes').gte('date', anneeDebut).lte('date', anneeFin),
      supabase.from('chromes').select('date, type, montant').gte('date', debut).lte('date', fin),
      supabase.from('chromes').select('type, montant').gte('date', anneeDebut).lte('date', anneeFin),
      reqCharges,
      reqFourn,
      // Période précédente (comparaison) :
      supabase.from('v_ca_jour').select('ventes_directes').gte('date', prevDebut).lte('date', prevFin),
      supabase.from('chromes').select('type, montant').gte('date', prevDebut).lte('date', prevFin),
      supabase.from('charges').select('montant').gte('mois', premierDuMois(prevDebut)).lte('mois', prevFin),
      supabase.from('fournisseurs').select('montant').gte('mois', premierDuMois(prevDebut)).lte('mois', prevFin),
      // Encaissements par moyen de paiement (clôtures de la période — page admin,
      // la RLS laisse l'admin lire toutes les clôtures de SON magasin) :
      supabase.from('caisse_jour').select('cb, especes, virements').gte('date', debut).lte('date', fin),
      // Créances clients (dettes chromes en cours, à ce jour) :
      supabase.from('v_solde_client').select('solde'),
    ]);
    setEncRows(enc.data ?? []);
    setChromesRows(chr.data ?? []);
    const av = (rows) => somme((rows ?? []).filter((c) => c.type === 'avance').map((c) => c.montant));
    const rb = (rows) => somme((rows ?? []).filter((c) => c.type === 'remboursement').map((c) => c.montant));
    const vir = (rows) => somme((rows ?? []).filter((c) => c.type === 'autre').map((c) => c.montant));
    const anVd = somme((an.data ?? []).map((r) => r.ventes_directes));
    setCaAnnee(somme([anVd, av(anChr.data), vir(anChr.data), -rb(anChr.data)]));
    setCharges(ch.data ?? []);
    setFournisseurs(fo.data ?? []);
    const pVd = somme((pEnc.data ?? []).map((r) => r.ventes_directes));
    setPrevTot({
      ca: somme([pVd, av(pChr.data), vir(pChr.data), -rb(pChr.data)]),
      charges: somme((pCh.data ?? []).map((c) => parseMontant(c.montant))),
      fournisseurs: somme((pFo.data ?? []).map((f) => parseMontant(f.montant))),
    });
    setPaiements({
      cb: somme((cj.data ?? []).map((r) => r.cb)),
      especes: somme((cj.data ?? []).map((r) => r.especes)),
      virements: somme((cj.data ?? []).map((r) => r.virements)),
    });
    const soldesPositifs = (sc.data ?? []).map((s) => s.solde).filter((s) => s > 0);
    setCreances({ total: somme(soldesPositifs), nb: soldesPositifs.length });
  }, [debut, fin, mois, enMois, periode]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Liste des employés (pour le filtre de la section Équipe). Cloisonnée au
  // magasin actif : la RLS de `users` laisse un superadmin voir tous les
  // magasins, on filtre donc explicitement ici.
  useEffect(() => {
    if (!magasinId) return;
    supabase.from('users').select('id, nom').eq('magasin_id', magasinId).order('nom').then(({ data }) => setEmployes(data ?? []));
  }, [magasinId]);

  // Détail intéressement / heures par employé sur la période (section Équipe).
  // Le filtre par employé n'agit QUE sur cette section (le CA global reste
  // consolidé, tous employés confondus).
  const chargerEquipe = useCallback(async () => {
    let qCa = supabase
      .from('v_ca_jour')
      .select('caisse_id, date, employe_id, avances, remboursements, autres')
      .gte('date', debut)
      .lte('date', fin);
    let qInt = supabase
      .from('v_interessement_employe')
      .select('caisse_id, employe_id, date, est_proprietaire, heures_travaillees, pourcentage_interessement, ca_jour, encaissements, interessement')
      .gte('date', debut)
      .lte('date', fin)
      .order('date', { ascending: false });
    let qChr = supabase.from('chromes').select('date, employe_id, type, montant').gte('date', debut).lte('date', fin);
    let qPay = supabase.from('paiements_employes').select('montant').gte('date', debut).lte('date', fin);
    if (employeFiltre) {
      qCa = qCa.eq('employe_id', employeFiltre);
      qInt = qInt.eq('employe_id', employeFiltre);
      qChr = qChr.eq('employe_id', employeFiltre);
      qPay = qPay.eq('employe_id', employeFiltre);
    }
    const [ca, ir, chr, pay] = await Promise.all([qCa, qInt, qChr, qPay]);
    setCaEmpRows(ca.data ?? []);
    setIntRows(ir.data ?? []);
    setChromesEmpRows(chr.data ?? []);
    setTotalPaiements(somme((pay.data ?? []).map((p) => p.montant)));
  }, [debut, fin, employeFiltre]);

  useEffect(() => {
    chargerEquipe();
  }, [chargerEquipe]);

  // --- CRUD (mode Mois uniquement) ---
  const setteur = { charges: setCharges, fournisseurs: setFournisseurs };
  const donnees = { charges, fournisseurs };

  async function ajouter(table) {
    const { data } = await supabase.from(table).insert({ libelle: '', montant: 0, mois }).select().single();
    if (data) setteur[table]((prev) => [...prev, data]);
  }
  function majLigne(table, id, champ, valeur) {
    setteur[table]((prev) => prev.map((x) => (x.id === id ? { ...x, [champ]: valeur } : x)));
  }
  async function enregistrer(table, id) {
    const it = donnees[table].find((x) => x.id === id);
    if (!it) return;
    await supabase.from(table).update({ libelle: it.libelle || '', montant: parseMontant(it.montant) }).eq('id', id);
  }
  async function supprimer(table, id) {
    if (!window.confirm('Supprimer cette ligne ? Cette action est irréversible.')) return;
    await supabase.from(table).delete().eq('id', id);
    setteur[table]((prev) => prev.filter((x) => x.id !== id));
  }
  async function copierPrecedent(table) {
    const precedent = moisPrecedent(mois);
    const avecCat = table === 'charges';
    const { data } = await supabase
      .from(table)
      .select(avecCat ? 'libelle, montant, categorie' : 'libelle, montant')
      .eq('mois', precedent);
    if (!data || data.length === 0) return;
    const { data: inserts } = await supabase
      .from(table)
      .insert(
        data.map((d) => ({
          libelle: d.libelle,
          montant: d.montant,
          mois,
          ...(avecCat ? { categorie: d.categorie ?? null } : {}),
        }))
      )
      .select();
    setteur[table]((prev) => [...prev, ...(inserts ?? [])]);
  }

  // Catégorie d'une charge : maj locale + persistance immédiate (un select n'a
  // pas de blur fiable sur mobile, on écrit la valeur reçue directement).
  async function majCategorie(id, categorie) {
    majLigne('charges', id, 'categorie', categorie);
    await supabase.from('charges').update({ categorie: categorie || null }).eq('id', id);
  }

  async function ajouterJustificatif(table, id, file) {
    const blob = await compresserImage(file);
    // Chemin cloisonné par magasin (1er segment = magasin_id) : la policy
    // Storage refuse l'accès aux justificatifs d'un autre magasin.
    const chemin = `${magasinId}/${table}/${id}.jpg`;
    const { error: up } = await supabase.storage
      .from('justificatifs')
      .upload(chemin, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (up) {
      setStatutOcr(`Échec de l'envoi : ${up.message}`);
      return;
    }
    await supabase.from(table).update({ justificatif: chemin }).eq('id', id);
    setteur[table]((prev) => prev.map((x) => (x.id === id ? { ...x, justificatif: chemin } : x)));

    const ligne = donnees[table].find((x) => x.id === id);
    const dejaRempli = ligne && parseMontant(ligne.montant) > 0;
    setStatutOcr('Lecture du ticket en cours…');
    try {
      const { montant } = await lireMontant(blob);
      if (montant != null) {
        if (!dejaRempli) {
          await supabase.from(table).update({ montant }).eq('id', id);
          setteur[table]((prev) => prev.map((x) => (x.id === id ? { ...x, montant: String(montant) } : x)));
        }
        setStatutOcr(`Montant détecté : ${formatEuros(montant)} (à vérifier).`);
      } else {
        setStatutOcr('Montant non détecté sur la photo — saisis-le à la main.');
      }
    } catch {
      setStatutOcr('Lecture automatique indisponible — saisis le montant à la main.');
    }
  }

  async function voirJustificatif(chemin) {
    const { data, error } = await supabase.storage.from('justificatifs').createSignedUrl(chemin, 120);
    if (error || !data?.signedUrl) {
      setStatutOcr("Impossible d'ouvrir le justificatif.");
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  // --- Totaux ---
  // CA par jour = ventes directes + avances − remboursements + autres, sur
  // l'UNION des jours de clôture ET des jours de chromes (montants saisis en
  // retard inclus). Pas de double comptage : ventes_directes ↔ clôtures,
  // avances/remboursements/autres ↔ table chromes. Encaissements affichés =
  // ventes directes + autres (argent réellement entré).
  const jours = (() => {
    const map = {};
    const j = (date) => (map[date] ??= { vd: 0, av: 0, rb: 0, vir: 0 });
    encRows.forEach((r) => {
      const d = j(r.date);
      d.vd = somme([d.vd, r.ventes_directes]);
    });
    chromesRows.forEach((r) => {
      const d = j(r.date);
      if (r.type === 'avance') d.av = somme([d.av, r.montant]);
      else if (r.type === 'autre') d.vir = somme([d.vir, r.montant]);
      else d.rb = somme([d.rb, r.montant]);
    });
    return Object.entries(map)
      .map(([date, v]) => ({
        date,
        encaissements: somme([v.vd, v.vir]),
        ca: somme([v.vd, v.av, v.vir, -v.rb]),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  })();

  const caPeriode = somme(jours.map((d) => d.ca));
  const encaissements = somme(jours.map((d) => d.encaissements));
  const totalCharges = somme(charges.map((c) => parseMontant(c.montant)));
  const totalFournisseurs = somme(fournisseurs.map((f) => parseMontant(f.montant)));
  const totalDepenses = somme([totalCharges, totalFournisseurs]);
  const benefice = somme([caPeriode, -totalCharges, -totalFournisseurs]);

  // Compte de résultat + comparaison période précédente + trésorerie.
  const totalAvances = somme(chromesRows.filter((c) => c.type === 'avance').map((c) => c.montant));
  const totalRemboursements = somme(chromesRows.filter((c) => c.type === 'remboursement').map((c) => c.montant));
  const autresChromes = somme(chromesRows.filter((c) => c.type === 'autre').map((c) => c.montant));
  const prevDepenses = prevTot ? somme([prevTot.charges, prevTot.fournisseurs]) : null;
  const beneficePrev = prevTot ? somme([prevTot.ca, -prevTot.charges, -prevTot.fournisseurs]) : null;
  const margeNette = caPeriode > 0 ? (benefice / caPeriode) * 100 : null;
  const modesPaiement = [
    ['💳 Carte bancaire', paiements.cb],
    ['💵 Espèces', paiements.especes],
    ['🏦 Virements', paiements.virements],
    ['💠 Autres (chromes)', autresChromes],
  ];

  // TVA — ESTIMATION indicative (taux normal, prix TTC). Collectée sur le CA ;
  // déductible sur les fournisseurs + les charges dont la catégorie porte en
  // général de la TVA récupérable (salaires, assurances, banque, impôts et
  // loyer nu exclus). À valider avec un comptable.
  const partTva = TAUX_TVA / (100 + TAUX_TVA);
  const tvaCollectee = caPeriode > 0 ? caPeriode * partTva : 0;
  const chargesAvecTva = somme(
    charges.filter((c) => tvaRecuperable(c.categorie)).map((c) => parseMontant(c.montant))
  );
  const tvaDeductible = somme([chargesAvecTva, totalFournisseurs]) * partTva;
  const tvaAReverser = tvaCollectee - tvaDeductible;

  // Performance : seuil de rentabilité (couvrir les dépenses), CA moyen par
  // jour d'activité, meilleur jour de la période.
  const pctRentabilite = totalDepenses > 0 ? (caPeriode / totalDepenses) * 100 : null;
  const dateRentabilite = (() => {
    if (totalDepenses <= 0 || caPeriode < totalDepenses) return null;
    let cumul = 0;
    for (const d of jours) {
      cumul = somme([cumul, d.ca]);
      if (cumul >= totalDepenses) return d.date;
    }
    return null;
  })();
  const caMoyenJour = jours.length > 0 ? caPeriode / jours.length : 0;
  const meilleurJour = jours.reduce((m, d) => (m == null || d.ca > m.ca ? d : m), null);

  // Grille « Résultat par mois » (modes Année / Période) — le tableau mensuel
  // classique des logiciels de compta : CA / dépenses / résultat par mois.
  const grilleMois = (() => {
    if (enMois) return [];
    const map = {};
    const g = (k) => (map[k] ??= { ca: 0, dep: 0 });
    jours.forEach((d) => {
      const k = d.date.slice(0, 7);
      g(k).ca = somme([g(k).ca, d.ca]);
    });
    [...charges, ...fournisseurs].forEach((l) => {
      if (!l.mois) return;
      const k = l.mois.slice(0, 7);
      g(k).dep = somme([g(k).dep, parseMontant(l.montant)]);
    });
    return Object.keys(map)
      .sort()
      .map((k) => ({ mois: k, ...map[k], res: somme([map[k].ca, -map[k].dep]) }));
  })();

  // Répartition CA : par semaine (mois) ou par mois (année/période).
  const semaines = [1, 2, 3, 4, 5].map((n) => ({
    n,
    ca: somme(jours.filter((d) => semaineDuMois(d.date) === n).map((d) => d.ca)),
  }));
  const parMois = (() => {
    const map = {};
    jours.forEach((d) => {
      const k = d.date.slice(0, 7);
      map[k] = somme([map[k] || 0, d.ca]);
    });
    return Object.keys(map).sort().map((k) => ({ mois: k, ca: map[k] }));
  })();

  const pointsCA = jours.map((d) => ({ label: d.date.slice(8, 10), valeur: d.ca }));
  const barres = enMois
    ? semaines.map((s) => ({ label: `S${s.n}`, valeur: s.ca }))
    : parMois.map((m) => ({ label: moisCourt(m.mois), valeur: m.ca }));
  // Charges regroupées PAR CATÉGORIE (camembert + sous-totaux, style logiciel de compta).
  const chargesParCategorie = (() => {
    const map = {};
    charges.forEach((c) => {
      const k = libelleCategorie(c.categorie);
      map[k] = somme([map[k] || 0, parseMontant(c.montant)]);
    });
    return Object.entries(map)
      .map(([label, valeur]) => ({ label, valeur }))
      .sort((a, b) => b.valeur - a.valeur);
  })();
  const partsCharges = chargesParCategorie;
  const partsDepenses = [
    ...charges.map((c) => ({ label: c.libelle || 'Charge', valeur: parseMontant(c.montant) })),
    ...fournisseurs.map((f) => ({ label: f.libelle || 'Fournisseur', valeur: parseMontant(f.montant) })),
  ];

  // --- Détail par employé (intéressement / heures), rapatrié du Dashboard ---
  const nomEmploye = (id) => employes.find((e) => e.id === id)?.nom ?? '—';
  const apportCaisse = new Map(caEmpRows.map((r) => [r.caisse_id, r]));
  const lignesCloture = intRows.map((r) => {
    const ca = apportCaisse.get(r.caisse_id);
    return {
      cle: `${r.caisse_id}:${r.employe_id}`,
      date: r.date,
      employe_id: r.employe_id,
      est_proprietaire: r.est_proprietaire,
      ca_jour: r.ca_jour,
      encaissements: r.encaissements,
      avances: r.est_proprietaire ? ca?.avances ?? 0 : null,
      remboursements: r.est_proprietaire ? ca?.remboursements ?? 0 : null,
      autres: r.est_proprietaire ? ca?.autres ?? 0 : null,
      heures: r.heures_travaillees,
      pourcentage: r.pourcentage_interessement,
      interessement: r.interessement,
    };
  });
  // Jours de chromes SANS clôture → lignes « hors clôture » (CA = avances − remb.).
  const chromeParCle = new Map();
  chromesEmpRows.forEach((c) => {
    const cle = `${c.employe_id}|${c.date}`;
    const v = chromeParCle.get(cle) ?? { avances: 0, remboursements: 0, autres: 0 };
    if (c.type === 'avance') v.avances = somme([v.avances, c.montant]);
    else if (c.type === 'autre') v.autres = somme([v.autres, c.montant]);
    else v.remboursements = somme([v.remboursements, c.montant]);
    chromeParCle.set(cle, v);
  });
  const closureCles = new Set(caEmpRows.map((r) => `${r.employe_id}|${r.date}`));
  const lignesOrphelines = [...chromeParCle.entries()]
    .filter(([cle]) => !closureCles.has(cle))
    .map(([cle, v]) => {
      const [employe_id, date] = cle.split('|');
      return {
        cle: `orphan:${cle}`,
        date,
        employe_id,
        est_proprietaire: true,
        orphelin: true,
        ca_jour: somme([v.avances, -v.remboursements, v.autres]),
        encaissements: somme([v.autres]),
        avances: v.avances,
        remboursements: v.remboursements,
        autres: v.autres,
        heures: 0,
        pourcentage: 0,
        interessement: 0,
      };
    });
  const lignesDetail = [...lignesCloture, ...lignesOrphelines].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.est_proprietaire ? 1 : 0) - (a.est_proprietaire ? 1 : 0);
  });
  const nomLigne = (r) =>
    nomEmploye(r.employe_id) + (r.orphelin ? ' (hors clôture)' : r.est_proprietaire ? '' : ' (partagé)');
  const totalInteressement = somme(intRows.map((r) => r.interessement));
  const totalHeures = somme(intRows.map((r) => r.heures_travaillees));

  function exporterCSV() {
    const entetes = [
      'Date', 'Employé', 'Avances', 'Remboursements', 'Autres', 'CA', 'Encaissements', 'Heures', '% intéress.', 'Intéressement',
    ];
    const lignes = lignesDetail.map((r) => [
      r.date, nomLigne(r), r.avances ?? '', r.remboursements ?? '', r.autres ?? '',
      r.ca_jour ?? '', r.encaissements ?? '', r.heures, r.pourcentage, r.interessement,
    ]);
    telechargerCSV(`comptabilite-${debut}_${fin}.csv`, entetes, lignes);
  }

  function exporterPDF() {
    telechargerPDF(`comptabilite-${debut}_${fin}.pdf`, {
      titre: magasinNom ? `${magasinNom} — Comptabilité` : 'Comptabilité',
      sousTitre: `${formatDateFr(debut)} → ${formatDateFr(fin)}`,
      resume: [
        ['CA', formatEuros(caPeriode)],
        ['Encaissements', formatEuros(encaissements)],
        ['Charges', formatEuros(totalCharges)],
        ['Fournisseurs', formatEuros(totalFournisseurs)],
        ['Résultat net', formatEuros(benefice)],
        ...(comptaPro
          ? [
              ['Marge nette', margeNette != null ? pct1(margeNette) : '—'],
              ['Évolution CA vs période préc.', prevTot?.ca ? formatEuros(prevTot.ca) : '—'],
              ['Créances clients (à ce jour)', `${formatEuros(creances.total)} (${creances.nb} client${creances.nb > 1 ? 's' : ''})`],
              ['TVA à reverser (estimation)', formatEuros(tvaAReverser)],
              ['Seuil de rentabilité', pctRentabilite != null ? pct1(Math.min(999, pctRentabilite)) : '—'],
              ['CA moyen / jour d’activité', formatEuros(caMoyenJour)],
            ]
          : []),
        [`CA cumulé ${debut.slice(0, 4)}`, formatEuros(caAnnee)],
        ['Intéressement', formatEuros(totalInteressement)],
        ['Heures travaillées', `${formatNombre(totalHeures)} h`],
        ['Paiements employés', formatEuros(totalPaiements)],
      ],
      sections: [
        ...(comptaPro ? [
        {
          titre: 'Compte de résultat',
          entetes: ['Poste', 'Montant'],
          lignes: [
            ['Ventes encaissées (hors remboursements de dettes)', formatEuros(somme([encaissements, -totalRemboursements]))],
            ['+ Avances clients (chromes)', formatEuros(totalAvances)],
            ['Remboursements de dettes encaissés (sans effet CA)', formatEuros(totalRemboursements)],
            ['= Chiffre d’affaires', formatEuros(caPeriode)],
            ['− Charges fixes', formatEuros(totalCharges)],
            ['− Achats fournisseurs', formatEuros(totalFournisseurs)],
            ['= Résultat net', formatEuros(benefice)],
            ['Marge nette', margeNette != null ? pct1(margeNette) : '—'],
          ],
        },
        {
          titre: 'Trésorerie — encaissements par moyen de paiement',
          entetes: ['Moyen', 'Montant'],
          lignes: modesPaiement.map(([lib, val]) => [lib.replace(/^\S+\s/, ''), formatEuros(val)]),
        },
        {
          titre: 'Charges par catégorie',
          entetes: ['Catégorie', 'Montant', 'Part'],
          lignes: chargesParCategorie.map((c) => [
            c.label.replace(/^\S+\s/, ''),
            formatEuros(c.valeur),
            totalCharges > 0 ? pct1((c.valeur / totalCharges) * 100) : '—',
          ]),
        },
        {
          titre: 'TVA (estimation indicative)',
          entetes: ['Poste', 'Montant'],
          lignes: [
            [`TVA collectée (${TAUX_TVA} % TTC)`, formatEuros(tvaCollectee)],
            ['− TVA déductible (achats + charges éligibles)', formatEuros(tvaDeductible)],
            ['= TVA à reverser (estimée)', formatEuros(tvaAReverser)],
          ],
        },
        ] : []),
        enMois
          ? { titre: 'CA par semaine', entetes: ['Semaine', 'CA'], lignes: semaines.map((s) => [`Semaine ${s.n}`, formatEuros(s.ca)]) }
          : comptaPro
            ? {
                titre: 'Résultat par mois',
                entetes: ['Mois', 'CA', 'Dépenses', 'Résultat'],
                lignes: grilleMois.map((m) => [m.mois, formatEuros(m.ca), formatEuros(m.dep), formatEuros(m.res)]),
              }
            : {
                titre: 'CA par mois',
                entetes: ['Mois', 'CA'],
                lignes: parMois.map((m) => [m.mois, formatEuros(m.ca)]),
              },
        { titre: 'Charges', entetes: ['Libellé', 'Montant'], lignes: charges.map((c) => [c.libelle || '—', formatEuros(parseMontant(c.montant))]) },
        { titre: 'Fournisseurs', entetes: ['Libellé', 'Montant'], lignes: fournisseurs.map((f) => [f.libelle || '—', formatEuros(parseMontant(f.montant))]) },
        {
          titre: 'Intéressement & heures par employé',
          entetes: ['Date', 'Employé', 'CA', 'Heures', 'Intéress.'],
          lignes: lignesDetail.map((r) => [
            formatDateFr(r.date), nomLigne(r), r.ca_jour != null ? formatEuros(r.ca_jour) : '—',
            formatNombre(r.heures), formatEuros(r.interessement),
          ]),
        },
      ],
    });
  }

  return (
    <div className="page">
      <h1>Comptabilité</h1>

      <div className="card filtres">
        <div className="bascule">
          {[['mois', 'Mois'], ['annee', 'Année'], ['perso', 'Période']].map(([p, libelle]) => (
            <button key={p} className={periode === p ? 'actif' : ''} onClick={() => setPeriode(p)}>
              {libelle}
            </button>
          ))}
        </div>

        {periode === 'perso' ? (
          <div className="form-inline">
            <label className="field">
              <span>Du</span>
              <input type="date" value={perso.debut} onChange={(e) => setPerso((p) => ({ ...p, debut: e.target.value }))} />
            </label>
            <label className="field">
              <span>Au</span>
              <input type="date" value={perso.fin} onChange={(e) => setPerso((p) => ({ ...p, fin: e.target.value }))} />
            </label>
          </div>
        ) : (
          <label className="field">
            <span>{enMois ? 'Mois' : 'Année (choisir un mois de l’année)'}</span>
            <input type="month" value={mois.slice(0, 7)} onChange={(e) => setMois(`${e.target.value}-01`)} />
          </label>
        )}

        <div className="form-inline">
          <button type="button" className="btn" onClick={exporterCSV}>Export CSV / Excel</button>
          <button type="button" className="btn" onClick={exporterPDF}>Export PDF</button>
        </div>
        <p className="periode-info">{formatDateFr(debut)} → {formatDateFr(fin)}</p>
      </div>

      <div className="cartes-kpi">
        <div className="kpi">
          <span className="kpi-label">CA</span>
          <span className="kpi-valeur">{formatEuros(caPeriode)}</span>
          <Evolution actuel={caPeriode} precedent={prevTot?.ca} />
        </div>
        <div className="kpi">
          <span className="kpi-label">Encaissements</span>
          <span className="kpi-valeur">{formatEuros(encaissements)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Dépenses</span>
          <span className="kpi-valeur">{formatEuros(totalDepenses)}</span>
          <Evolution actuel={totalDepenses} precedent={prevDepenses} inverse />
        </div>
        <div className="kpi">
          <span className="kpi-label">Résultat net</span>
          <span className={`kpi-valeur ${benefice >= 0 ? 'solde-ok' : 'dette'}`}>{formatEuros(benefice)}</span>
          <Evolution actuel={benefice} precedent={beneficePrev} />
        </div>
        <div className="kpi">
          <span className="kpi-label">Marge nette</span>
          <span className={`kpi-valeur ${margeNette != null && margeNette < 0 ? 'dette' : ''}`}>
            {margeNette != null ? pct1(margeNette) : '—'}
          </span>
        </div>
        <div className="kpi"><span className="kpi-label">CA cumulé {debut.slice(0, 4)}</span><span className="kpi-valeur">{formatEuros(caAnnee)}</span></div>
      </div>

      {!comptaPro && (
        <Link to="/gestion" className="card banniere-config">
          <span className="banniere-config-emoji">📊</span>
          <span>
            <strong>Compta Pro</strong>
            <span className="statut">
              Trésorerie, compte de résultat, TVA estimée, catégories de charges, résultat par
              mois — active l’option dans Gestion → Abonnement.
            </span>
          </span>
          <span className="banniere-config-fleche">→</span>
        </Link>
      )}

      {comptaPro && (
      <>
      {/* Trésorerie (encaissements par moyen de paiement) + créances clients */}
      <div className="card">
        <h2>💰 Trésorerie</h2>
        {modesPaiement.map(([lib, val]) => {
          const part = encaissements > 0 ? (val / encaissements) * 100 : 0;
          return (
            <div key={lib} className="tres-ligne">
              <span className="tres-lib">{lib}</span>
              <span className="tres-val">
                {formatEuros(val)} <span className="tres-part">{encaissements > 0 ? pct1(part) : ''}</span>
              </span>
              <span className="tres-barre" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.max(0, part))}%` }} />
              </span>
            </div>
          );
        })}
        {totalRemboursements > 0 && (
          <p className="statut">
            dont remboursements de dettes récupérés : {formatEuros(totalRemboursements)} (déjà
            comptés au CA le jour de l’avance)
          </p>
        )}
        <hr />
        <div className="recap-ligne">
          <span>Créances clients (dettes en cours, à ce jour)</span>
          <strong className={creances.total > 0 ? 'dette' : 'solde-ok'}>
            {formatEuros(creances.total)}
            {creances.nb > 0 ? ` · ${creances.nb} client${creances.nb > 1 ? 's' : ''}` : ''}
          </strong>
        </div>
      </div>

      {/* Performance : seuil de rentabilité + moyennes */}
      <div className="card">
        <h2>📈 Performance</h2>
        <div className="tres-ligne">
          <span className="tres-lib">Seuil de rentabilité (couvrir les dépenses)</span>
          <span className="tres-val">
            {pctRentabilite != null ? pct1(Math.min(999, pctRentabilite)) : '—'}
          </span>
          <span className="tres-barre" aria-hidden="true">
            <span
              className={pctRentabilite != null && pctRentabilite >= 100 ? '' : 'barre-attention'}
              style={{ width: `${Math.min(100, Math.max(0, pctRentabilite ?? 0))}%` }}
            />
          </span>
        </div>
        {dateRentabilite && (
          <p className="statut">
            ✅ Dépenses couvertes depuis le <strong>{formatDateFr(dateRentabilite)}</strong> — tout le
            CA au-delà est du résultat.
          </p>
        )}
        {pctRentabilite != null && pctRentabilite < 100 && (
          <p className="statut">
            Il manque <strong>{formatEuros(somme([totalDepenses, -caPeriode]))}</strong> de CA pour
            couvrir les dépenses de la période.
          </p>
        )}
        <div className="cartes-kpi">
          <div className="kpi">
            <span className="kpi-label">CA moyen / jour d’activité</span>
            <span className="kpi-valeur">{formatEuros(caMoyenJour)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Meilleur jour</span>
            <span className="kpi-valeur">
              {meilleurJour ? formatEuros(meilleurJour.ca) : '—'}
            </span>
            {meilleurJour && <span className="kpi-evo evo-ref">{formatDateFr(meilleurJour.date)}</span>}
          </div>
          <div className="kpi">
            <span className="kpi-label">Jours d’activité</span>
            <span className="kpi-valeur">{jours.length}</span>
          </div>
        </div>
      </div>

      {/* TVA — estimation indicative */}
      <div className="card">
        <h2>🧮 TVA (estimation)</h2>
        <div className="recap-ligne"><span>TVA collectée sur les ventes ({TAUX_TVA} % TTC)</span><strong>{formatEuros(tvaCollectee)}</strong></div>
        <div className="recap-ligne"><span>− TVA déductible (achats + charges éligibles)</span><strong>{formatEuros(tvaDeductible)}</strong></div>
        <hr />
        <div className="recap-ligne">
          <span>= TVA à reverser (estimée)</span>
          <strong className={tvaAReverser > 0 ? 'dette' : 'solde-ok'}>{formatEuros(tvaAReverser)}</strong>
        </div>
        <p className="statut">
          ⚠️ Estimation indicative : taux normal {TAUX_TVA} % sur des prix TTC ; TVA non comptée sur
          salaires, assurances, frais bancaires, impôts et loyer. Catégorise tes charges pour
          affiner, et valide toujours avec ton comptable.
        </p>
      </div>

      {/* Résultat mois par mois (modes Année / Période) */}
      {!enMois && grilleMois.length > 0 && (
        <div className="card">
          <h2>📅 Résultat par mois</h2>
          <div className="table-scroll">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Mois</th>
                  <th className="droite">CA</th>
                  <th className="droite">Dépenses</th>
                  <th className="droite">Résultat</th>
                </tr>
              </thead>
              <tbody>
                {grilleMois.map((m) => (
                  <tr key={m.mois}>
                    <td>{moisCourt(m.mois)} {m.mois.slice(0, 4)}</td>
                    <td className="droite">{formatEuros(m.ca)}</td>
                    <td className="droite">{formatEuros(m.dep)}</td>
                    <td className={`droite ${m.res >= 0 ? 'solde-ok' : 'dette'}`}>{formatEuros(m.res)}</td>
                  </tr>
                ))}
                <tr className="ligne-total">
                  <td><strong>Total</strong></td>
                  <td className="droite"><strong>{formatEuros(caPeriode)}</strong></td>
                  <td className="droite"><strong>{formatEuros(totalDepenses)}</strong></td>
                  <td className={`droite ${benefice >= 0 ? 'solde-ok' : 'dette'}`}><strong>{formatEuros(benefice)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      <div className="card">
        <button
          type="button"
          className="courses-tete"
          onClick={() => setGraphOuvert((o) => !o)}
          aria-expanded={graphOuvert}
        >
          <h2>📊 Graphiques</h2>
          <span className="chevron">{graphOuvert ? '▾' : '▸'}</span>
        </button>
      </div>

      {graphOuvert && (
      <>
      <div className="card">
        <h2>CA par jour</h2>
        <Courbe points={pointsCA} />
      </div>

      <div className="card">
        <h2>{enMois ? 'CA par semaine' : 'CA par mois'}</h2>
        <Barres items={barres} />
        <table className="tableau">
          <tbody>
            {enMois
              ? semaines.map((s) => (
                  <tr key={s.n}><td>Semaine {s.n}</td><td className="droite">{formatEuros(s.ca)}</td></tr>
                ))
              : parMois.map((m) => (
                  <tr key={m.mois}><td>{moisCourt(m.mois)} {m.mois.slice(0, 4)}</td><td className="droite">{formatEuros(m.ca)}</td></tr>
                ))}
          </tbody>
        </table>
      </div>

      {comptaPro && (
      <div className="card">
        <h2>Charges par catégorie</h2>
        <Camembert parts={partsCharges} />
        {chargesParCategorie.length > 0 && (
          <table className="tableau">
            <tbody>
              {chargesParCategorie.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className="droite">{formatEuros(c.valeur)}</td>
                  <td className="droite">
                    {totalCharges > 0 ? pct1((c.valeur / totalCharges) * 100) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      <div className="card">
        <div className="entete-client"><h2>Dépenses totales</h2><strong>{formatEuros(totalDepenses)}</strong></div>
        <Camembert parts={partsDepenses} />
      </div>
      </>
      )}

      {enMois ? (
        <>
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
            categories={comptaPro ? CATEGORIES_CHARGES : null}
            onCategorie={majCategorie}
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
          {statutOcr && <p className="statut">📷 {statutOcr}</p>}
        </>
      ) : (
        <p className="statut">
          Vue synthèse en lecture seule. Passe en mode <strong>Mois</strong> pour ajouter/modifier
          les charges et fournisseurs (avec justificatifs).
        </p>
      )}

      <div className="card">
        <div className="entete-client">
          <h2>Équipe — intéressement &amp; heures</h2>
          <label className="field filtre-employe">
            <span>Employé</span>
            <select value={employeFiltre} onChange={(e) => setEmployeFiltre(e.target.value)}>
              <option value="">Tous</option>
              {employes.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nom}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="cartes-kpi">
          <div className="kpi"><span className="kpi-label">Intéressement</span><span className="kpi-valeur">{formatEuros(totalInteressement)}</span></div>
          <div className="kpi"><span className="kpi-label">Heures</span><span className="kpi-valeur">{formatNombre(totalHeures)} h</span></div>
          <div className="kpi"><span className="kpi-label">Paiements employés</span><span className="kpi-valeur">{formatEuros(totalPaiements)}</span></div>
        </div>
        <button
          type="button"
          className="btn btn-discret"
          onClick={() => setDetailOuvert((o) => !o)}
          aria-expanded={detailOuvert}
        >
          {detailOuvert ? '▾ Masquer le détail par jour' : '▸ Voir le détail par jour'}
        </button>
        {detailOuvert && (
        <div className="table-scroll">
        <table className="tableau tableau-cartes">
          <thead>
            <tr>
              <th>Date</th>
              <th>Employé</th>
              <th className="droite">CA</th>
              <th className="droite">Encaiss.</th>
              <th className="droite">Avances</th>
              <th className="droite">Rembours.</th>
              <th className="droite">Autres</th>
              <th className="droite">Heures</th>
              <th className="droite">Intéress.</th>
            </tr>
          </thead>
          <tbody>
            {lignesDetail.map((r) => (
              <tr key={r.cle}>
                <td data-label="Date">{formatDateFr(r.date)}</td>
                <td data-label="Employé">{nomLigne(r)}</td>
                <td className="droite" data-label="CA">{r.ca_jour != null ? formatEuros(r.ca_jour) : '—'}</td>
                <td className="droite" data-label="Encaiss.">{r.encaissements != null ? formatEuros(r.encaissements) : '—'}</td>
                <td className="droite" data-label="Avances">{r.avances != null ? formatEuros(r.avances) : '—'}</td>
                <td className="droite" data-label="Rembours.">{r.remboursements != null ? formatEuros(r.remboursements) : '—'}</td>
                <td className="droite" data-label="Autres">{r.autres != null ? formatEuros(r.autres) : '—'}</td>
                <td className="droite" data-label="Heures">{formatNombre(r.heures)}</td>
                <td className="droite" data-label="Intéress.">{formatEuros(r.interessement)}</td>
              </tr>
            ))}
            {lignesDetail.length === 0 && (
              <tr><td colSpan={9} className="vide">Aucune donnée sur la période.</td></tr>
            )}
          </tbody>
        </table>
        </div>
        )}
      </div>

      {comptaPro && (
      <div className="card recap">
        <h2>🧾 Compte de résultat</h2>
        <p className="periode-info">{formatDateFr(debut)} → {formatDateFr(fin)}</p>
        <div className="recap-section">Produits</div>
        <div className="recap-ligne"><span>Ventes encaissées (hors remboursements de dettes)</span><strong>{formatEuros(somme([encaissements, -totalRemboursements]))}</strong></div>
        <div className="recap-ligne"><span>+ Avances clients (chromes)</span><strong>{formatEuros(totalAvances)}</strong></div>
        <div className="recap-ligne recap-soustotal"><span>= Chiffre d’affaires</span><strong>{formatEuros(caPeriode)}</strong></div>
        {totalRemboursements > 0 && (
          <p className="statut">
            ℹ️ Remboursements de dettes encaissés sur la période : {formatEuros(totalRemboursements)} —
            sans effet sur le CA (la vente a été comptée le jour de l’avance).
          </p>
        )}
        <div className="recap-section">Charges</div>
        <div className="recap-ligne"><span>− Charges fixes</span><strong>{formatEuros(totalCharges)}</strong></div>
        <div className="recap-ligne"><span>− Achats fournisseurs</span><strong>{formatEuros(totalFournisseurs)}</strong></div>
        <div className="recap-ligne recap-soustotal"><span>= Total dépenses</span><strong>{formatEuros(totalDepenses)}</strong></div>
        <hr />
        <div className="recap-ligne recap-resultat">
          <span>= Résultat net</span>
          <strong className={benefice >= 0 ? 'solde-ok' : 'dette'}>{formatEuros(benefice)}</strong>
        </div>
        <div className="recap-ligne">
          <span>Marge nette</span>
          <strong>{margeNette != null ? pct1(margeNette) : '—'}</strong>
        </div>
        {beneficePrev != null && beneficePrev !== 0 && (
          <p className="statut">
            Période précédente : {formatEuros(beneficePrev)}{' '}
            <Evolution actuel={benefice} precedent={beneficePrev} />
          </p>
        )}
      </div>
      )}
    </div>
  );
}
