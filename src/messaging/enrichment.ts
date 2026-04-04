// ─────────────────────────────────────────────────────────────────────────────
// enrichment.ts — backfills missing image descriptions and audio transcriptions
// for history messages before they're sent to the LLM.
// ─────────────────────────────────────────────────────────────────────────────

import { WhatsAppClient, MessageHistory } from '../client';
import { getLLMClient } from '../llm';
import { transcribeAudio } from '../transcription/deepgram';
import { saveDescription, getDescriptions } from '../transcription/cache';
import chalk from 'chalk';
import { PooledMessage } from './types';

/**
 * Takes a list of history messages, looks up cached descriptions, and for
 * any image or audio message still missing a description it downloads +
 * analyses/transcribes on the spot.  Returns the fully-enriched list.
 */
export async function enrichWithDescriptions(
    client: WhatsAppClient,
    messages: MessageHistory[],
): Promise<PooledMessage[]> {
    const descMap = getDescriptions(messages.map(m => m.id));

    const enriched: PooledMessage[] = [];

    for (const m of messages) {
        let body: string;
        switch (m.type) {
            case 'image':
                body = m.body?.trim() || '[image]';
                break;
            case 'audio':
            case 'ptt':
                body = m.body || '';
                break;
            default:
                body = m.body || '';
                break;
        }

        let imageDescription: string | undefined = descMap[m.id];

        // If this is an image and we don't have a description yet — fetch one now
        if (m.type === 'image' && m.hasMedia && !imageDescription) {
            try {
                console.log(chalk.blue(`[Vision] No cached description for image ${m.id} — analysing now…`));
                const media = await client.getMessageMedia(m.serializedId);
                if (media) {
                    const llm = getLLMClient();
                    imageDescription = await llm.analyzeImage(media.data, media.mimetype, undefined, m.id);
                    saveDescription(m.id, imageDescription);
                    console.log(chalk.green(`[Vision] ✅ Description cached for ${m.id} (${imageDescription.length} chars)`));
                } else {
                    console.warn(chalk.yellow(`[Vision] Could not download media for ${m.id}`));
                    imageDescription = '[Image could not be downloaded]';
                }
            } catch (err: any) {
                console.error(chalk.red(`[Vision] ❌ Failed to analyse image ${m.id}: ${err?.message ?? err}`));
                imageDescription = '[Image analysis failed]';
            }
        }

        // If this is audio/ptt and we don't have a transcription yet — transcribe now
        if ((m.type === 'audio' || m.type === 'ptt') && m.hasMedia && !imageDescription) {
            try {
                console.log(chalk.blue(`[Transcription] No cached transcription for ${m.type} ${m.id} — transcribing now…`));
                const media = await client.getMessageMedia(m.serializedId);
                if (media) {
                    const audioBuffer = Buffer.from(media.data, 'base64');
                    const transcript = await transcribeAudio(audioBuffer, media.mimetype);
                    if (transcript) {
                        imageDescription = transcript;
                        saveDescription(m.id, transcript);
                        console.log(chalk.green(`[Transcription] ✅ Transcription cached for ${m.id} (${transcript.length} chars)`));
                    } else {
                        console.warn(chalk.yellow(`[Transcription] Empty transcript for ${m.id}`));
                        imageDescription = '[Audio could not be transcribed]';
                    }
                } else {
                    console.warn(chalk.yellow(`[Transcription] Could not download media for ${m.id}`));
                    imageDescription = '[Audio could not be downloaded]';
                }
            } catch (err: any) {
                console.error(chalk.red(`[Transcription] ❌ Failed to transcribe ${m.id}: ${err?.message ?? err}`));
                imageDescription = '[Audio transcription failed]';
            }
        }

        enriched.push({
            id:    m.id,
            from:  m.from,
            to:    m.to,
            body,
            timestamp: m.timestamp,
            type:  m.type,
            fromMe: m.fromMe,
            hasMedia: m.hasMedia,
            imageDescription,
        });
    }

    return enriched;
}