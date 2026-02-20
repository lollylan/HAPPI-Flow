import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { store } from '../store';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    private handleReset = () => {
        // Hard reset of the store
        if (confirm("Dies wird alle gespeicherten Daten (Cache) dieser Seite löschen und zwingt sie, frische Daten vom Server zu holen. Fortfahren?")) {
            store.resetAll();
            window.location.reload();
        }
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-rose-500/50 rounded-2xl p-8 max-w-2xl w-full shadow-2xl">
                        <div className="flex items-center gap-4 text-rose-400 mb-6">
                            <AlertTriangle size={48} />
                            <h1 className="text-2xl font-bold text-white">Ein unerwarteter Fehler ist aufgetreten</h1>
                        </div>

                        <p className="text-slate-300 mb-6">
                            Das Programm konnte einen Zustand nicht verarbeiten. Möglicherweise befinden sich fehlerhafte oder alte Daten im Cache.
                        </p>

                        <div className="bg-slate-900 rounded-lg p-4 mb-8 overflow-auto max-h-60 text-xs font-mono text-slate-400 border border-slate-700">
                            <div className="font-bold text-rose-400 mb-2">{this.state.error && this.state.error.toString()}</div>
                            <div>{this.state.errorInfo && this.state.errorInfo.componentStack}</div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={this.handleReset}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={18} /> Cache leeren & neu laden
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="btn-secondary flex-1"
                            >
                                Seite normal neuladen
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
