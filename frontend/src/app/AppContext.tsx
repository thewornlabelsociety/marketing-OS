import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../services/api';
import { useDeepLink } from '../hooks/useDeepLink';
import type { AppTab, DropDraft, Entity, StudioLibraryItem } from '../types';

export interface RecommendationSeed {
  recommendationId: string;
  recommendationType: string;
  sourceProductIds: string[];
  contentType: string | null;
  title: string;
  hook: string | null;
  angle: string | null;
  cta: string | null;
  talkingPoints: string[] | null;
}

interface AppContextValue {
  entities: Entity[];
  activeEntity: Entity | null;
  setActiveEntityId: (id: string) => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  activeCampaignId: string | null;
  setActiveCampaignId: (id: string | null) => void;
  brandKitOpen: boolean;
  setBrandKitOpen: (open: boolean) => void;
  dropDraft: DropDraft;
  updateDropDraft: (patch: Partial<DropDraft>) => void;
  refreshEntities: () => Promise<void>;
  loading: boolean;
  error: string | null;
  selectedSourceProductIds: string[];
  setSelectedSourceProductIds: (ids: string[]) => void;
  studioReturnTarget: StudioLibraryItem | null;
  setStudioReturnTarget: (target: StudioLibraryItem | null) => void;
  studioKey: number;
  newStudioSession: () => void;
  recommendationSeed: RecommendationSeed | null;
  setRecommendationSeed: (seed: RecommendationSeed | null) => void;
  launchFromRecommendation: (seed: RecommendationSeed) => void;
  repurposeSourceArtifactId: string | null;
  setRepurposeSourceArtifactId: (id: string | null) => void;
  studioWholeSetResult: unknown | null;
  setStudioWholeSetResult: (r: unknown | null) => void;
}

const defaultDraft: DropDraft = {
  brand: '',
  title: '',
  price: '',
  body: '',
  hook: '',
  scheduledFor: '',
  targetChannels: ['instagram', 'email'],
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [activeEntityId, setActiveEntityId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [brandKitOpen, setBrandKitOpen] = useState(false);
  const [dropDraft, setDropDraft] = useState<DropDraft>(defaultDraft);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSourceProductIds, setSelectedSourceProductIds] = useState<string[]>([]);
  const [studioReturnTarget, setStudioReturnTarget] = useState<StudioLibraryItem | null>(null);
  const [studioKey, setStudioKey] = useState(0);
  const [recommendationSeed, setRecommendationSeed] = useState<RecommendationSeed | null>(null);
  const [repurposeSourceArtifactId, setRepurposeSourceArtifactId] = useState<string | null>(null);
  const [studioWholeSetResult, setStudioWholeSetResult] = useState<unknown | null>(null);

  const newStudioSession = useCallback(() => {
    setSelectedSourceProductIds([]);
    setStudioReturnTarget(null);
    setRecommendationSeed(null);
    setStudioWholeSetResult(null);
    setStudioKey((k) => k + 1);
    setActiveTab('operator-studio');
  }, []);

  const launchFromRecommendation = useCallback((seed: RecommendationSeed) => {
    setSelectedSourceProductIds(seed.sourceProductIds);
    setRecommendationSeed(seed);
    setStudioReturnTarget(null);
    setStudioKey((k) => k + 1);
    setActiveTab('operator-studio');
  }, []);

  const refreshEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getEntities();
      setEntities(data);
      setActiveEntityId((current) => {
        if (current && data.some((e) => e.id === current)) return current;
        const wornLabel = data.find((e) => e.name.trim().toLowerCase() === 'worn label');
        const credible = data.find((e) => !/^(ws_|workspace [ab]$|empty workspace|test |brand ws$|[ab]$)/i.test(e.name.trim()));
        return wornLabel?.id ?? credible?.id ?? data[0]?.id ?? '';
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshEntities();
  }, [refreshEntities]);

  const [pendingDeepLink, setPendingDeepLink] = useState<{
    entity?: string;
    brand?: string;
    title?: string;
    price?: string;
  } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const entity = params.get('entity') ?? undefined;
    const brand = params.get('brand') ?? undefined;
    const title = params.get('title') ?? undefined;
    const price = params.get('price') ?? undefined;
    return entity || brand || title || price ? { entity, brand, title, price } : null;
  });

  const applyDeepLink = useCallback(
    (params: { entity?: string; brand?: string; title?: string; price?: string }) => {
      setActiveTab('create');
      if (params.entity && entities.length > 0) {
        const match = entities.find(
          (e) => e.slug === params.entity || e.id === params.entity
        );
        if (match) setActiveEntityId(match.id);
      }
      setDropDraft((prev) => ({
        ...prev,
        brand: params.brand ?? prev.brand,
        title: params.title ?? prev.title,
        price: params.price ?? prev.price,
      }));
    },
    [entities]
  );

  useDeepLink((params) => {
    setPendingDeepLink(params);
    applyDeepLink(params);
  });

  useEffect(() => {
    if (pendingDeepLink && entities.length > 0) {
      applyDeepLink(pendingDeepLink);
    }
  }, [pendingDeepLink, entities, applyDeepLink]);

  const activeEntity = useMemo(
    () => entities.find((e) => e.id === activeEntityId) ?? null,
    [entities, activeEntityId]
  );

  useEffect(() => {
    if (activeEntity && !dropDraft.brand) {
      setDropDraft((prev) => ({ ...prev, brand: activeEntity.name }));
    }
  }, [activeEntity, dropDraft.brand]);

  const updateDropDraft = useCallback((patch: Partial<DropDraft>) => {
    setDropDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const value: AppContextValue = {
    entities,
    activeEntity,
    setActiveEntityId,
    activeTab,
    setActiveTab,
    activeCampaignId,
    setActiveCampaignId,
    brandKitOpen,
    setBrandKitOpen,
    dropDraft,
    updateDropDraft,
    refreshEntities,
    loading,
    error,
    selectedSourceProductIds,
    setSelectedSourceProductIds,
    studioReturnTarget,
    setStudioReturnTarget,
    studioKey,
    newStudioSession,
    recommendationSeed,
    setRecommendationSeed,
    launchFromRecommendation,
    repurposeSourceArtifactId,
    setRepurposeSourceArtifactId,
    studioWholeSetResult,
    setStudioWholeSetResult,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
