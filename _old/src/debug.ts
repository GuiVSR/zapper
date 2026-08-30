// ─────────────────────────────────────────────────────────────────────────────
// debug.ts — centralised debug logging.
// Enable by setting DEBUG=true in your .env file.
// ─────────────────────────────────────────────────────────────────────────────
import chalk from 'chalk';

export const DEBUG = process.env.DEBUG === 'true';

const DIVIDER     = '─'.repeat(70);
const BIG_DIVIDER = '═'.repeat(70);

export function debugLog(section: string, content: string): void {
    if (!DEBUG) return;

    console.log('\n' + chalk.bgMagenta.white.bold(` 🐛 DEBUG — ${section} `));
    console.log(chalk.magenta(DIVIDER));
    console.log(chalk.white(content));
    console.log(chalk.magenta(DIVIDER) + '\n');
}

export function debugPrompt(
    provider: string,
    model: string,
    systemPrompt: string,
    conversationText: string,
    maxParts: number
): void {
    if (!DEBUG) return;

    console.log('\n' + chalk.bgBlue.white.bold(` 🐛 DEBUG — FULL PROMPT (${provider}) `));
    console.log(chalk.blue(BIG_DIVIDER));

    console.log(chalk.cyan.bold('  PROVIDER : ') + chalk.white(provider));
    console.log(chalk.cyan.bold('  MODEL    : ') + chalk.white(model));
    console.log(chalk.cyan.bold('  MAX PARTS: ') + chalk.white(String(maxParts)));

    console.log(chalk.blue(DIVIDER));
    console.log(chalk.yellow.bold('  ── SYSTEM PROMPT ──'));
    systemPrompt.split('\n').forEach(line => console.log(chalk.yellow('  ' + line)));

    console.log(chalk.blue(DIVIDER));
    console.log(chalk.green.bold('  ── CONVERSATION CONTEXT ──'));
    conversationText.split('\n').forEach(line => console.log(chalk.green('  ' + line)));

    console.log(chalk.blue(BIG_DIVIDER) + '\n');
}

export function debugResponse(provider: string, raw: string, parts: string[]): void {
    if (!DEBUG) return;

    console.log('\n' + chalk.bgGreen.black.bold(` 🐛 DEBUG — LLM RESPONSE (${provider}) `));
    console.log(chalk.green(BIG_DIVIDER));

    console.log(chalk.yellow.bold('  ── RAW RESPONSE ──'));
    raw.split('\n').forEach(line => console.log(chalk.white('  ' + line)));

    console.log(chalk.green(DIVIDER));
    console.log(chalk.yellow.bold(`  ── PARSED PARTS (${parts.length}) ──`));
    parts.forEach((p, i) => {
        console.log(chalk.cyan(`  [Part ${i + 1}]`));
        p.split('\n').forEach(line => console.log(chalk.white('  ' + line)));
    });

    console.log(chalk.green(BIG_DIVIDER) + '\n');
}

export function debugImageAnalysis(
    provider: string,
    model: string,
    messageId: string,
    mimeType: string,
    prompt: string,
    description: string
): void {
    if (!DEBUG) return;

    console.log('\n' + chalk.bgYellow.black.bold(` 🐛 DEBUG — IMAGE ANALYSIS (${provider}) `));
    console.log(chalk.yellow(BIG_DIVIDER));

    console.log(chalk.cyan.bold('  PROVIDER  : ') + chalk.white(provider));
    console.log(chalk.cyan.bold('  MODEL     : ') + chalk.white(model));
    console.log(chalk.cyan.bold('  MESSAGE ID: ') + chalk.white(messageId));
    console.log(chalk.cyan.bold('  MIME TYPE : ') + chalk.white(mimeType));

    console.log(chalk.yellow(DIVIDER));
    console.log(chalk.magenta.bold('  ── ANALYSIS PROMPT ──'));
    prompt.split('\n').forEach(line => console.log(chalk.magenta('  ' + line)));

    console.log(chalk.yellow(DIVIDER));
    console.log(chalk.green.bold('  ── DESCRIPTION RESULT ──'));
    description.split('\n').forEach(line => console.log(chalk.white('  ' + line)));

    console.log(chalk.yellow(BIG_DIVIDER) + '\n');
}