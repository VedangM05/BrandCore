import { refreshSession } from './auth';
import { clearStoredSession, getAccessToken, getRefreshToken, writeStoredSession } from '../lib/session';

let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Refreshes the access token exactly once even if multiple requests 401
 * concurrently - callers share the same in-flight promise instead of each
 * firing their own /api/auth/refresh call.
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (!inFlightRefresh) {
    inFlightRefresh = refreshSession(refreshToken)
      .then((session) => {
        writeStoredSession(session);
        return session.accessToken;
      })
      .catch(() => {
        clearStoredSession();
        return null;
      })
      .finally(() => {
        inFlightRefresh = null;
      });
  }

  return inFlightRefresh;
}

/**
 * fetch() wrapper for protected API routes. Attaches the access token as an
 * Authorization: Bearer header and, on a 401, refreshes once and retries.
 *
 * Every protected backend route now requires this header (see
 * src/middleware/auth.middleware.ts) - previously the frontend never sent it
 * because nothing on the server was checking for it.
 */
export async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const attempt = async (token: string | null): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(path, { ...options, headers });
  };

  let response: Response;
  try {
    response = await attempt(getAccessToken());
  } catch {
    throw new Error('Cannot reach the API server. Start the backend with: npm run dev');
  }

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      try {
        response = await attempt(newToken);
      } catch {
        throw new Error('Cannot reach the API server. Start the backend with: npm run dev');
      }
    }
  }

  return response;
}

/** apiRequest + JSON parsing + error-message extraction, for the common case. */
export async function apiRequestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiRequest(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string })?.error || `Request failed (${response.status})`);
  }
  return data as T;
}

/**
 * Loads a protected asset's bytes and returns an object URL for inline
 * preview (<img src>). Plain <img> tags can't carry an Authorization header,
 * and every asset route requires one, so this is the standard way any view
 * displays a generated image. Callers own the returned URL and must
 * URL.revokeObjectURL it when replacing/unmounting to avoid leaking memory.
 */
export async function getAssetBlobUrl(assetId: string): Promise<string> {
  const response = await apiRequest(`/api/assets/${assetId}/download`);
  if (!response.ok) {
    throw new Error(`Failed to load generated image (${response.status})`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Loads the text-free background stashed for a campaign-post/carousel-slide
 * asset, for reopening the editor from the Asset Library with the headline
 * still an independent movable layer. Returns null (rather than throwing) on
 * 404 - most callers should treat that as "no raw background available" and
 * fall back to the asset's own flattened file via getAssetBlobUrl.
 */
export async function getAssetRawBackgroundBlobUrl(assetId: string): Promise<string | null> {
  const response = await apiRequest(`/api/assets/${assetId}/raw-background`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to load raw background (${response.status})`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Persists an edited image (from AssetEditor) back onto an existing asset,
 * overwriting its file in place and merging editor state into its metadata.
 */
export async function saveAssetEdit(
  assetId: string,
  imageBlob: Blob,
  editorState: Record<string, any>
): Promise<void> {
  const imageDataUrl = await blobToDataUrl(imageBlob);
  await apiRequestJson(`/api/assets/${assetId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, metaData: { editorState } }),
  });
}

export interface BrandDnaUpdate {
  title?: string;
  tagline?: string;
  tone?: string;
  colors?: string[];
  font_pairings?: string;
}

export interface BrandDnaRecord {
  id: string;
  title: string;
  tagline: string | null;
  tone: string | null;
  colors: string[];
  font_pairings: string | null;
}

/** Persists a correction to the auto-extracted Business DNA - see BusinessDnaView.tsx. */
export async function updateBrandDna(id: string, updates: BrandDnaUpdate): Promise<BrandDnaRecord> {
  const data = await apiRequestJson<{ brandDna: BrandDnaRecord }>(`/api/dna/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return data.brandDna;
}

export interface CampaignIdea {
  angle: string;
  prompt: string;
}

/** Re-sends the account's email verification link (see the banner in DashboardShell.tsx). */
export async function resendVerificationEmail(): Promise<void> {
  await apiRequestJson('/api/auth/resend-verification', { method: 'POST' });
}

/** Fetches DNA-grounded campaign suggestions for the Campaigns tab's idea chips. */
export async function fetchCampaignIdeas(brandDnaId: string): Promise<CampaignIdea[]> {
  const data = await apiRequestJson<{ ideas: CampaignIdea[] }>(
    `/api/creative/ideas?brandDnaId=${encodeURIComponent(brandDnaId)}`
  );
  return data.ideas;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatSource {
  type: string;
  snippet: string;
}

export interface ChatAnswer {
  answer: string;
  grounded: boolean;
  sources: ChatSource[];
}

/** Asks a question about a scanned brand's website, grounded in its indexed Knowledge Base - see chat.service.ts. */
export async function askBrandQuestion(brandDnaId: string, question: string, history: ChatMessage[]): Promise<ChatAnswer> {
  return apiRequestJson<ChatAnswer>(`/api/dna/${encodeURIComponent(brandDnaId)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  });
}

/** Whether the background Knowledge Base indexing job has produced anything queryable yet - see knowledgeBase.service.ts. */
export async function fetchKnowledgeStatus(brandDnaId: string): Promise<{ ready: boolean }> {
  return apiRequestJson<{ ready: boolean }>(`/api/dna/${encodeURIComponent(brandDnaId)}/knowledge-status`);
}

export interface ChatHistoryPage {
  messages: ChatMessage[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * A page of prior conversation turns for this brand, oldest-first within
 * the page - see chat.service.ts's getChatHistory. `offset=0` (the
 * default) returns the most recent `limit` turns; pass a larger `offset` to
 * load older ones (see BrandChatPanel.tsx's "Load older messages").
 */
export async function fetchChatHistory(brandDnaId: string, options: { limit?: number; offset?: number } = {}): Promise<ChatHistoryPage> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const qs = params.toString();
  const data = await apiRequestJson<{ history: ChatMessage[]; total: number; limit: number; offset: number }>(
    `/api/dna/${encodeURIComponent(brandDnaId)}/chat/history${qs ? `?${qs}` : ''}`
  );
  return { messages: data.history, total: data.total, limit: data.limit, offset: data.offset };
}

export type CoordinatorGenerationType = 'text' | 'image' | 'post' | 'carousel';

export interface CoordinatorRequest {
  url: string;
  prompt?: string;
  channel?: string;
  generationType?: CoordinatorGenerationType;
  scenePrompt?: string;
  style?: string;
  aspect?: string;
  slideCount?: number;
}

export interface CoordinatorResult {
  brandDnaId: string;
  dna: {
    id: string;
    title: string;
    tagline?: string;
    colors: string[];
    tone: string;
    font_pairings: string;
  };
  // Shape varies by generationType (text/image/post/carousel each return a
  // different result from creative.service.ts/photoshoot.service.ts) -
  // CoordinatorView.tsx renders defensively field-by-field rather than
  // assuming one shape.
  creative: any;
}

/**
 * Runs the Coordinator Agent (see coordinator.service.ts's LangGraph
 * StateGraph) in one call: scans `url` into a fresh Brand DNA, and - only if
 * `prompt` is supplied - continues straight into generating the requested
 * `generationType`. Quota-gated like every other generation endpoint.
 */
export async function runCoordinator(request: CoordinatorRequest): Promise<CoordinatorResult> {
  return apiRequestJson<CoordinatorResult>('/api/coordinator/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}
