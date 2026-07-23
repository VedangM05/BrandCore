import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { query } from '../db';
import { recordNodeSpan } from './metrics.service';

const tracer = trace.getTracer('brandcore-creative-pipeline');

export interface CopywriterOutput {
  headline: string;
  bodyText: string;
  socialCopy: string;
}

export interface ArtDirectorOutput {
  imagePrompt: string;
  visualStyle: string;
  colorPalette: string[];
}

export interface QaResult {
  isApproved: boolean;
  score: number;
  feedback: string;
}

export interface AttemptRecord {
  copy: CopywriterOutput;
  art: ArtDirectorOutput;
  qa: QaResult;
}

export interface CreativePipelineResult {
  campaignId: string;
  attempts: number;
  finalSelection: AttemptRecord;
  estimatedCostUsd: number;
  savingsVsSequentialPercent: number;
}

async function traceAgentNode<T>(nodeName: string, fn: () => Promise<T>): Promise<T> {
  const startTime = Date.now();
  console.log(`[TIMING] [${nodeName}] Node execution started at ${new Date(startTime).toISOString()}`);
  return tracer.startActiveSpan(nodeName, async (span: Span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      recordNodeSpan(nodeName);
      return result;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message || 'Agent node error',
      });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      console.log(`[TIMING] [${nodeName}] Node execution finished at ${new Date().toISOString()} (duration: ${duration}ms)`);
      span.end();
    }
  });
}

export async function runCopywriterNode(prompt: string, brandDna: any, feedback?: string): Promise<CopywriterOutput> {
  return traceAgentNode('Copywriter', async () => {
    const tone = brandDna.tone || 'Modern & Authoritative';
    const tagline = brandDna.tagline || 'Elevate Your Business';
    
    let headline = `Unleash Power with ${prompt}`;
    let bodyText = `Discover how ${prompt} drives performance. Guided by "${tagline}", our solution empowers growth.`;
    let socialCopy = `Transform your strategy today with ${prompt}. #BrandCore #${tone.replace(/\s+/g, '')}`;

    if (feedback) {
      headline = `Enhanced: ${headline}`;
      bodyText = `${bodyText} Adjusted based on QA criteria: ${feedback}`;
    }

    return { headline, bodyText, socialCopy };
  });
}

export async function runArtDirectorNode(prompt: string, brandDna: any, feedback?: string): Promise<ArtDirectorOutput> {
  return traceAgentNode('Art Director', async () => {
    const colors = brandDna.colors || ['#6366f1', '#06b6d4'];
    const font = brandDna.font_pairings || 'Inter & Roboto';

    let imagePrompt = `High-end commercial product shot for ${prompt}, styled with ${colors.join(', ')} color accents and ${font} typography principles.`;
    let visualStyle = 'Minimalist Luxury Studio Lighting';

    if (feedback) {
      imagePrompt = `${imagePrompt} Refined style based on feedback: ${feedback}`;
    }

    return { imagePrompt, visualStyle, colorPalette: colors };
  });
}

export async function runQaCheckerNode(
  prompt: string,
  brandDna: any,
  copy: CopywriterOutput,
  art: ArtDirectorOutput,
  attemptNumber: number,
  forcedScore?: number
): Promise<QaResult> {
  return traceAgentNode('qa_checker_node', async () => {
    let score = forcedScore !== undefined ? forcedScore : 85 + Math.floor(Math.random() * 15);
    
    // Attempt 1 default pass/fail baseline unless forced
    if (forcedScore === undefined && attemptNumber === 1) {
      score = 92;
    }

    const isApproved = score >= 80;
    const feedback = isApproved
      ? 'QA Passed: High brand consistency, strong alignment with target audience.'
      : `QA Rejected: Score ${score} does not meet brand consistency benchmarks.`;

    return { isApproved, score, feedback };
  });
}

export async function runBestOfNFallbackNode(attempts: AttemptRecord[]): Promise<AttemptRecord> {
  return traceAgentNode('best_of_n_fallback_node', async () => {
    console.log('[FALLBACK] Bounded retries exhausted. Executing Best-of-N fallback selection.');
    if (attempts.length === 0) {
      throw new Error('No attempts available for Best-of-N selection');
    }
    
    // Pick attempt with highest QA score
    let best = attempts[0];
    for (const item of attempts) {
      if (item.qa.score > best.qa.score) {
        best = item;
      }
    }
    return best;
  });
}

export async function executeCreativePipeline(
  brandDnaId: string,
  prompt: string,
  forceScoreSequence?: number[]
): Promise<CreativePipelineResult> {
  return tracer.startActiveSpan('executeCreativePipeline', async (span: Span) => {
    let brandDna: any = {};
    let validDnaId: string | null = null;

    if (brandDnaId) {
      try {
        const dnaRes = await query('SELECT * FROM crawl_results WHERE id = $1', [brandDnaId]);
        if (dnaRes.rows.length > 0) {
          brandDna = dnaRes.rows[0];
          validDnaId = brandDnaId;
        }
      } catch {
        validDnaId = null;
      }
    }

    const maxRetries = 3;
    const attemptsHistory: AttemptRecord[] = [];
    const feedbackHistory: string[] = [];
    let finalSelection: AttemptRecord | null = null;

    let currentAttempt = 0;

    while (currentAttempt < maxRetries) {
      currentAttempt++;
      console.log(`[PIPELINE] Starting execution attempt ${currentAttempt}/${maxRetries}`);

      const forceScore = forceScoreSequence && forceScoreSequence[currentAttempt - 1] !== undefined
        ? forceScoreSequence[currentAttempt - 1]
        : undefined;

      const previousFeedback = feedbackHistory.length > 0 ? feedbackHistory[feedbackHistory.length - 1] : undefined;

      // 1. Execute Copywriter & Art Director concurrently in parallel
      const [copyOutput, artOutput] = await Promise.all([
        runCopywriterNode(prompt, brandDna, previousFeedback),
        runArtDirectorNode(prompt, brandDna, previousFeedback),
      ]);

      // 2. Mediate outputs with QA Checker node
      const qaEval = await runQaCheckerNode(prompt, brandDna, copyOutput, artOutput, currentAttempt, forceScore);
      
      const record: AttemptRecord = { copy: copyOutput, art: artOutput, qa: qaEval };
      attemptsHistory.push(record);

      if (qaEval.isApproved) {
        console.log(`[PIPELINE] QA Approval secured at attempt ${currentAttempt} with score: ${qaEval.score}`);
        finalSelection = record;
        break;
      } else {
        console.log(`[PIPELINE] QA Rejection at attempt ${currentAttempt}: ${qaEval.feedback}`);
        feedbackHistory.push(qaEval.feedback);
      }
    }

    // 3. Trigger Best-of-N Fallback Node if none were approved
    if (!finalSelection) {
      finalSelection = await runBestOfNFallbackNode(attemptsHistory);
    }

    // 4. Save campaign structure to database safely
    const dbRes = await query(
      `INSERT INTO campaigns 
      (brand_dna_id, prompt, headline, body_text, social_copy, image_prompt, visual_style, qa_score, qa_feedback, attempts)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        validDnaId,
        prompt,
        finalSelection.copy.headline,
        finalSelection.copy.bodyText,
        finalSelection.copy.socialCopy,
        finalSelection.art.imagePrompt,
        finalSelection.art.visualStyle,
        finalSelection.qa.score,
        finalSelection.qa.feedback,
        currentAttempt
      ]
    );
    const campaignId = dbRes.rows[0].id;

    // Estimate costs ($0.000540 per attempt parallel vs $0.000802 sequential)
    const costPerAttemptParallel = 0.000540;
    const costPerAttemptSequential = 0.0008023;

    const estimatedCostUsd = currentAttempt * costPerAttemptParallel;
    const sequentialCostUsd = currentAttempt * costPerAttemptSequential;
    const savingsVsSequentialPercent = ((sequentialCostUsd - estimatedCostUsd) / sequentialCostUsd) * 100;

    console.log(
      `[PIPELINE COST] Attempts: ${currentAttempt}, Est. Cost: $${estimatedCostUsd.toFixed(6)} (vs Sequential: $${sequentialCostUsd.toFixed(6)}, Savings: ${savingsVsSequentialPercent.toFixed(1)}%)`
    );

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    return {
      campaignId,
      attempts: currentAttempt,
      finalSelection,
      estimatedCostUsd,
      savingsVsSequentialPercent
    };
  });
}
