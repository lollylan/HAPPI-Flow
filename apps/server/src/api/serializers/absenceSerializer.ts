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
export function serializeAbsence(
  absence: Absence,
  viewer: SessionUser | undefined,
): Absence | PublicAbsence {
  const maySeeDetails =
    viewer?.role === 'admin' ||
    (viewer?.employeeId !== null && viewer?.employeeId === absence.employeeId);

  if (maySeeDetails) return absence;

  return {
    id: absence.id,
    employeeId: absence.employeeId,
    startDate: absence.startDate,
    endDate: absence.endDate,
    halfDay: absence.halfDay,
  };
}

export function serializeAbsences(
  absences: readonly Absence[],
  viewer: SessionUser | undefined,
): (Absence | PublicAbsence)[] {
  return absences.map((absence) => serializeAbsence(absence, viewer));
}
