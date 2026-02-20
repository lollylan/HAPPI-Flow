import { useState, useRef, useEffect } from 'react';
import { Lock, LogIn } from 'lucide-react';

import { Employee } from '../types';

interface Props {
    adminPasswordHash: string;
    employees: Employee[];
    onLogin: (role: 'admin' | 'employee', employeeId?: string) => void;
}

export async function hashPassword(msg: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(msg);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hash));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

export function LoginScreen({ adminPasswordHash, employees, onLogin }: Props) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const inputHash = await hashPassword(password);

        if (username.toLowerCase() === 'admin') {
            if (inputHash === adminPasswordHash) {
                setError(false);
                onLogin('admin');
            } else {
                showError();
            }
        } else {
            const employee = employees.find(emp => emp.username && emp.username.toLowerCase() === username.toLowerCase());
            if (employee && employee.passwordHash && employee.passwordHash === inputHash) {
                setError(false);
                onLogin('employee', employee.id);
            } else {
                showError();
            }
        }
    };

    const showError = () => {
        setError(true);
        setPassword('');
        inputRef.current?.focus();
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700/50 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 to-accent-500"></div>

                <div className="mb-8 text-center">
                    <div className="w-16 h-16 bg-slate-900/50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-700/50 shadow-inner">
                        <Lock className="text-accent-400" size={32} />
                    </div>
                    <h2 className="text-2xl font-black tracking-tight text-white mb-1">HÄPPI-Flow</h2>
                    <p className="text-slate-400 text-sm">Bitte melden Sie sich an</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            ref={inputRef}
                            type="text"
                            value={username}
                            onChange={(e) => {
                                setUsername(e.target.value);
                                setError(false);
                            }}
                            placeholder="Benutzername"
                            className={`w-full bg-slate-900/50 border ${error ? 'border-rose-500/50 focus:border-rose-500' : 'border-slate-700 focus:border-primary-500'} rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all mb-3`}
                        />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setError(false);
                            }}
                            placeholder="Passwort"
                            className={`w-full bg-slate-900/50 border ${error ? 'border-rose-500/50 focus:border-rose-500' : 'border-slate-700 focus:border-primary-500'} rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all`}
                        />
                        {error && (
                            <div className="text-rose-400 text-xs mt-2 text-center animate-fade-in">
                                Benutzername oder Passwort falsch.
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="w-full btn-primary py-3 rounded-xl flex justify-center items-center gap-2 group mt-2"
                        disabled={!password || !username}
                    >
                        <span>Anmelden</span>
                        <LogIn size={18} className="transition-transform group-hover:translate-x-1" />
                    </button>
                </form>
            </div>
        </div>
    );
}
