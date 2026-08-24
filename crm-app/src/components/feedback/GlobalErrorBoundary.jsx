import { Component } from 'react';

export default class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Unhandled UI error', error instanceof Error ? error.message : 'unknown');
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-app px-4 text-cream">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-card p-8 text-center shadow-premium">
          <p className="text-2xl font-bold">Algo salió mal.</p>
          <button
            className="button-primary mt-6 rounded-xl px-5 py-3 font-bold"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </section>
      </main>
    );
  }
}
