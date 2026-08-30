import { useEffect, useState } from 'react';
import type { DeepLinkParams } from '../types';

function parseSearch(search: string): DeepLinkParams {
  const params = new URLSearchParams(search);
  return {
    entity: params.get('entity') ?? undefined,
    brand: params.get('brand') ?? undefined,
    title: params.get('title') ?? undefined,
    price: params.get('price') ?? undefined,
  };
}

export function useDeepLink(onDeepLink: (params: DeepLinkParams) => void) {
  const [params, setParams] = useState<DeepLinkParams>(() =>
    parseSearch(window.location.search)
  );

  useEffect(() => {
    const handlePopState = () => {
      const next = parseSearch(window.location.search);
      setParams(next);
      if (next.entity || next.brand || next.title || next.price) {
        onDeepLink(next);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onDeepLink]);

  useEffect(() => {
    if (params.entity || params.brand || params.title || params.price) {
      onDeepLink(params);
    }
  }, []);

  return params;
}
