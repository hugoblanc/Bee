import { useEffect, useState } from 'preact/hooks';
import { HuntList } from './components/HuntList';
import { HuntView } from './components/HuntView';

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const m = /^#\/h\/([A-Za-z0-9_-]+)/.exec(hash);
  return m ? <HuntView key={m[1]} id={m[1]} /> : <HuntList />;
}
