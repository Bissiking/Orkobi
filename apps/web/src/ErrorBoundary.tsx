import { Component } from 'react';
import type { ReactNode } from 'react';
import { en, fr } from './i18n';

export default class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const t = document.documentElement.lang === 'en' ? en : fr;
    return (
      <main className="fatal-error">
        <h1>{t.appError}</h1>
        <button className="button primary" onClick={() => window.location.reload()}>
          {t.reload}
        </button>
      </main>
    );
  }
}
