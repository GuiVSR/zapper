import { LocalDatabase, Message, SenderType } from '../db/localDb';
import { LLMClient } from '../llm';
import { transcribeAudio } from '../transcription/deepgram';

export interface RawMedia {
    data: string; // base64 encoding of media
    mimetype: string;
}

export interface IncomingMessageInput {
    id: string;
    chatId: string;
    timestamp: number;
    body: string;
    type: string; // text, audio, image, sticker, gif, ptt, etc.
    senderType: SenderType;
    media?: RawMedia;
}

export class MessageProcessor {
    private db: LocalDatabase;
    private llmClient: LLMClient;

    constructor(db: LocalDatabase, llmClient: LLMClient) {
        this.db = db;
        this.llmClient = llmClient;
    }

    async processIncomingMessage(input: IncomingMessageInput): Promise<Message> {
        let transcription: string | undefined;
        let description: string | undefined;
        let finalBody = input.body;

        if (input.media) {
            const type = input.type.toLowerCase();
            const mediaBuffer = Buffer.from(input.media.data, 'base64');

            if (type === 'audio' || type === 'ptt') {
                try {
                    const transcriptText = await transcribeAudio(mediaBuffer, input.media.mimetype);
                    if (transcriptText) {
                        transcription = transcriptText;
                        finalBody = transcriptText;
                    } else {
                        transcription = '[Audio could not be transcribed]';
                    }
                } catch (err: any) {
                    console.error(`[Processor] Transcription failed: ${err?.message ?? err}`);
                    transcription = '[Audio transcription failed]';
                }
            } else if (type === 'image' || type === 'sticker' || type === 'gif') {
                try {
                    const descText = await this.llmClient.analyzeImage(
                        input.media.data,
                        input.media.mimetype,
                        undefined,
                        input.id
                    );
                    description = descText;
                } catch (err: any) {
                    console.error(`[Processor] Image analysis failed: ${err?.message ?? err}`);
                    description = '[Image analysis failed]';
                }
            }
        }

        const message: Message = {
            id: input.id,
            timestamp: input.timestamp,
            body: finalBody,
            message: finalBody,
            type: input.type,
            senderType: input.senderType,
            transcription,
            description,
        };

        await this.db.addMessage(input.chatId, message);
        return message;
    }
}
