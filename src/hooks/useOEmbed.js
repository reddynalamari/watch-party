import { useState, useEffect } from 'react';
import { fetchOEmbed } from '../lib/utils';

export function useOEmbed(url) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    if (!url) return undefined;

    fetchOEmbed(url).then((result) => {
      if (!cancelled) setData(result);
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return data;
}
