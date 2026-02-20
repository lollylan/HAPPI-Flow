import { useStore } from '../store';
import { Users, MapPin, Award, AlertTriangle, Clock, Briefcase, Calendar, Heart, ThumbsUp } from 'lucide-react';
import { useAuth } from '../AuthContext';

function AdminDashboard() {
    const { employees, workAreas, skills, absences } = useStore();

    const activeEmployees = employees.filter(e => e.isActive);
    const criticalAreas = workAreas.filter(a => a.isCritical);
    const optionalAreas = workAreas.filter(a => !a.isCritical);

    // Helper to calculate exact used vacation days considering work days and weekends
    const calculateUsed = (employee: any) => {
        let used = 0;
        const empAbsences = absences.filter(a => a.employeeId === employee.id && a.type === 'vacation' && a.status === 'approved');

        empAbsences.forEach(absence => {
            let current = new Date(absence.startDate + "T12:00:00");
            const end = new Date(absence.endDate + "T12:00:00");

            while (current <= end) {
                const dayOfWeek = current.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    const dayMap: Record<number, string> = { 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday' };
                    const dayName = dayMap[dayOfWeek];
                    // @ts-ignore
                    if (dayName && employee.availability && employee.availability[dayName]?.isWorking) {
                        used += 1;
                    }
                }
                current.setDate(current.getDate() + 1);
            }
        });
        return used;
    };

    // Calculate safely relying on existing properties and absences
    const totalVacationDays = employees.reduce((s, e) => {
        const used = calculateUsed(e);
        const total = (e.vacationDaysTotal || 0) + (e.vacationDaysCarryover || 0);
        return s + (total - used);
    }, 0);

    const totalOvertime = employees.reduce((s, e) => s + (e.overtimeBalance || 0), 0);

    // Check for potential issues
    const warnings: string[] = [];
    criticalAreas.forEach(area => {
        const minRequired = area.minStaff || 1;
        const qualifiedCount = activeEmployees.filter(emp =>
            area.requiredSkills.length === 0 || area.requiredSkills.every(rs => emp.skills.includes(rs))
        ).length;
        if (qualifiedCount < minRequired) {
            warnings.push(`"${area.name}": Nur ${qualifiedCount} von ${minRequired} benötigten Mitarbeitern qualifiziert!`);
        }
    });

    if (activeEmployees.length === 0) {
        warnings.push('Keine aktiven Mitarbeiter vorhanden.');
    }

    const stats = [
        {
            label: 'Mitarbeiter',
            value: activeEmployees.length,
            sublabel: `${employees.length - activeEmployees.length} inaktiv`,
            icon: <Users size={20} />,
            gradient: 'from-primary-500 to-primary-600',
            glow: 'glow-blue',
        },
        {
            label: 'Arbeitsbereiche',
            value: workAreas.length,
            sublabel: `${criticalAreas.length} kritisch`,
            icon: <MapPin size={20} />,
            gradient: 'from-accent-500 to-accent-600',
            glow: 'glow-accent',
        },
        {
            label: 'Fähigkeiten',
            value: skills.length,
            sublabel: 'Qualifikationen',
            icon: <Award size={20} />,
            gradient: 'from-emerald-500 to-emerald-600',
            glow: 'glow-emerald',
        },
        {
            label: 'Resturlaub',
            value: `${totalVacationDays}T`,
            sublabel: 'Tage gesamt',
            icon: <Briefcase size={20} />,
            gradient: 'from-amber-500 to-amber-400',
            glow: '',
        },
    ];

    return (
        <div className="animate-fade-in">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-1">Dashboard</h2>
                <p className="text-slate-400 text-sm">Übersicht Ihrer Praxis-Ressourcen</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {stats.map((stat, i) => (
                    <div
                        key={stat.label}
                        className={`stat-card ${stat.glow}`}
                        style={{ animationDelay: `${i * 80}ms` }}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center text-white shadow-lg`}>
                                {stat.icon}
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-white mb-0.5">{stat.value}</div>
                        <div className="text-xs text-slate-400">{stat.label}</div>
                        <div className="text-[10px] text-slate-500 mt-1">{stat.sublabel}</div>
                    </div>
                ))}
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
                <div className="mb-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 animate-fade-in">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={18} className="text-rose-400" />
                        <span className="text-sm font-semibold text-rose-400">Warnungen ({warnings.length})</span>
                    </div>
                    <ul className="space-y-1.5">
                        {warnings.map((w, i) => (
                            <li key={i} className="text-sm text-rose-300/80 flex items-start gap-2">
                                <span className="text-rose-500 mt-0.5">•</span>
                                {w}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Quick Info Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Overtime Overview */}
                <div className="glass-card rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Clock size={16} className="text-primary-400" />
                        <h3 className="text-sm font-semibold text-white">Überstunden-Übersicht</h3>
                    </div>
                    {activeEmployees.length === 0 ? (
                        <p className="text-sm text-slate-500">Noch keine Mitarbeiter angelegt.</p>
                    ) : (
                        <div className="space-y-2">
                            {activeEmployees.slice(0, 5).map(emp => (
                                <div key={emp.id} className="flex items-center justify-between py-1.5">
                                    <span className="text-sm text-slate-300">{emp.firstName} {emp.lastName}</span>
                                    <span className={`text-sm font-medium ${emp.overtimeBalance > 0 ? 'text-amber-400' : emp.overtimeBalance < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                        {emp.overtimeBalance > 0 ? '+' : ''}{emp.overtimeBalance}h
                                    </span>
                                </div>
                            ))}
                            {activeEmployees.length > 5 && (
                                <p className="text-xs text-slate-500 pt-1">+ {activeEmployees.length - 5} weitere</p>
                            )}
                        </div>
                    )}
                    {activeEmployees.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                            <span className="text-xs text-slate-500">Gesamt</span>
                            <span className={`text-sm font-bold ${totalOvertime > 0 ? 'text-amber-400' : totalOvertime < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                {totalOvertime > 0 ? '+' : ''}{totalOvertime}h
                            </span>
                        </div>
                    )}
                </div>

                {/* Critical Areas Status */}
                <div className="glass-card rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle size={16} className="text-rose-400" />
                        <h3 className="text-sm font-semibold text-white">Kritische Bereiche</h3>
                    </div>
                    {criticalAreas.length === 0 ? (
                        <p className="text-sm text-slate-500">Keine kritischen Bereiche definiert.</p>
                    ) : (
                        <div className="space-y-3">
                            {criticalAreas.map(area => {
                                const minRequired = area.minStaff || 1;
                                const qualifiedCount = activeEmployees.filter(emp =>
                                    area.requiredSkills.length === 0 || area.requiredSkills.every(rs => emp.skills.includes(rs))
                                ).length;
                                const status = qualifiedCount >= minRequired * 2 ? 'good' : qualifiedCount >= minRequired ? 'warning' : 'danger';
                                return (
                                    <div key={area.id} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span>{area.icon}</span>
                                            <span className="text-sm text-slate-300">{area.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-medium ${status === 'good' ? 'text-emerald-400' :
                                                status === 'warning' ? 'text-amber-400' : 'text-rose-400'
                                                }`}>
                                                {qualifiedCount}/{minRequired} besetzt
                                            </span>
                                            <div className={`w-2 h-2 rounded-full ${status === 'good' ? 'bg-emerald-400' :
                                                status === 'warning' ? 'bg-amber-400' : 'bg-rose-400'
                                                }`} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Work Area Grid */}
            <div className="mt-6">
                <h3 className="text-sm font-semibold text-white mb-3">Alle Arbeitsbereiche</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {workAreas.map(area => (
                        <div
                            key={area.id}
                            className="glass-light rounded-xl p-4 text-center"
                            style={{ borderColor: `${area.color}30` }}
                        >
                            <div className="text-2xl mb-2">{area.icon}</div>
                            <div className="text-sm font-medium text-slate-200 mb-1">{area.name}</div>
                            <span className={area.isCritical ? 'badge badge-critical' : 'badge badge-optional'}>
                                {area.isCritical ? 'Kritisch' : 'Optional'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function EmployeeDashboard() {
    const { employees, absences } = useStore();
    const { employeeId } = useAuth();

    const me = employees.find(e => e.id === employeeId);
    if (!me) return null;

    // Calculate present employees today
    const today = new Date();
    const dayOfWeek = today.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayMap: Record<number, string> = { 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday' };
    const dayName = dayMap[dayOfWeek];

    const todayStr = today.toISOString().split('T')[0];

    const todayAbsences = absences.filter(a =>
        a.startDate <= todayStr &&
        a.endDate >= todayStr &&
        a.status === 'approved'
    );

    const presentEmployees = employees.filter(emp => {
        if (!emp.isActive) return false;

        // Are they absent today?
        const isAbsent = todayAbsences.some(a => a.employeeId === emp.id);
        if (isAbsent) return false;

        // Are they scheduled to work today? (based on availability)
        if (!isWeekend && dayName) {
            // @ts-ignore
            if (emp.availability && emp.availability[dayName] && emp.availability[dayName].isWorking) {
                return true;
            }
        }
        return false;
    });

    // Helper calculate used vacation exactly
    const calculateUsed = (employee: any) => {
        let used = 0;
        const empAbsences = absences.filter(a => a.employeeId === employee.id && a.type === 'vacation' && a.status === 'approved');

        empAbsences.forEach(absence => {
            let current = new Date(absence.startDate + "T12:00:00");
            const end = new Date(absence.endDate + "T12:00:00");

            while (current <= end) {
                const day = current.getDay();
                if (day !== 0 && day !== 6) {
                    const dMap: Record<number, string> = { 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday' };
                    const dName = dMap[day];
                    // @ts-ignore
                    if (dName && employee.availability && employee.availability[dName]?.isWorking) {
                        used += 1;
                    }
                }
                current.setDate(current.getDate() + 1);
            }
        });
        return used;
    };

    // calculate illness days this year (simplified, just counting approved 'sick' days)
    const currentYear = today.getFullYear();
    const sickDays = absences.filter(a => a.employeeId === me.id && a.type === 'sick' && a.status === 'approved' && new Date(a.startDate).getFullYear() === currentYear).reduce((acc, absence) => {
        let used = 0;
        let current = new Date(absence.startDate + "T12:00:00");
        const end = new Date(absence.endDate + "T12:00:00");
        while (current <= end) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) used += 1;
            current.setDate(current.getDate() + 1);
        }
        return acc + used;
    }, 0);

    const totalVacation = (me.vacationDaysTotal || 0) + (me.vacationDaysCarryover || 0);
    const usedVacation = calculateUsed(me);
    const remainingVacation = totalVacation - usedVacation;

    return (
        <div className="animate-fade-in">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-1">Hallo {me.firstName},</h2>
                <p className="text-slate-400 text-sm">hier ist deine Übersicht für heute.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="stat-card">
                    <div className="flex items-start justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg`}>
                            <Users size={20} />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-white mb-0.5">{presentEmployees.length}</div>
                    <div className="text-xs text-slate-400">Kollegen heute da</div>
                </div>

                <div className="stat-card">
                    <div className="flex items-start justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${me.overtimeBalance < 0 ? 'from-rose-500 to-rose-600' : 'from-amber-500 to-amber-600'} flex items-center justify-center text-white shadow-lg`}>
                            <Clock size={20} />
                        </div>
                    </div>
                    <div className={`text-2xl font-bold mb-0.5 ${me.overtimeBalance < 0 ? 'text-rose-400' : 'text-amber-400'}`}>
                        {me.overtimeBalance > 0 ? '+' : ''}{me.overtimeBalance}h
                    </div>
                    <div className="text-xs text-slate-400">Überstundenkonto</div>
                </div>

                <div className="stat-card">
                    <div className="flex items-start justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white shadow-lg`}>
                            <Calendar size={20} />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-white mb-0.5">{remainingVacation} <span className="text-sm font-normal text-slate-400">/ {totalVacation}</span></div>
                    <div className="text-xs text-slate-400">Resturlaub</div>
                    <div className="text-[10px] text-slate-500 mt-1">{usedVacation} bereits verplant</div>
                </div>

                <div className="stat-card">
                    <div className="flex items-start justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center text-white shadow-lg`}>
                            <Heart size={20} />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-white mb-0.5">{sickDays}T</div>
                    <div className="text-xs text-slate-400">Krankheitstage (Jahr)</div>
                </div>
            </div>

            <div className="glass-card rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <ThumbsUp size={16} className="text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">Heute im Dienst ({presentEmployees.length})</h3>
                </div>
                {presentEmployees.length === 0 ? (
                    <p className="text-sm text-slate-500">Niemand da heute.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {presentEmployees.map(emp => (
                            <div key={emp.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold text-xs uppercase border border-slate-700">
                                    {emp.firstName[0]}{emp.lastName[0]}
                                </div>
                                <span className="text-sm font-medium text-slate-200">{emp.firstName} {emp.lastName}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function Dashboard() {
    const { role } = useAuth();
    if (role === 'employee') return <EmployeeDashboard />;
    return <AdminDashboard />;
}
