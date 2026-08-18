import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { runDnaScan, DnaScanResult } from './dna.service';
import { executeCreativePipeline, CreativePipelineResult } from './creative.service';
import { generatePhotoshootImage, generateCampaignPost, generateCarousel, PhotoshootImageResult, CampaignPostResult, CarouselResult } from './photoshoot.service';
import { recordNodeSpan } from './metrics.service';

const tracer = trace.getTracer('brandcore-coordinator-agent');

export type GenerationType = 'text' | 'image' | 'post' | 'carousel';

export interface CoordinatorRequest {
  url: string;
  userId: string;
  /** Omit to run a DNA-only scan (Website/Vision/Brand Intelligence, no creative generation). */
  prompt?: string;
  channel?: string;
  generationType?: GenerationType;
  scenePrompt?: string; // used when generationType === 'image'
  style?: string; // used when generationType === 'image'
  aspect?: string;
  slideCount?: number;
}

export interface CoordinatorResult {
  brandDnaId: string;
  dna: DnaScanResult;
  creative: CreativePipelineResult | PhotoshootImageResult | CampaignPostResult | CarouselResult | null;
}

/**
 * The literal "Coordinator Agent" from the spec's agent graph (Coordinator
 * -> Website/Vision -> Brand Intelligence -> Knowledge Agent -> Creative
 * Planner -> [Copywriter || Art Director] -> Imagen -> Brand QA), built as
 * a real LangGraph `StateGraph` rather than a renamed function call.
 *
 * Deliberately a thin orchestration layer over the existing, already-real,
 * already-tested services (`dna.service.ts`, `creative.service.ts`,
 * `photoshoot.service.ts`) rather than a reimplementation of their
 * internals - those already ARE the Website/Vision/Brand Intelligence,
 * Knowledge Agent (via the background indexing job it enqueues), Creative
 * Planner/Copywriter/Art Director/Imagen/Brand QA steps; the Coordinator's
 * actual job is deciding what runs and in what order, which is exactly
 * what a graph's conditional edges are for. This is the "one call, brand-
 * scan-to-finished-creative" endpoint - the granular per-step endpoints
 * (`/api/dna/scan`, `/api/creative/generate`, `/api/photoshoot/*`) still
 * exist and back the step-by-step UI flows already built.
 */
const CoordinatorState = Annotation.Root({
  url: Annotation<string>,
  userId: Annotation<string>,
  prompt: Annotation<string | undefined>,
  channel: Annotation<string | undefined>,
  generationType: Annotation<GenerationType>,
  scenePrompt: Annotation<string | undefined>,
  style: Annotation<string | undefined>,
  aspect: Annotation<string | undefined>,
  slideCount: Annotation<number | undefined>,
  dna: Annotation<DnaScanResult | null>,
  creative: Annotation<CoordinatorResult['creative']>,
});

type CoordinatorStateType = typeof CoordinatorState.State;

async function websiteVisionBrandIntelligenceNode(state: CoordinatorStateType): Promise<Partial<CoordinatorStateType>> {
  return tracer.startActiveSpan('coordinator_website_vision_brand_intelligence_node', async (span) => {
    span.setAttribute('coordinator.url', state.url);
    try {
      // Website crawl + Vision + Brand Intelligence -> Brand DNA (spec's
      // three collapsed hops - see dna.service.ts/intelligence.service.ts)
      // plus enqueuing the Knowledge Agent's background indexing job (see
      // knowledgeBase.service.ts) - all already real, all already tested.
      const dna = await runDnaScan(state.url, state.userId);
      span.setAttribute('coordinator.brand_dna_id', dna.id);
      span.setStatus({ code: SpanStatusCode.OK });
      recordNodeSpan('coordinator_website_vision_brand_intelligence_node');
      return { dna };
    } finally {
      span.end();
    }
  });
}

/** Conditional edge: only continue to creative generation if a campaign prompt was supplied. */
function routeAfterScan(state: CoordinatorStateType): 'creative_planner_generation' | typeof END {
  return state.prompt && state.prompt.trim() ? 'creative_planner_generation' : END;
}

async function creativePlannerGenerationNode(state: CoordinatorStateType): Promise<Partial<CoordinatorStateType>> {
  return tracer.startActiveSpan('coordinator_creative_planner_generation_node', async (span) => {
    const brandDnaId = state.dna!.id;
    const prompt = state.prompt!;
    span.setAttribute('coordinator.generation_type', state.generationType);
    try {
      // Creative Planner -> [Copywriter || Art Director] -> Imagen ->
      // Brand QA (spec) - dispatched by requested output type to the
      // already-real pipelines in creative.service.ts / photoshoot.service.ts.
      let creative: CoordinatorResult['creative'];
      switch (state.generationType) {
        case 'image':
          creative = await generatePhotoshootImage(brandDnaId, state.scenePrompt || prompt, state.style || 'Studio', state.aspect, state.userId);
          break;
        case 'post':
          creative = await generateCampaignPost(brandDnaId, prompt, state.channel, state.aspect, state.userId);
          break;
        case 'carousel':
          creative = await generateCarousel(brandDnaId, prompt, state.slideCount, state.aspect, state.userId);
          break;
        case 'text':
        default:
          creative = await executeCreativePipeline(brandDnaId, prompt, undefined, state.channel, state.userId);
          break;
      }
      span.setStatus({ code: SpanStatusCode.OK });
      recordNodeSpan('coordinator_creative_planner_generation_node');
      return { creative };
    } finally {
      span.end();
    }
  });
}

const coordinatorGraph = new StateGraph(CoordinatorState)
  .addNode('website_vision_brand_intelligence', websiteVisionBrandIntelligenceNode)
  .addNode('creative_planner_generation', creativePlannerGenerationNode)
  .addEdge(START, 'website_vision_brand_intelligence')
  .addConditionalEdges('website_vision_brand_intelligence', routeAfterScan)
  .addEdge('creative_planner_generation', END)
  .compile();

/**
 * Runs the Coordinator Agent: scans `request.url` into a fresh Brand DNA
 * (Website/Vision/Brand Intelligence + Knowledge Agent indexing), then -
 * only if `request.prompt` is provided - continues straight into Creative
 * Planner/Copywriter/Art Director/Imagen/Brand QA generation of the
 * requested type, in one coordinated call.
 */
export async function runCoordinatorAgent(request: CoordinatorRequest): Promise<CoordinatorResult> {
  return tracer.startActiveSpan('coordinator_agent', async (span) => {
    span.setAttribute('coordinator.url', request.url);
    span.setAttribute('coordinator.has_prompt', Boolean(request.prompt));
    try {
      const result = await coordinatorGraph.invoke({
        url: request.url,
        userId: request.userId,
        prompt: request.prompt,
        channel: request.channel,
        generationType: request.generationType || 'text',
        scenePrompt: request.scenePrompt,
        style: request.style,
        aspect: request.aspect,
        slideCount: request.slideCount,
        dna: null,
        creative: null,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return { brandDnaId: result.dna!.id, dna: result.dna!, creative: result.creative };
    } finally {
      span.end();
    }
  });
}
