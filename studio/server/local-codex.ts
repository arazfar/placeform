import { Buffer } from 'node:buffer';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import {
  generationPrompt,
  resultSchema,
  validGenerationInput,
  validateResult,
  type GenerationJob,
  type GenerationInput,
} from '../lib/generation';

// This adapter exists only in the local Vite server. It never ships in the Worker.
export function localCodex(): Plugin {
  const nonce = Buffer.from(randomBytes(32)).toString('hex');
  const root = join(
    homedir(),
    '.cache',
    'placeform',
    createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16),
  );
  const active = new Map<string, ReturnType<typeof spawn>>();
  const live = new Map<string, GenerationJob>();
  let capability:
    | { available: boolean; message: string; checked: number }
    | undefined;
  async function check() {
    if (capability && Date.now() - capability.checked < 30000)
      return capability;
    try {
      const { stdout, stderr } = await promisify(execFile)(
        'codex',
        ['login', 'status'],
        { timeout: 10000 },
      );
      const available = /Logged in using ChatGPT/i.test(stdout + stderr);
      capability = {
        available,
        message: available
          ? 'Signed in with ChatGPT · subscription allowance'
          : 'Sign in to Codex with ChatGPT on this computer.',
        checked: Date.now(),
      };
    } catch {
      capability = {
        available: false,
        message:
          'Codex CLI is unavailable. OpenAI API generation is available instead.',
        checked: Date.now(),
      };
    }
    return capability;
  }
  async function save(job: GenerationJob) {
    await writeFile(join(root, job.id, 'job.json'), JSON.stringify(job), {
      mode: 0o600,
    });
  }
  async function launch(input: GenerationInput): Promise<GenerationJob> {
    if (!(await check()).available)
      throw new Error(
        'Codex subscription login is unavailable. Choose the OpenAI API option or sign in to Codex.',
      );
    if (active.size >= 4)
      throw new Error(
        'Four Codex jobs are already running. Wait for one to finish.',
      );
    const id = randomUUID(),
      dir = join(root, id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const job: GenerationJob = {
      id,
      provider: 'codex',
      status: 'running',
      message: 'Starting your signed-in Codex session…',
    };
    await save(job);
    await writeFile(
      join(dir, 'schema.json'),
      JSON.stringify(resultSchema(input.kind)),
      { mode: 0o600 },
    );
    const args = [
      'exec',
      '--ignore-user-config',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox',
      input.kind === 'image' ? 'workspace-write' : 'read-only',
      '-c',
      `web_search="${input.kind === 'research' ? 'live' : 'disabled'}"`,
      '-c',
      'features.shell_tool=false',
      '-c',
      'features.multi_agent=false',
      '--json',
      '--output-schema',
      join(dir, 'schema.json'),
      '-o',
      join(dir, 'result.json'),
    ];
    if (input.reference) {
      const match = input.reference.match(
        /^data:image\/(png|jpeg|webp);base64,(.+)$/,
      )!;
      const path = join(dir, `reference.${match[1]}`);
      await writeFile(path, Buffer.from(match[2], 'base64'), { mode: 0o600 });
      args.push('--image', path);
    }
    args.push('-');
    const childEnv = { ...process.env };
    delete childEnv.OPENAI_API_KEY;
    delete childEnv.AIAND_API_KEY;
    const child = spawn('codex', args, {
      cwd: dir,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    active.set(id, child);
    live.set(id, job);
    child.stdin.end(generationPrompt(input));
    let stdout = '',
      lastMessage = '',
      stderr = '',
      cancelled = false,
      generatedPath = '',
      codexThreadId = '';
    const timer = setTimeout(
      () => {
        cancelled = true;
        job.status = 'failed';
        job.message =
          'The job exceeded 15 minutes. Review or retry from the UI.';
        child.kill('SIGTERM');
      },
      15 * 60 * 1000,
    );
    child.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    child.stdout.on('data', (d) => {
      stdout += d.toString();
      let index;
      while ((index = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, index);
        stdout = stdout.slice(index + 1);
        try {
          const event = JSON.parse(line);
          if (
            event.type === 'thread.started' &&
            /^[a-f\d-]{36}$/.test(event.thread_id || '')
          )
            codexThreadId = event.thread_id;
          if (event.item?.saved_path && /image/.test(event.item.type || ''))
            generatedPath = event.item.saved_path;

          if (event.type === 'turn.completed') job.usage = event.usage;
          if (event.item?.type === 'agent_message') {
            lastMessage = event.item.text;
            job.message = 'Preparing the result for review…';
          } else if (event.item?.type === 'web_search')
            job.message = 'Reading local evidence and primary sources…';
          else if (/image/.test(event.item?.type || ''))
            job.message = 'Generating the architectural image…';
          else if (event.type === 'turn.started')
            job.message =
              input.kind === 'image'
                ? 'Generating the image with Codex…'
                : 'Codex is working on your project…';
          if (event.type === 'turn.failed')
            job.message = String(
              event.error?.message || 'Codex could not complete this job.',
            ).slice(0, 500);
        } catch {
          /* Non-JSON diagnostics never reach the browser. */
        }
      }
    });
    child.on('error', async () => {
      clearTimeout(timer);
      active.delete(id);
      job.status = 'failed';
      job.message =
        'Could not start Codex. Check the connection or choose OpenAI API.';
      await save(job);
    });
    child.on('close', async (code, signal) => {
      clearTimeout(timer);
      active.delete(id);
      try {
        if (signal || cancelled || job.status === 'cancelled') {
          job.status = cancelled ? 'failed' : 'cancelled';
          if (!cancelled) job.message = 'Cancelled. No changes were applied.';
          await save(job);
          return;
        }
        if (code !== 0)
          throw new Error(
            /usage limit|rate limit|quota/i.test(stderr + lastMessage)
              ? 'Your Codex allowance is currently unavailable. Wait for its reset or choose the paid OpenAI API.'
              : job.message.startsWith('Codex could')
                ? job.message
                : 'Codex did not finish. Retry or choose the OpenAI API.',
          );
        const raw = await readFile(join(dir, 'result.json'), 'utf8').catch(
          () => lastMessage,
        );
        await writeFile(
          join(dir, 'response.json'),
          JSON.stringify({ raw, generatedPath }),
          { mode: 0o600 },
        );
        let result = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        if (input.kind === 'image') {
          if (generatedPath) result.imagePath = generatedPath;
          if (typeof result.imagePath !== 'string')
            throw new Error(
              'Codex returned no image file. Retry or use OpenAI API.',
            );
          const path = await realpath(resolve(dir, result.imagePath));
          const allowed = [
            await realpath(dir),
            join(
              await realpath(join(homedir(), '.codex', 'generated_images')),
              codexThreadId || 'unverified-thread',
            ),
          ];
          const info = await stat(path);
          if (
            !allowed.some((base) => path.startsWith(base + sep)) ||
            !info.isFile() ||
            info.size > 15_000_000 ||
            info.mtimeMs < Date.now() - 16 * 60 * 1000
          )
            throw new Error('The generated image path could not be verified.');
          const bytes = Buffer.from(await readFile(path));
          const mime = bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? 'png'
            : bytes[0] === 255 && bytes[1] === 216
              ? 'jpeg'
              : bytes.toString('ascii', 8, 12) === 'WEBP'
                ? 'webp'
                : null;
          if (!mime)
            throw new Error('The generated file is not a supported image.');
          result = {
            image: `data:image/${mime};base64,${bytes.toString('base64')}`,
            message: result.message,
          };
        }
        job.result = validateResult(input.kind, result);
        job.status = 'completed';
        job.message = 'Ready for your review.';
      } catch (error) {
        job.status = 'failed';
        job.message = (error as Error).message.slice(0, 600);
      }
      await save(job);
    });
    return job;
  }
  return {
    name: 'placeform-local-codex',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/codex')) return next();
        const host = req.headers.host || '';
        const origin = req.headers.origin;
        const allowed = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(
          host,
        );
        const respond = (body: unknown, status = 200) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        if (
          !allowed ||
          (origin &&
            origin !== `http://${host}` &&
            origin !== `https://${host}`)
        )
          return respond({ error: 'Local, same-origin requests only.' }, 403);
        try {
          const url = new URL(req.url, `http://${host}`),
            id = url.searchParams.get('id');
          if (req.method === 'GET' && !id)
            return respond({ ...(await check()), nonce });
          if (req.headers['x-placeform-token'] !== nonce)
            return respond(
              { error: 'Refresh the page to reconnect to local Codex.' },
              403,
            );
          if (id) {
            if (!/^[a-f\d-]{36}$/.test(id))
              return respond({ error: 'Invalid job ID.' }, 400);
            if (req.method === 'DELETE') {
              const job = live.get(id);
              if (job) {
                job.status = 'cancelled';
                job.message = 'Cancelled. No changes were applied.';
                await save(job);
              }
              active.get(id)?.kill('SIGTERM');
              return respond({ status: 'cancelled' });
            }
            const job =
              live.get(id) ||
              (JSON.parse(
                await readFile(join(root, id, 'job.json'), 'utf8'),
              ) as GenerationJob);
            if (job.status === 'running' && !active.has(id)) {
              job.status = 'failed';
              job.message =
                'The local server restarted during this job. Retry when ready.';
              await save(job);
            }
            return respond(job);
          }
          if (req.method !== 'POST')
            return respond({ error: 'Method not allowed' }, 405);
          let body = '';
          for await (const chunk of req) {
            body += chunk.toString();
            if (body.length > 9_000_000)
              return respond({ error: 'The request is too large.' }, 413);
          }
          const input = JSON.parse(body);
          if (!validGenerationInput(input))
            return respond(
              { error: 'Invalid project or generation request.' },
              400,
            );
          if (input.kind === 'image')
            return respond(
              {
                error:
                  'Image generation and refinement require the OpenAI API with Sunburst at maximum quality.',
              },
              400,
            );
          if (
            input.spec.demoContext &&
            ['research', 'concepts'].includes(input.kind)
          )
            return respond(
              {
                error:
                  'The Presidio demo uses prepared research and directions.',
              },
              400,
            );
          respond(await launch(input), 202);
        } catch (error) {
          respond({ error: (error as Error).message }, 400);
        }
      });
      server.httpServer?.once('close', () => {
        for (const child of active.values()) child.kill('SIGTERM');
      });
    },
  };
}
