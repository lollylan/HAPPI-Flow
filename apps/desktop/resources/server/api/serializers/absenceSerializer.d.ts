import type { Absence, PublicAbsence, SessionUser } from '@haeppi/shared';
/**
 * Die Datenschutz-Projektion fuer Abwesenheiten.
 *
 * Der Grund einer Abwesenheit ist eine Gesundheitsangabe. Kolleginnen
 * bekommen `type`, `note` und `status` deshalb **gar nicht erst geliefert** -
 * sie in der Oberflaeche auszublenden waere kein Schutz, weil die Daten
 * trotzdem im Browser lagen.
 *
 * Jeder Endpunkt, der Abwesenheiten ausgibt, muss durch diese Funktion.
 */
export declare function serializeAbsence(absence: Absence, viewer: SessionUser | undefined): Absence | PublicAbsence;
export declare function serializeAbsences(absences: readonly Absence[], viewer: SessionUser | undefined): (Absence | PublicAbsence)[];
//# sourceMappingURL=absenceSerializer.d.ts.map