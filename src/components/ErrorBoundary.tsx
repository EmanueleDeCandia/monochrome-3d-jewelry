import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a WebGL/runtime failure from blanking the whole page and gives the
 * user something actionable instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-screen h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center">
          <h1 className="text-lg font-serif-luxury tracking-[0.25em] uppercase">
            Maison William
          </h1>
          <p className="text-[11px] font-mono-cad text-zinc-400 mt-4 max-w-md leading-relaxed">
            Si è verificato un errore durante il rendering della scena 3D.
          </p>
          <pre className="mt-4 max-w-lg overflow-x-auto text-[10px] font-mono-cad text-zinc-500 border border-white/15 p-3">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-white text-black text-[11px] font-mono-cad uppercase font-semibold"
          >
            Ricarica
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
