import { spawn } from 'child_process';
import { getMcpServerPath, getPython } from '../lib/paths.js';

export interface McpOptions {
  http: boolean;
  port: number;
}

export function mcp(options: McpOptions): void {
  const serverPath = getMcpServerPath();
  const python     = getPython();

  const args = [serverPath];
  if (options.http)  args.push('--http');
  if (options.port)  args.push('--port', String(options.port));

  const child = spawn(python, args, {
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('error', (err) => {
    console.error(`\n  Failed to start MCP server: ${err.message}`);
    console.error(`  Python:  ${python}`);
    console.error(`  Server:  ${serverPath}`);
    console.error(`  Fix:     pip3 install mcp uvicorn\n`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
