import { describe, expect, it } from 'vitest';
import {
  coverageRatio,
  durationMinutes,
  findOverlappingPair,
  formatHHMM,
  intervalsOverlap,
  overlapMinutes,
  parseHHMM,
} from './minutes.js';

const at = (hhmm: string) => parseHHMM(hhmm);
const span = (from: string, to: string) => ({ startMin: at(from), endMin: at(to) });

describe('parseHHMM / formatHHMM', () => {
  it('wandelt beide Richtungen um', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('08:00')).toBe(480);
    expect(parseHHMM('08:30')).toBe(510);
    expect(parseHHMM('23:59')).toBe(1439);
    expect(formatHHMM(0)).toBe('00:00');
    expect(formatHHMM(510)).toBe('08:30');
    expect(formatHHMM(1440)).toBe('24:00');
  });

  it('lehnt Unsinn ab statt still NaN zu liefern', () => {
    expect(() => parseHHMM('8:00')).toThrow(RangeError);
    expect(() => parseHHMM('24:00')).toThrow(RangeError);
    expect(() => parseHHMM('08:60')).toThrow(RangeError);
    expect(() => parseHHMM('')).toThrow(RangeError);
    expect(() => formatHHMM(-1)).toThrow(RangeError);
    expect(() => formatHHMM(1441)).toThrow(RangeError);
  });
});

describe('overlapMinutes', () => {
  it('berechnet die Schnittmenge', () => {
    expect(overlapMinutes(span('08:00', '13:00'), span('09:00', '17:00'))).toBe(240);
    expect(overlapMinutes(span('09:00', '17:00'), span('08:00', '13:00'))).toBe(240);
  });

  it('liefert 0 bei Beruehrung oder Trennung', () => {
    // 13:00 ist Ende des einen und Beginn des anderen: kein Ueberlapp.
    expect(overlapMinutes(span('08:00', '13:00'), span('13:00', '16:00'))).toBe(0);
    expect(overlapMinutes(span('08:00', '13:00'), span('16:00', '18:00'))).toBe(0);
  });

  it('umschliesst vollstaendig enthaltene Intervalle', () => {
    expect(overlapMinutes(span('08:00', '18:00'), span('13:00', '16:00'))).toBe(180);
  });
});

describe('coverageRatio', () => {
  // Das ist die Regression gegen den zentralen Fehler der Vorgaengerversion:
  // dort war eine Kraft mit Arbeitsbeginn 09:00 fuer den 08:00-Block gar
  // nicht einplanbar, obwohl sie vier von fuenf Stunden anwesend ist.
  it('erkennt eine um 09:00 beginnende Kraft im Block 08:00-13:00 als ueberwiegend anwesend', () => {
    const work = span('09:00', '17:00');
    const block = span('08:00', '13:00');
    expect(overlapMinutes(work, block)).toBe(240);
    expect(coverageRatio(work, block)).toBeCloseTo(0.8);
    // Bei der Standardschwelle von 0.5 ist sie damit einsetzbar.
    expect(coverageRatio(work, block)).toBeGreaterThanOrEqual(0.5);
  });

  it('erkennt eine bis 12:00 arbeitende Teilzeitkraft im Nachmittagsblock als nicht einsetzbar', () => {
    const work = span('08:00', '12:00');
    const afternoon = span('16:00', '18:00');
    expect(coverageRatio(work, afternoon)).toBe(0);
  });

  it('rechnet den Anteil immer auf den Block, nicht auf die Arbeitszeit', () => {
    // Ganztagskraft 08:00-18:00 deckt den kurzen Block 13:00-16:00 voll ab.
    expect(coverageRatio(span('08:00', '18:00'), span('13:00', '16:00'))).toBe(1);
    // Umgekehrt deckt der kurze Block die lange Arbeitszeit nur teilweise ab.
    expect(coverageRatio(span('13:00', '16:00'), span('08:00', '18:00'))).toBeCloseTo(0.3);
  });

  it('liefert 0 statt NaN bei leerem Block', () => {
    expect(coverageRatio(span('08:00', '13:00'), span('10:00', '10:00'))).toBe(0);
  });
});

describe('durationMinutes / intervalsOverlap', () => {
  it('rechnet Laengen und erkennt Ueberschneidungen', () => {
    expect(durationMinutes(span('08:00', '13:00'))).toBe(300);
    expect(durationMinutes(span('13:00', '08:00'))).toBe(0);
    expect(intervalsOverlap(span('08:00', '13:00'), span('12:59', '14:00'))).toBe(true);
    expect(intervalsOverlap(span('08:00', '13:00'), span('13:00', '14:00'))).toBe(false);
  });
});

describe('findOverlappingPair', () => {
  it('akzeptiert das reale Tagesmodell Mo/Di/Do', () => {
    const blocks = [span('08:00', '13:00'), span('13:00', '16:00'), span('16:00', '18:00')];
    expect(findOverlappingPair(blocks)).toBeNull();
  });

  it('findet einen fehlerhaft gepflegten Tag', () => {
    const blocks = [span('08:00', '13:00'), span('12:30', '16:00')];
    expect(findOverlappingPair(blocks)).not.toBeNull();
  });

  it('kommt mit 0 und 1 Block klar', () => {
    expect(findOverlappingPair([])).toBeNull();
    expect(findOverlappingPair([span('08:00', '13:00')])).toBeNull();
  });
});
