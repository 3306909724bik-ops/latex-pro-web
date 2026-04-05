import { getBrowserOpenAIConfig, requestOpenAIJsonWithUserContent, type OpenAIUserContentPart } from '../ai/openaiClient';

interface ImageAnalysisResponse {
  summary?: string;
  detectedType?: string;
  confidence?: 'high' | 'medium' | 'low';
  ocrText?: string[];
  keyFindings?: string[];
  suggestedCaption?: string;
  suggestedSection?: string;
  shouldInsertIntoReport?: boolean;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error(`Failed to read ${file.name} as data URL.`));
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function buildFallbackAnalysis(file: File, reason?: string): string {
  return [
    `[Image uploaded: ${file.name}]`,
    'Automatic visual analysis is not available yet in the current frontend runtime.',
    reason ? `Reason: ${reason}` : '',
    'The image is still available for manual figure insertion into the report workspace.',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatImageAnalysis(file: File, response: ImageAnalysisResponse): string {
  const summary = normalizeText(response.summary);
  const detectedType = normalizeText(response.detectedType);
  const confidence = response.confidence === 'high' || response.confidence === 'medium' || response.confidence === 'low' ? response.confidence : 'medium';
  const ocrText = normalizeStringArray(response.ocrText);
  const keyFindings = normalizeStringArray(response.keyFindings);
  const suggestedCaption = normalizeText(response.suggestedCaption);
  const suggestedSection = normalizeText(response.suggestedSection);
  const shouldInsertIntoReport = typeof response.shouldInsertIntoReport === 'boolean' ? response.shouldInsertIntoReport : false;

  return [
    `[Image analysis: ${file.name}]`,
    `Detected type: ${detectedType || 'unknown'}`,
    `Confidence: ${confidence}`,
    `Suggested section: ${suggestedSection || 'results'}`,
    `Should insert into report: ${shouldInsertIntoReport ? 'yes' : 'maybe'}`,
    '',
    'Summary:',
    summary || 'No high-confidence summary returned.',
    '',
    'Suggested caption:',
    suggestedCaption || 'No caption suggestion returned.',
    '',
    'Key findings:',
    keyFindings.length > 0 ? keyFindings.map((item) => `- ${item}`).join('\n') : '- None extracted.',
    '',
    'Visible text / OCR:',
    ocrText.length > 0 ? ocrText.join(' | ') : '(none)',
  ].join('\n');
}

export async function analyzeImageFile(file: File): Promise<string> {
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName);

  if (!isImage) {
    throw new Error(`File ${file.name} is not a supported image input for visual analysis.`);
  }

  if (!getBrowserOpenAIConfig()) {
    return buildFallbackAnalysis(file, 'OpenAI browser config is missing.');
  }

  try {
    const imageUrl = await fileToDataUrl(file);
    const userContent: OpenAIUserContentPart[] = [
      {
        type: 'text',
        text: [
          'Analyze this uploaded research/workspace image for academic report generation.',
          'Focus on whether it is a chart, table screenshot, microscopy image, apparatus photo, workflow figure, or other figure-like result.',
          'Return strict JSON only with:',
          '{',
          '  "summary": string,',
          '  "detectedType": string,',
          '  "confidence": "high" | "medium" | "low",',
          '  "ocrText": string[],',          '  "keyFindings": string[],',
          '  "suggestedCaption": string,',
          '  "suggestedSection": string,',
          '  "shouldInsertIntoReport": boolean',
          '}',
          'Be concise, factual, and avoid hallucinating unreadable values.',
          'Use low confidence when the figure is blurry, ambiguous, or text is unreadable.',
        ].join(' '),
      },
      {
        type: 'image_url',
        image_url: { url: imageUrl },
      },
    ];

    const response = await requestOpenAIJsonWithUserContent<ImageAnalysisResponse>(
      'You are a careful academic figure analyst. Extract only what is visually supportable and useful for a report workbench.',
      userContent,
    );

    return formatImageAnalysis(file, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown image analysis failure.';
    return buildFallbackAnalysis(file, message);
  }
}
