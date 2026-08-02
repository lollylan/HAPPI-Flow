/**
 * Ungarischer Algorithmus (Kuhn-Munkres in der Jonker-Volgenant-Fassung).
 *
 * Findet die Zuordnung Zeilen -> Spalten mit den kleinsten Gesamtkosten.
 * Laufzeit O(n^2 * m); bei einer Praxis mit gut einem Dutzend Personen und
 * etwa zwei Dutzend Sitzen sind das Mikrosekunden.
 *
 * Warum exakt statt gierig: ein gieriges Verfahren setzt die erste passende
 * Person und verbraucht damit womoeglich die einzige, die einen anderen
 * Pflichtplatz haette fuellen koennen. Genau diese Fehlklasse hat die
 * Vorgaengerversion produziert.
 */

/** Kosten, ab denen eine Zuordnung als unzulaessig gilt. */
export const FORBIDDEN = 1e9;

export interface Assignment {
  readonly row: number;
  readonly column: number;
  readonly cost: number;
}

/**
 * Loest das Zuordnungsproblem.
 *
 * `cost[i][j]` sind die Kosten, Zeile i auf Spalte j zu setzen; negativ ist
 * erwuenscht. Zeilen ohne Zuordnung erscheinen nicht im Ergebnis - dafuer
 * werden intern Leerspalten mit Kosten 0 ergaenzt, sodass "gar nicht
 * einsetzen" immer moeglich und jeder positiven Zuordnung vorzuziehen ist.
 *
 * Deterministisch: bei gleichen Kosten entscheidet die Reihenfolge der
 * Eingabe, nie ein Zufallswert.
 */
export function solveAssignment(cost: readonly (readonly number[])[]): Assignment[] {
  const rows = cost.length;
  if (rows === 0) return [];
  const realColumns = cost[0]?.length ?? 0;

  // Leerspalten: eine je Zeile. Damit ist das Problem immer loesbar, auch
  // wenn mehr Personen als Sitze da sind.
  const columns = realColumns + rows;
  const padded: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const source = cost[i] ?? [];
    const line = new Array<number>(columns).fill(0);
    for (let j = 0; j < realColumns; j++) line[j] = source[j] ?? FORBIDDEN;
    padded.push(line);
  }

  const INF = Number.POSITIVE_INFINITY;
  // 1-basierte Hilfsfelder, wie in der Standardfassung des Verfahrens.
  const u = new Array<number>(rows + 1).fill(0);
  const v = new Array<number>(columns + 1).fill(0);
  const match = new Array<number>(columns + 1).fill(0); // Spalte -> Zeile
  const way = new Array<number>(columns + 1).fill(0);

  for (let i = 1; i <= rows; i++) {
    match[0] = i;
    let column = 0;
    const minCost = new Array<number>(columns + 1).fill(INF);
    const used = new Array<boolean>(columns + 1).fill(false);

    do {
      used[column] = true;
      const row = match[column] ?? 0;
      let delta = INF;
      let nextColumn = 0;

      for (let j = 1; j <= columns; j++) {
        if (used[j]) continue;
        const current = (padded[row - 1]?.[j - 1] ?? FORBIDDEN) - (u[row] ?? 0) - (v[j] ?? 0);
        if (current < (minCost[j] ?? INF)) {
          minCost[j] = current;
          way[j] = column;
        }
        if ((minCost[j] ?? INF) < delta) {
          delta = minCost[j] ?? INF;
          nextColumn = j;
        }
      }

      for (let j = 0; j <= columns; j++) {
        if (used[j]) {
          const matched = match[j] ?? 0;
          u[matched] = (u[matched] ?? 0) + delta;
          v[j] = (v[j] ?? 0) - delta;
        } else {
          minCost[j] = (minCost[j] ?? INF) - delta;
        }
      }
      column = nextColumn;
    } while ((match[column] ?? 0) !== 0);

    // Erweiterungspfad zurueckverfolgen.
    do {
      const previous = way[column] ?? 0;
      match[column] = match[previous] ?? 0;
      column = previous;
    } while (column);
  }

  const result: Assignment[] = [];
  for (let j = 1; j <= realColumns; j++) {
    const row = match[j] ?? 0;
    if (row === 0) continue;
    const value = padded[row - 1]?.[j - 1] ?? FORBIDDEN;
    // Unzulaessige Paarungen verwirft der Aufrufer nicht selbst - sie
    // duerfen das Ergebnis gar nicht erst erreichen.
    if (value >= FORBIDDEN) continue;
    result.push({ row: row - 1, column: j - 1, cost: value });
  }

  // Stabile Reihenfolge, damit der Aufrufer reproduzierbare Ergebnisse sieht.
  return result.sort((a, b) => a.column - b.column);
}
