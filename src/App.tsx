import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { EmployeesView } from './components/EmployeesView';
import { WorkAreasView } from './components/WorkAreasView';
import { SkillsView } from './components/SkillsView';
import { SettingsView } from './components/SettingsView';
import { RosterView } from './components/RosterView';
import { VacationView } from './components/VacationView';

function App() {
    const { activeView } = useStore();

    const renderView = () => {
        switch (activeView) {
            case 'dashboard':
                return <Dashboard />;
            case 'roster':
                return <RosterView />;
            case 'vacation':
                return <VacationView />;
            case 'employees':
                return <EmployeesView />;
            case 'workAreas':
                return <WorkAreasView />;
            case 'skills':
                return <SkillsView />;
            case 'settings':
                return <SettingsView />;
            default:
                return <Dashboard />;
        }
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 ml-64 p-8 overflow-hidden">
                <div className="h-full">
                    {renderView()}
                </div>
            </main>
        </div>
    );
}

export default App;
