// Horaires hebdomadaires — utilitaires partagés (magasin + employés).
// Le stockage est un objet JSON indexé par jour ISO ("1" = lundi … "7" =
// dimanche) : magasin → {ouvert, debut, fin} ; employé → {travaille, debut, fin}.

export const JOURS_SEMAINE = [
  { cle: '1', court: 'Lun', long: 'Lundi' },
  { cle: '2', court: 'Mar', long: 'Mardi' },
  { cle: '3', court: 'Mer', long: 'Mercredi' },
  { cle: '4', court: 'Jeu', long: 'Jeudi' },
  { cle: '5', court: 'Ven', long: 'Vendredi' },
  { cle: '6', court: 'Sam', long: 'Samedi' },
  { cle: '7', court: 'Dim', long: 'Dimanche' },
];

// hh:mm depuis une heure éventuelle ("09:00:00" → "09:00").
const hhmm = (t, defaut) => (t ? String(t).slice(0, 5) : defaut);

// Jour ISO (1 = lundi … 7 = dimanche) d'une date 'YYYY-MM-DD'.
export function jourISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00`);
  return ((d.getDay() + 6) % 7) + 1;
}

// Horaires magasin par défaut : Lun–Sam 10:00–20:00, dimanche fermé.
export function horairesMagasinDefaut() {
  const h = {};
  JOURS_SEMAINE.forEach(({ cle }) => {
    h[cle] = { ouvert: cle !== '7', debut: '10:00', fin: '20:00' };
  });
  return h;
}

// Créneau d'ouverture du magasin pour une date (ou null si fermé / non défini).
export function creneauMagasin(horaires, dateISO) {
  const j = horaires?.[String(jourISO(dateISO))];
  if (!j || !j.ouvert) return null;
  return { debut: hhmm(j.debut, '10:00'), fin: hhmm(j.fin, '20:00') };
}

// Créneau fixe d'un employé pour une date (ou null si repos / non défini).
export function creneauEmploye(horairesFixes, dateISO) {
  const j = horairesFixes?.[String(jourISO(dateISO))];
  if (!j || !j.travaille) return null;
  return { debut: hhmm(j.debut, '10:00'), fin: hhmm(j.fin, '18:00') };
}
