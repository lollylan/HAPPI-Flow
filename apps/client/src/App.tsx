import { Loader2, WifiOff } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession, useSetupStatus } from './api/queries';
import { AppShell } from './components/AppShell';
import { ChangePasswordScreen } from './components/ChangePasswordScreen';
import { LoginScreen } from './components/LoginScreen';
import { SetupScreen } from './components/SetupScreen';
import { AbsencesView } from './views/AbsencesView';
import { AreasView } from './views/AreasView';
import { DashboardView } from './views/DashboardView';
import { EmployeesView } from './views/EmployeesView';
import { MatrixView } from './views/MatrixView';
import { PrintEmployeePlan, PrintWeekPlan } from './views/PrintViews';
import { RosterView } from './views/RosterView';
import { SettingsView } from './views/SettingsView';
import { TemplateView } from './views/TemplateView';
import { TimeModelView } from './views/TimeModelView';

export default function App() {
  const { data: needsSetup, isLoading: checkingSetup } = useSetupStatus();
  const { data: user, isLoading, error } = useSession();

  if (checkingSetup || isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <WifiOff className="size-8 text-slate-400" />
        <p className="font-medium">Der Server ist nicht erreichbar.</p>
        <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Läuft HÄPPI-Flow auf dem Praxis-Rechner? Ohne den Server kann diese Seite keine Daten
          anzeigen.
        </p>
      </div>
    );
  }

  // Vor dem ersten Konto fuehrt die Einrichtung - ein Anmeldebildschirm
  // waere hier eine Sackgasse.
  if (needsSetup && !user) {
    return <SetupScreen />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  // Der erzwungene Wechsel des Startpassworts laesst sich nicht umgehen -
  // es gibt in diesem Zustand keine andere Route.
  if (user.mustChangePassword) {
    return <ChangePasswordScreen />;
  }

  return (
    <Routes>
      {/* Druckansichten laufen ohne Navigation und Seitenrahmen. */}
      <Route path="/druck/woche" element={<PrintWeekPlan />} />
      <Route path="/druck/person/:employeeId" element={<PrintEmployeePlan />} />

      <Route element={<AppShell user={user} />}>
        <Route index element={<DashboardView user={user} />} />
        <Route path="mitarbeiter" element={<EmployeesView user={user} />} />
        <Route path="dienstplan" element={<RosterView user={user} />} />
        <Route path="abwesenheiten" element={<AbsencesView user={user} />} />
        {user.role === 'admin' && (
          <>
            <Route path="musterwoche" element={<TemplateView />} />
            <Route path="matrix" element={<MatrixView />} />
            <Route path="bereiche" element={<AreasView />} />
            <Route path="zeitmodell" element={<TimeModelView />} />
            <Route path="einstellungen" element={<SettingsView />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
