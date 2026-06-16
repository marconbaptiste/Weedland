import { formatEuros } from '../lib/format';

// Graphiques en SVG natif (sans dépendance externe).

const COULEURS = [
  '#3fae6b', '#4f9cf9', '#e5534b', '#e0a72e',
  '#9b5de5', '#2dd4bf', '#f97316', '#ec4899', '#94a3b8',
];

/** Courbe (ligne) — ex. CA jour par jour. */
export function Courbe({ points }) {
  const W = 320;
  const H = 110;
  const P = 6;
  const valeurs = points.map((p) => Number(p.valeur) || 0);
  const n = points.length;
  if (n === 0) return <p className="vide">Aucune donnée.</p>;
  const max = Math.max(1, ...valeurs);
  const x = (i) => P + (n > 1 ? (i / (n - 1)) * (W - 2 * P) : (W - 2 * P) / 2);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(valeurs[i]).toFixed(1)}`).join(' ');
  const aire = `${d} L${x(n - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
      <path d={aire} fill="rgba(63,174,107,0.12)" stroke="none" />
      <path d={d} fill="none" stroke="#3fae6b" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Barres verticales — ex. CA par semaine. */
export function Barres({ items }) {
  const W = 320;
  const H = 130;
  const P = 18;
  const n = items.length || 1;
  const max = Math.max(1, ...items.map((i) => Number(i.valeur) || 0));
  const pas = (W - 2 * P) / n;
  const largeur = pas * 0.6;
  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img">
      {items.map((it, i) => {
        const v = Number(it.valeur) || 0;
        const h = (v / max) * (H - 2 * P - 10);
        const xc = P + i * pas + (pas - largeur) / 2;
        return (
          <g key={it.label}>
            <rect x={xc} y={H - P - h} width={largeur} height={h} rx="3" fill="#4f9cf9" />
            <text x={xc + largeur / 2} y={H - P + 12} textAnchor="middle" className="graph-label">
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
