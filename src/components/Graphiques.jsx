import { formatEuros } from '../lib/format';

// Graphiques en SVG natif (sans dépendance externe).

const COULEURS = [
  '#3fae6b', '#4f9cf9', '#e5534b', '#e0a72e',
  '#9b5de5', '#2dd4bf', '#f97316', '#ec4899', '#94a3b8',
];

// Arrondit une valeur « au beau chiffre » supérieur (1, 2, 5 × 10ⁿ) pour
// des graduations lisibles.
function pasArrondi(v) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

// Étiquette d'axe compacte : « 1,2 k€ » au-delà de 1000, « 850 € » sinon.
function labelAxe(v) {
  if (v >= 1000) {
    const k = v / 1000;
    return `${(Math.round(k * 10) / 10).toString().replace('.', ',')} k€`;
  }
  return `${Math.round(v)} €`;
}

// Calcule les graduations Y (0 → un peu au-dessus du max) et le haut du graphe.
function graduations(max) {
  const pas = pasArrondi(Math.max(max, 1) / 4);
  const haut = Math.max(pas, Math.ceil(Math.max(max, 1) / pas) * pas);
  const ticks = [];
  for (let v = 0; v <= haut + 1e-6; v += pas) ticks.push(v);
  return { ticks, haut };
}

/** Courbe (ligne) — ex. CA jour par jour. Axe Y gradué en euros, dates en X. */
export function Courbe({ points }) {
  const W = 340;
  const H = 170;
  const ML = 42; // marge gauche (labels Y)
  const MR = 10;
  const MT = 10;
  const MB = 22; // marge bas (labels X)
  const valeurs = points.map((p) => Number(p.valeur) || 0);
  const n = points.length;
  if (n === 0) return <p className="vide">Aucune donnée.</p>;
  const { ticks, haut } = graduations(Math.max(...valeurs));
  const x = (i) => ML + (n > 1 ? (i / (n - 1)) * (W - ML - MR) : (W - ML - MR) / 2);
  const y = (v) => MT + (1 - v / haut) * (H - MT - MB);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(valeurs[i]).toFixed(1)}`)
    .join(' ');
  const aire = `${d} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const pasX = Math.max(1, Math.ceil(n / 7)); // ~7 dates max en X
  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={ML} y1={y(t)} x2={W - MR} y2={y(t)} className="graph-grille" />
          <text x={ML - 5} y={y(t) + 3} textAnchor="end" className="graph-label">
            {labelAxe(t)}
          </text>
        </g>
      ))}
      <path d={aire} fill="rgba(63,174,107,0.12)" stroke="none" />
      <path d={d} fill="none" stroke="#3fae6b" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) =>
        i % pasX === 0 || i === n - 1 ? (
          <text key={p.label + i} x={x(i)} y={H - 7} textAnchor="middle" className="graph-label">
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Barres verticales — ex. CA par semaine. Axe Y gradué en euros. */
export function Barres({ items }) {
  const W = 340;
  const H = 180;
  const ML = 42;
  const MR = 10;
  const MT = 12;
  const MB = 22;
  const n = items.length || 1;
  const { ticks, haut } = graduations(Math.max(1, ...items.map((i) => Number(i.valeur) || 0)));
  const y = (v) => MT + (1 - v / haut) * (H - MT - MB);
  const pas = (W - ML - MR) / n;
  const largeur = Math.min(pas * 0.6, 46);
  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={ML} y1={y(t)} x2={W - MR} y2={y(t)} className="graph-grille" />
          <text x={ML - 5} y={y(t) + 3} textAnchor="end" className="graph-label">
            {labelAxe(t)}
          </text>
        </g>
      ))}
      {items.map((it, i) => {
        const v = Number(it.valeur) || 0;
        const yh = y(v);
        const xc = ML + i * pas + (pas - largeur) / 2;
        return (
          <g key={it.label}>
            <rect x={xc} y={yh} width={largeur} height={Math.max(0, y(0) - yh)} rx="3" fill="#4f9cf9" />
            <text x={xc + largeur / 2} y={H - 7} textAnchor="middle" className="graph-label">
              {it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Camembert (anneau) + légende — ex. répartition des charges. */
export function Camembert({ parts }) {
  const data = parts.filter((p) => (Number(p.valeur) || 0) > 0);
  const total = data.reduce((s, p) => s + (Number(p.valeur) || 0), 0);
  const r = 55;
  const cx = 70;
  const cy = 70;
  const sw = 26;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="camembert">
      <svg viewBox="0 0 140 140" className="graph-donut" role="img">
        <circle r={r} cx={cx} cy={cy} fill="none" stroke="#20242d" strokeWidth={sw} />
        {total > 0 &&
          data.map((p, i) => {
            const len = (Number(p.valeur) / total) * circ;
            const el = (
              <circle
                key={p.label + i}
                r={r}
                cx={cx}
                cy={cy}
                fill="none"
                stroke={COULEURS[i % COULEURS.length]}
                strokeWidth={sw}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <ul className="legende">
        {data.map((p, i) => (
          <li key={p.label + i}>
            <span className="puce" style={{ background: COULEURS[i % COULEURS.length] }} />
            <span className="legende-nom">{p.label || '—'}</span>
            <span className="legende-val">
              {formatEuros(p.valeur)} · {total ? Math.round((p.valeur / total) * 100) : 0}%
            </span>
          </li>
        ))}
        {data.length === 0 && <li className="vide">Aucune dépense.</li>}
      </ul>
    </div>
  );
}
