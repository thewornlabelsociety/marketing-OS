import axios from 'axios';
import {
  META_GRAPH_API_VERSION,
  META_PUBLISH_CAPABILITIES,
  type ProviderDestinationDiscovery,
} from '../../types/integrations';

export interface MetaTokenResponse {
  accessToken: string;
  expiresIn?: number;
}

export interface MetaPublishInput {
  destinationExternalId: string;
  channel: 'INSTAGRAM' | 'FACEBOOK';
  caption: string;
  imageUrl: string;
  idempotencyKey: string;
  /** Workspace-resolved page access token from CredentialVault. Required in production; ignored in mock mode. */
  accessToken: string;
}

export interface MetaPublishOutput {
  externalPublishId: string;
  externalUrl?: string;
  publishedAt: string;
}

export interface MetaPerformanceInput {
  externalPublishId: string;
  channel: 'INSTAGRAM' | 'FACEBOOK';
  measurementWindow: string;
  /** Workspace-resolved page access token from CredentialVault. Ignored in mock mode. Performance callers will add credential resolution in a follow-up. */
  accessToken?: string;
}

export interface MetaPerformanceOutput {
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  views?: number | null;
  engagement?: number | null;
  observedAt: string;
}

/** Deterministic in-memory state for tests and local mock mode. */
export const metaMockState = {
  connections: new Map<string, { accessToken: string; expired: boolean }>(),
  destinations: new Map<string, ProviderDestinationDiscovery[]>(),
  publications: new Map<string, MetaPublishOutput>(),
  idempotencyIndex: new Map<string, string>(),
  performance: new Map<string, MetaPerformanceOutput>(),
  shouldFail: false,
  failureCode: 'PROVIDER_REJECTED',
  failureMessage: 'Mock Meta publish rejected',
  unknownOutcome: false,
  authExpired: false,
};

export function resetMetaMockState(): void {
  metaMockState.connections.clear();
  metaMockState.destinations.clear();
  metaMockState.publications.clear();
  metaMockState.idempotencyIndex.clear();
  metaMockState.performance.clear();
  metaMockState.shouldFail = false;
  metaMockState.failureCode = 'PROVIDER_REJECTED';
  metaMockState.failureMessage = 'Mock Meta publish rejected';
  metaMockState.unknownOutcome = false;
  metaMockState.authExpired = false;
}

export function isMetaMockMode(): boolean {
  return process.env.META_MOCK_MODE === '1'
    || !process.env.META_APP_ID
    || !process.env.META_APP_SECRET;
}

export class MetaGraphClient {
  private readonly graphBase = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<MetaTokenResponse> {
    if (isMetaMockMode()) {
      return { accessToken: `mock_meta_token_${code}`, expiresIn: 3600 };
    }
    const appId = process.env.META_APP_ID!;
    const appSecret = process.env.META_APP_SECRET!;
    const res = await axios.get(`${this.graphBase}/oauth/access_token`, {
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      },
    });
    return {
      accessToken: res.data.access_token as string,
      expiresIn: res.data.expires_in as number | undefined,
    };
  }

  /**
   * Exchanges a short-lived user access token (~2h) for a long-lived one (~60 days).
   * Must be called immediately after exchangeCodeForToken before storing anything.
   * Long-lived tokens are required for reliable production publishing and performance reads.
   */
  async exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
    if (isMetaMockMode()) {
      return {
        accessToken: `mock_long_lived_${shortLivedToken.slice(-12)}`,
        expiresIn: 60 * 24 * 60 * 60, // 60 days
      };
    }
    const appId = process.env.META_APP_ID!;
    const appSecret = process.env.META_APP_SECRET!;
    const res = await axios.get(`${this.graphBase}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    return {
      accessToken: res.data.access_token as string,
      expiresIn: res.data.expires_in as number | undefined,
    };
  }

  async discoverDestinations(accessToken: string): Promise<ProviderDestinationDiscovery[]> {
    if (isMetaMockMode()) {
      const stored = metaMockState.destinations.get(accessToken);
      if (stored) return stored;
      return [
        {
          externalDestinationId: `ig_${accessToken.slice(-8)}`,
          displayName: 'Instagram @testaccount',
          channel: 'INSTAGRAM',
          capabilities: ['publish_image_feed', 'read_performance'],
        },
        {
          externalDestinationId: `fb_${accessToken.slice(-8)}`,
          displayName: 'Facebook Test Page',
          channel: 'FACEBOOK',
          capabilities: ['publish_facebook_page_photo', 'read_performance'],
        },
      ];
    }

    const pagesRes = await axios.get(`${this.graphBase}/me/accounts`, {
      params: {
        access_token: accessToken,
        fields: 'id,name,instagram_business_account{id,username}',
      },
    });
    const pages = (pagesRes.data.data ?? []) as Array<{
      id: string;
      name: string;
      instagram_business_account?: { id: string; username?: string };
    }>;

    const destinations: ProviderDestinationDiscovery[] = [];
    for (const page of pages) {
      destinations.push({
        externalDestinationId: page.id,
        displayName: page.name,
        channel: 'FACEBOOK',
        capabilities: ['publish_facebook_page_photo', 'read_performance'],
      });
      if (page.instagram_business_account?.id) {
        destinations.push({
          externalDestinationId: page.instagram_business_account.id,
          displayName: `Instagram @${page.instagram_business_account.username ?? page.instagram_business_account.id}`,
          channel: 'INSTAGRAM',
          capabilities: ['publish_image_feed', 'read_performance'],
        });
      }
    }
    return destinations;
  }

  async publishImage(input: MetaPublishInput): Promise<MetaPublishOutput> {
    if (isMetaMockMode()) {
      if (metaMockState.authExpired) {
        throw Object.assign(new Error('Token expired'), { code: 'AUTH_EXPIRED' });
      }
      if (metaMockState.unknownOutcome) {
        throw Object.assign(new Error('Network dropped after provider received request'), { code: 'UNKNOWN_RESULT' });
      }
      const existing = metaMockState.idempotencyIndex.get(input.idempotencyKey);
      if (existing) {
        const pub = metaMockState.publications.get(existing);
        if (pub) return pub;
      }
      if (metaMockState.shouldFail) {
        throw Object.assign(new Error(metaMockState.failureMessage), { code: metaMockState.failureCode });
      }
      const externalPublishId = `meta_${input.channel.toLowerCase()}_${input.idempotencyKey.slice(0, 12)}`;
      const output: MetaPublishOutput = {
        externalPublishId,
        externalUrl: `https://www.facebook.com/${externalPublishId}`,
        publishedAt: new Date().toISOString(),
      };
      metaMockState.idempotencyIndex.set(input.idempotencyKey, externalPublishId);
      metaMockState.publications.set(externalPublishId, output);
      return output;
    }

    if (input.channel === 'INSTAGRAM') {
      // Phase A: create container and poll until FINISHED.
      // Any failure here is safe to treat as FAILED — media_publish has not been sent.
      const containerRes = await axios.post(`${this.graphBase}/${input.destinationExternalId}/media`, null, {
        params: {
          image_url: input.imageUrl,
          caption: input.caption,
          access_token: input.accessToken,
        },
      });
      const creationId = containerRes.data.id as string;
      let status = 'IN_PROGRESS';
      for (let i = 0; i < 10 && status !== 'FINISHED'; i += 1) {
        await new Promise((r) => setTimeout(r, 1000));
        const statusRes = await axios.get(`${this.graphBase}/${creationId}`, {
          params: { fields: 'status_code', access_token: input.accessToken },
        });
        status = statusRes.data.status_code as string;
        if (status === 'ERROR') throw new Error('Instagram media container failed');
      }

      // Phase B: send media_publish.
      // Once this request is dispatched, any transport failure is ambiguous —
      // Instagram may have accepted and published the post before the connection dropped.
      // A 4xx response is a definitive rejection (post was not created); everything
      // else must become UNKNOWN_RESULT to prevent blind retries that duplicate posts.
      let publishRes: { data: { id: string } };
      try {
        publishRes = await axios.post(`${this.graphBase}/${input.destinationExternalId}/media_publish`, null, {
          params: {
            creation_id: creationId,
            access_token: input.accessToken,
          },
        }) as { data: { id: string } };
      } catch (err) {
        const httpStatus = (err as { response?: { status?: number } }).response?.status;
        if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
          // Meta explicitly rejected the publish request — post was not created.
          throw err;
        }
        // Transport error, timeout, or 5xx: outcome is unknown.
        throw Object.assign(
          new Error('Unknown outcome after media_publish — post may exist on Instagram'),
          { code: 'UNKNOWN_RESULT', cause: err },
        );
      }
      const externalPublishId = publishRes.data.id;
      return {
        externalPublishId,
        externalUrl: `https://www.instagram.com/p/${externalPublishId}`,
        publishedAt: new Date().toISOString(),
      };
    }

    // Facebook: single-call publish. Same ambiguity boundary applies.
    let fbRes: { data: { id: string } };
    try {
      fbRes = await axios.post(`${this.graphBase}/${input.destinationExternalId}/photos`, null, {
        params: {
          url: input.imageUrl,
          caption: input.caption,
          access_token: input.accessToken,
        },
      }) as { data: { id: string } };
    } catch (err) {
      const httpStatus = (err as { response?: { status?: number } }).response?.status;
      if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
        throw err;
      }
      throw Object.assign(
        new Error('Unknown outcome after Facebook photos publish — post may exist'),
        { code: 'UNKNOWN_RESULT', cause: err },
      );
    }
    const externalPublishId = fbRes.data.id;
    return {
      externalPublishId,
      externalUrl: `https://www.facebook.com/${input.destinationExternalId}/posts/${externalPublishId}`,
      publishedAt: new Date().toISOString(),
    };
  }

  async fetchInsights(input: MetaPerformanceInput): Promise<MetaPerformanceOutput> {
    if (isMetaMockMode()) {
      const stored = metaMockState.performance.get(input.externalPublishId);
      if (stored) return stored;
      return {
        impressions: 1000,
        reach: 800,
        clicks: null,
        views: null,
        engagement: 45,
        observedAt: new Date().toISOString(),
      };
    }

    const fields = input.channel === 'INSTAGRAM'
      ? 'impressions,reach,engagement,saved'
      : 'impressions,reach,clicks';
    const res = await axios.get(`${this.graphBase}/${input.externalPublishId}/insights`, {
      params: {
        metric: fields,
        access_token: input.accessToken ?? '',
      },
    });
    const data = (res.data.data ?? []) as Array<{ name: string; values: Array<{ value: number }> }>;
    const metric = (name: string): number | null => {
      const row = data.find((d) => d.name === name);
      if (!row || !row.values?.[0]) return null;
      return row.values[0].value;
    };
    return {
      impressions: metric('impressions'),
      reach: metric('reach'),
      clicks: metric('clicks'),
      views: null,
      engagement: metric('engagement'),
      observedAt: new Date().toISOString(),
    };
  }

  static supportedCapabilities(): string[] {
    return [...META_PUBLISH_CAPABILITIES];
  }
}

export const metaGraphClient = new MetaGraphClient();
