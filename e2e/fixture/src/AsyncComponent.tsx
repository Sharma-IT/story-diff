import { useEffect, useState } from 'react';

export const AsyncComponent = ({ delay = 1000 }: { delay?: number }) => {
  const [ready, setReady] = useState(false);


  useEffect(() => {
    const timer = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!ready) {
    return <div id="loading">Loading...</div>;
  }

  return (
    <div id="ready-element" style={{ padding: '20px', backgroundColor: '#d4edda' }}>
      Content Loaded!
    </div>
  );
};
