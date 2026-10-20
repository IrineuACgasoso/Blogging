import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { UiCtx, type Popup } from '../ui';
import Sidebar from './Sidebar';
import { AccountPopup, LoginPopup } from './Popups';

export default function Layout() {
  const [popup, setPopup] = useState<Popup>(null);
  const [sidebar, setSidebar] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setPopup(null); setSidebar(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPopup(null); setSidebar(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <UiCtx.Provider value={{ setPopup, openSidebar: () => setSidebar(true) }}>
      <header className="topbar">
        <button className="icon-btn" aria-label="Abrir menu" onClick={() => setSidebar(true)}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button className="icon-btn" aria-label="Minha conta" onClick={() => setPopup(popup === 'account' ? null : 'account')}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </svg>
        </button>
      </header>
      <main className="page"><Outlet /></main>
      <Sidebar open={sidebar} onClose={() => setSidebar(false)} />
      {popup === 'account' && <AccountPopup onClose={() => setPopup(null)} onLogin={() => setPopup('login')} />}
      {popup === 'login' && <LoginPopup onClose={() => setPopup(null)} />}
    </UiCtx.Provider>
  );
}
