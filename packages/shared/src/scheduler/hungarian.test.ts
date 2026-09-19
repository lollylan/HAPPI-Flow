import { describe, expect, it } from 'vitest';
import { FORBIDDEN, solveAssignment } from './hungarian.js';

const totalCost = (cost: number[][]) =>
  solveAssignment(cost).reduce((sum, entry) => sum + entry.cost, 0);

/** Alle Zuordnungen durchprobieren - nur fuer kleine Matrizen im Test. */
function bruteForce(cost: number[][]): number {
  const rows = cost.length;
  const columns = cost[0]?.length ?? 0;
  let best = 0;

  const walk = (row: number, taken: Set<number>, sum: number) => {
    if (row === rows) {
      best = Math.min(best, sum);
      return;
    }
    // Zeile auslassen ist erlaubt (entspricht der Leerspalte).
    walk(row + 1, taken, sum);
    for (let column = 0; column < columns; column++) {
      if (taken.has(column)) continue;
      const value = cost[row]?.[column] ?? FORBIDDEN;
      if (value >= FORBIDDEN) continue;
      taken.add(column);
      walk(row + 1, taken, sum + value);
      taken.delete(column);
    }
  };

  walk(0, new Set(), 0);
  return best;
}

describe('solveAssignment', () => {
  it('kommt mit leerer Eingabe klar', () => {
    expect(solveAssignment([])).toEqual([]);
    expect(solveAssignment([[]])).toEqual([]);
  });

  it('findet die günstigste Zuordnung bei eindeutiger Lösung', () => {
    // Zeile 0 gehört auf Spalte 1, Zeile 1 auf Spalte 0.
    const result = solveAssignment([
      [0, -10],
      [-8, -1],
    ]);
    expect(result).toEqual([
      { row: 1, column: 0, cost: -8 },
      { row: 0, column: 1, cost: -10 },
    ]);
  });

  it('vermeidet die gierige Falle', () => {
    // Gierig würde Zeile 0 auf Spalte 0 setzen (-10) und Zeile 1 leer lassen,
    // weil Zeile 1 sonst nur Spalte 0 könnte. Gesamt -10.
    // Optimal ist Zeile 0 auf Spalte 1 und Zeile 1 auf Spalte 0: -9 + -9 = -18.
    const cost = [
      [-10, -9],
      [-9, FORBIDDEN],
    ];
    const result = solveAssignment(cost);
    expect(result.reduce((sum, entry) => sum + entry.cost, 0)).toBe(-18);
    expect(result).toHaveLength(2);
  });

  it('lässt Zeilen unbesetzt, statt teure Zuordnungen zu erzwingen', () => {
    // Beide Spalten kosten mehr als sie bringen - niemand wird gesetzt.
    expect(solveAssignment([[5, 7]])).toEqual([]);
    // Eine lohnt sich, die andere nicht.
    expect(solveAssignment([[-3, 7]])).toEqual([{ row: 0, column: 0, cost: -3 }]);
  });

  it('weist unzulässige Paarungen niemals zu', () => {
    const result = solveAssignment([
      [FORBIDDEN, -5],
      [FORBIDDEN, FORBIDDEN],
    ]);
    expect(result).toEqual([{ row: 0, column: 1, cost: -5 }]);
  });

  it('kommt mit mehr Personen als Sitzen zurecht', () => {
    const result = solveAssignment([[-1], [-5], [-3]]);
    // Nur ein Sitz - die günstigste Person bekommt ihn.
    expect(result).toEqual([{ row: 1, column: 0, cost: -5 }]);
  });

  it('kommt mit mehr Sitzen als Personen zurecht', () => {
    const result = solveAssignment([[-1, -5, -3]]);
    expect(result).toEqual([{ row: 0, column: 1, cost: -5 }]);
  });

  it('liefert bei gleichen Kosten ein stabiles Ergebnis', () => {
    const cost = [
      [-5, -5],
      [-5, -5],
    ];
    const first = solveAssignment(cost);
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(solveAssignment(cost)).toEqual(first);
    }
  });

  it('stimmt über hundert Zufallsmatrizen mit dem Brute-Force-Ergebnis überein', () => {
    // Fester Generator statt Math.random: ein fehlschlagender Lauf muss
    // sich wiederholen lassen.
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let round = 0; round < 100; round++) {
      const rows = 1 + Math.floor(next() * 4);
      const columns = 1 + Math.floor(next() * 4);
      const cost: number[][] = [];
      for (let i = 0; i < rows; i++) {
        const line: number[] = [];
        for (let j = 0; j < columns; j++) {
          // Ein Fünftel der Felder ist gesperrt.
          line.push(next() < 0.2 ? FORBIDDEN : Math.round((next() - 0.7) * 100));
        }
        cost.push(line);
      }
      expect(totalCost(cost), `Runde ${round}`).toBe(bruteForce(cost));
    }
  });

  it('belegt jede Spalte höchstens einmal', () => {
    const cost = [
      [-5, -4, -3],
      [-5, -4, -3],
      [-5, -4, -3],
    ];
    const columns = solveAssignment(cost).map((entry) => entry.column);
    expect(new Set(columns).size).toBe(columns.length);
  });
});
