import { DEEPGRAM_BASE_URL, DEEPGRAM_MODEL } from '../constants';
import chalk from 'chalk';

interface DeepgramResponse {
    results: {
        channels: Array<{
            alternatives: Array<{
                transcript: string;
                confidence: number;
            }>;
        }>;
    };
}

/**
 * Transcribes an audio buffer using the Deepgram REST API.
 * Returns the transcript text, or null if transcription fails or is empty.
 */
export async function transcribeAudio(
    audioBuffer: Buffer,
    mimetype: string,
): Promise<string | null> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        console.warn(chalk.yellow('[Transcription] DEEPGRAM_API_KEY not set — skipping transcription'));
        return null;
    }

    const params = new URLSearchParams({
        model: DEEPGRAM_MODEL,
        smart_format: 'true',
        detect_language: 'true',
    });

    const url = `${DEEPGRAM_BASE_URL}?${params}`;

    // Strip codec params (e.g. "audio/ogg; codecs=opus" → "audio/ogg")
    const contentType = mimetype.split(';')[0].trim();

    console.log(chalk.blue(`[Transcription] Sending ${(audioBuffer.length / 1024).toFixed(1)} KB to Deepgram (${contentType})...`));

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': contentType,
        },
        body: new Uint8Array(audioBuffer),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(chalk.red(`[Transcription] Deepgram returned ${response.status}: ${errorText}`));
        return null;
    }

    const data = (await response.json()) as DeepgramResponse;
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();

    if (!transcript) {
        console.warn(chalk.yellow(`[Transcription] Deepgram returned empty transcript — raw response: ${JSON.stringify(data).slice(0, 300)}`));
        return null;
    }

    console.log(chalk.green(`[Transcription] ✓ "${transcript.slice(0, 80)}${transcript.length > 80 ? '…' : ''}"`));
    return transcript;
}
