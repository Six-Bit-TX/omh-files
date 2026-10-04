/** Install the pinned local editor; runtime credentials never enter the repository. */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const image = 'onlyoffice/documentserver@sha256:3ab6ebc7c605e5a32b7ae3ff19daed4925090245acc8100ce2230bd766c88212';
const directory = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'office');
const configPath = join(directory, 'config.json');
const container = 'omchor-office';
const docker = (args, capture = false) => execFileSync('docker', args, { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
await mkdir(directory, { recursive: true, mode: 0o700 });
let config;
try { config = JSON.parse(await readFile(configPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const gateway = docker(['network', 'inspect', 'bridge', '--format', '{{range .IPAM.Config}}{{.Gateway}}{{end}}'], true).trim();
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(gateway)) throw new Error('Docker bridge has no IPv4 gateway.');
  config = { editorOrigin: 'http://127.0.0.1:3085', bridgeHost: gateway, secret: randomBytes(48).toString('base64url'), maxFileBytes: 64 * 1024 * 1024, maxSessions: 32 };
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
await chmod(configPath, 0o600);
const existing = docker(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}'], true).trim();
if (existing) {
  const installedImage = docker(['inspect', container, '--format', '{{.Config.Image}}'], true).trim();
  if (installedImage !== image) throw new Error('omchor-office already exists with a different image; refusing to replace it.');
  docker(['start', container]);
} else {
  const envFile = join(directory, 'container.env');
  if (!/^[A-Za-z0-9_-]{32,}$/.test(config.secret)) throw new Error('Office secret is invalid.');
  await writeFile(envFile, `JWT_ENABLED=true\nJWT_IN_BODY=true\nJWT_SECRET=${config.secret}\nALLOW_PRIVATE_IP_ADDRESS=true\n`, { mode: 0o600 });
  await chmod(envFile, 0o600);
  docker(['pull', image]);
  docker(['run', '-d', '--name', container, '--restart', 'unless-stopped', '--shm-size', '512m',
    '-p', '127.0.0.1:3085:80', '--env-file', envFile,
    '-v', 'omchor-office-data:/var/www/onlyoffice/Data',
    '-v', 'omchor-office-cache:/var/lib/onlyoffice',
    '-v', 'omchor-office-logs:/var/log/onlyoffice',
    '-v', '/usr/share/fonts:/usr/share/fonts/truetype/omchor-host:ro', image]);
}
console.log(`Local Office service started. Configuration: ${configPath}`);
