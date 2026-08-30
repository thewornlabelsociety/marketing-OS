import { AlertCircle, Link2, Loader2, Plug, Unplug } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { IntegrationConnection, PublishingDestination } from '../../types';

function statusLabel(status: IntegrationConnection['status']): string {
  switch (status) {
    case 'CONNECTED': return 'Connected';
    case 'REAUTH_REQUIRED': return 'Needs reconnect';
    case 'ERROR': return 'Error';
    case 'DISCONNECTED': return 'Not connected';
    default: return status.replaceAll('_', ' ').toLowerCase();
  }
}

export default function IntegrationsPage() {
  const { activeEntity } = useApp();
  const workspaceId = activeEntity?.id ?? '';
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [destinations, setDestinations] = useState<PublishingDestination[]>([]);
  const [metaStatus, setMetaStatus] = useState<{ mockMode: boolean; configured: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metaConnection = connections.find((c) => c.providerKey === 'meta');

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [conns, dests, status] = await Promise.all([
        api.getIntegrations(workspaceId),
        api.getPublishingDestinations(workspaceId),
        api.getMetaIntegrationStatus(),
      ]);
      setConnections(conns);
      setDestinations(dests);
      setMetaStatus(status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function handleConnect() {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const { authUrl } = await api.connectMeta(workspaceId);
      window.location.href = authUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function handleDisconnect(connectionId: string) {
    if (!workspaceId) return;
    setBusy(true);
    try {
      await api.disconnectIntegration(connectionId, workspaceId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshDestinations(connectionId: string) {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const dests = await api.getIntegrationDestinations(connectionId, workspaceId);
      setDestinations((prev) => {
        const others = prev.filter((d) => d.connectionId !== connectionId);
        return [...others, ...dests];
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const metaDestinations = destinations.filter((d) => d.providerKey === 'meta');

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-lg font-semibold text-[#09090B]">Integrations</h1>
        <p className="mt-1 text-sm text-[#71717A]">Connect publishing platforms for approved content delivery and performance ingestion.</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[#71717A]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading integrations…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 text-sm text-[#71717A]">
          <AlertCircle className="mb-2 h-4 w-4 text-[#71717A]" />
          We couldn&apos;t load integrations. {error}
        </div>
      )}

      {!loading && (
        <section className="rounded-xl border border-[#E4E4E7] bg-white">
          <div className="flex items-start justify-between gap-4 border-b border-[#F4F4F5] px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E4E4E7] bg-[#FAFAFA]">
                <Plug className="h-4 w-4 text-[#09090B]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#09090B]">Meta</p>
                <p className="text-xs text-[#71717A]">Instagram + Facebook organic publishing</p>
                <p className="mt-1 text-xs text-[#A1A1AA]">
                  {metaStatus?.mockMode ? 'Local mock mode' : metaStatus?.configured ? 'App configured' : 'Server credentials not configured'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-[#A1A1AA]">
                {metaConnection ? statusLabel(metaConnection.status) : 'Not connected'}
              </p>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                {!metaConnection || metaConnection.status === 'DISCONNECTED' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleConnect()}
                    className="rounded-lg bg-[#09090B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18181B] disabled:opacity-50"
                  >
                    Connect
                  </button>
                ) : (
                  <>
                    {(metaConnection.status === 'REAUTH_REQUIRED' || metaConnection.status === 'ERROR') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleConnect()}
                        className="rounded-lg bg-[#09090B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18181B] disabled:opacity-50"
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDisconnect(metaConnection.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E4E4E7] px-3 py-1.5 text-xs font-medium text-[#09090B] hover:bg-[#FAFAFA] disabled:opacity-50"
                    >
                      <Unplug className="h-3 w-3" />
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {metaConnection?.status === 'CONNECTED' && (
            <div className="space-y-4 px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Destinations</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRefreshDestinations(metaConnection.id)}
                  className="text-xs font-medium text-[#09090B] hover:underline disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
              {metaDestinations.length === 0 ? (
                <p className="text-sm text-[#71717A]">No destinations discovered yet.</p>
              ) : (
                <div className="divide-y divide-[#F4F4F5] rounded-lg border border-[#E4E4E7]">
                  {metaDestinations.map((dest) => (
                    <div key={dest.id} className="flex items-center justify-between gap-3 px-3 py-3">
                      <div className="flex items-start gap-2">
                        <Link2 className="mt-0.5 h-4 w-4 text-[#71717A]" />
                        <div>
                          <p className="text-sm font-medium text-[#09090B]">{dest.displayName}</p>
                          <p className="text-xs text-[#71717A]">{dest.channel.replaceAll('_', ' ').toLowerCase()}</p>
                        </div>
                      </div>
                      <span className="text-xs text-[#71717A]">{dest.status.toLowerCase()}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-[#A1A1AA]">
                Supported in Phase 3J: Instagram feed image, Facebook page photo. Stories, Reels, carousels, and paid ads are not enabled.
              </p>
            </div>
          )}

          {!metaConnection && (
            <div className="px-4 py-4 text-sm text-[#71717A]">
              Connect Meta to publish approved creative to Instagram and Facebook and ingest provider performance evidence.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
