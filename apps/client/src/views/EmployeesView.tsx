import { useState } from 'react';
import {
  AlertCircle,
  Home,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Stethoscope,
  UserMinus,
} from 'lucide-react';
import {
  STAFF_TYPE_LABELS,
  contractedHoursPerWeek,
  formatHHMM,
  fullName,
  roundHours,
} from '@haeppi/shared';
import type { Employee, PracticeWeekday, SessionUser } from '@haeppi/shared';
import { PRACTICE_WEEKDAYS, WEEKDAY_SHORT } from '@haeppi/shared';
import { useDeactivateEmployee, useEmployees, useSkills } from '../api/queries';
import { Button, PageHeader } from '../components/ui';
import { EmployeeEditor } from './EmployeeEditor';

export function EmployeesView({ user }: { user: SessionUser }) {
  const isAdmin = user.role === 'admin';
  const [editing, setEditing] = useState<Employee | null | undefined>(undefined);

  const { data: employees, isLoading, error } = useEmployees();
  const { data: skills } = useSkills();
  const deactivate = useDeactivateEmployee();

  if (isLoading) {
    return (
      <Page>
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Lade Mitarbeiter …
        </div>
      </Page>
    );
  }

  if (error) {
    return (
      <Page>
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-red-700 dark:bg-red-950/50 dark:text-red-300">
          <AlertCircle className="size-4" />
          Die Mitarbeiterliste konnte nicht geladen werden.
        </div>
      </Page>
    );
  }

  const addButton = isAdmin ? (
    <Button variant="primary" onClick={() => setEditing(null)}>
      <Plus className="size-4" /> Person anlegen
    </Button>
  ) : undefined;

  const editor =
    editing !== undefined && isAdmin ? (
      <EmployeeEditor
        employee={editing}
        skills={skills ?? []}
        onClose={() => setEditing(undefined)}
      />
    ) : null;

  if (!employees || employees.length === 0) {
    return (
      <Page action={addButton}>
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <p className="font-medium">Noch keine Mitarbeiter angelegt</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isAdmin
              ? 'Lege die erste Person an – danach kannst du in der Einsatz-Matrix festlegen, wer wo arbeiten darf.'
              : 'Die Praxisleitung hat noch niemanden eingetragen.'}
          </p>
        </div>
        {editor}
      </Page>
    );
  }

  return (
    <Page count={employees.length} action={addButton}>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Rolle</th>
              {PRACTICE_WEEKDAYS.map((day) => (
                <th key={day} className="px-2 py-3 text-center font-medium">
                  {WEEKDAY_SHORT[day]}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Std./Woche</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {employees.map((employee) => (
              <EmployeeRow
                key={employee.id}
                employee={employee}
                isAdmin={isAdmin}
                onEdit={() => setEditing(employee)}
                onDeactivate={() => {
                  if (
                    window.confirm(
                      `${fullName(employee)} aus der Planung nehmen?\n\n` +
                        `Der Datensatz bleibt mit der gesamten Historie erhalten und kann jederzeit wieder aktiviert werden.`,
                    )
                  ) {
                    deactivate.mutate(employee.id);
                  }
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
      {editor}
    </Page>
  );
}

function EmployeeRow({
  employee,
  isAdmin,
  onEdit,
  onDeactivate,
}: {
  employee: Employee;
  isAdmin: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const contracted = roundHours(contractedHoursPerWeek(employee.workTimes));
  // Weicht die gerechnete Zeit vom Vertrag ab, ist das ein Pflegefehler in
  // den Stammdaten - besser hier sichtbar als spaeter im Dienstplan.
  const deviates = Math.abs(contracted - employee.targetHoursPerWeek) > 0.25;

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: employee.color }}
          />
          <span className="font-medium">{fullName(employee)}</span>
          {employee.isPcm && (
            <span
              title="Primary Care Managerin – hält eigene Sprechstunde"
              className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300"
            >
              <Stethoscope className="size-3" /> PCM
            </span>
          )}
          {employee.canHomeoffice && (
            <Home className="size-3.5 text-emerald-600" aria-label="Homeoffice möglich" />
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
        {STAFF_TYPE_LABELS[employee.staffType]}
      </td>
      {PRACTICE_WEEKDAYS.map((day) => (
        <DayCell key={day} employee={employee} day={day} />
      ))}
      <td className="tabular px-4 py-3 text-right">
        <span className={deviates ? 'text-amber-600 dark:text-amber-400' : ''}>
          {contracted.toLocaleString('de-DE')} h
        </span>
        {deviates && (
          <span
            className="ml-1 text-xs text-slate-400"
            title={`Vertraglich hinterlegt: ${employee.targetHoursPerWeek} h`}
          >
            ({employee.targetHoursPerWeek})
          </span>
        )}
      </td>
      {isAdmin && (
        <td className="px-4 py-3">
          <div className="flex justify-end gap-1">
            <a
              href={`/druck/person/${employee.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="Persönlichen Wochenplan drucken"
            >
              <Printer className="size-4" />
            </a>
            <button
              onClick={onEdit}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="Bearbeiten"
            >
              <Pencil className="size-4" />
            </button>
            <button
              onClick={onDeactivate}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
              title="Aus der Planung nehmen"
            >
              <UserMinus className="size-4" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

function DayCell({ employee, day }: { employee: Employee; day: PracticeWeekday }) {
  const work = employee.workTimes[day];
  if (!work.isWorking) {
    return <td className="px-2 py-3 text-center text-slate-300 dark:text-slate-700">–</td>;
  }
  return (
    <td className="tabular px-2 py-3 text-center text-xs whitespace-nowrap text-slate-600 dark:text-slate-400">
      {formatHHMM(work.startMin)}–{formatHHMM(work.endMin)}
    </td>
  );
}

function Page({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="p-8">
      <PageHeader
        title="Mitarbeiter"
        subtitle={count === undefined ? 'Team der Praxis' : `${count} aktive Personen`}
        {...(action ? { action } : {})}
      />
      {children}
    </div>
  );
}
