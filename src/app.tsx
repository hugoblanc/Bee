import { useEffect, useState } from 'preact/hooks';
import { HuntList } from './components/HuntList';
import { HuntView } from './components/HuntView';
import { NewHunt } from './components/NewHunt';
import { Guide } from './components/Guide';
import { ProfilePage } from './components/ProfilePage';
import { needsOnboarding } from './profile';

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [welcome, setWelcome] = useState(needsOnboarding);
  if (welcome) return <ProfilePage welcome onDone={() => setWelcome(false)} />;
  if (hash.startsWith('#/profil')) return <ProfilePage welcome={false} onDone={() => (location.hash = '#/')} />;
  const m = /^#\/h\/([A-Za-z0-9_-]+)/.exec(hash);
  if (m) return <HuntView key={m[1]} id={m[1]} />;
  if (hash.startsWith('#/nouveau')) return <NewHunt />;
  if (hash.startsWith('#/guide')) return <Guide />;
  return <HuntList />;
}
