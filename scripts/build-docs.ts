import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outDir = join(process.cwd(), "public");
await mkdir(outDir, { recursive: true });

// Copy install.sh
await copyFile(join(process.cwd(), "scripts/managed-installer/install.sh"), join(outDir, "install.sh"));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>@alexgorbatchev/dotfiles - Declarative Dotfiles &amp; Tool Manager</title>
  <meta name="description" content="Automated local dotfiles, tool installations, and shell configurations across macOS, Linux, and Windows.">
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --accent-green: #3fb950;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem 1rem;
      max-width: 900px;
      margin: 0 auto;
    }
    header {
      text-align: center;
      margin-bottom: 3rem;
      padding-top: 2rem;
    }
    h1 {
      font-size: 2.5rem;
      color: #f0f6fc;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      font-size: 1.2rem;
      color: var(--text-muted);
      margin-bottom: 2rem;
    }
    .install-box {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin: 2rem 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      overflow-x: auto;
    }
    .install-box code {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.95rem;
      color: #f0f6fc;
      white-space: nowrap;
    }
    .install-box button {
      background: #238636;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 0.5rem 1rem;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.2s;
    }
    .install-box button:hover {
      background: #2ea043;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin: 3rem 0;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
    }
    .card h3 {
      color: #f0f6fc;
      margin-bottom: 0.5rem;
      font-size: 1.1rem;
    }
    .card p {
      font-size: 0.95rem;
      color: var(--text-muted);
    }
    .code-block {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin: 2rem 0;
      overflow-x: auto;
    }
    .code-block pre {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.9rem;
      color: #e6edf3;
    }
    .links {
      display: flex;
      justify-content: center;
      gap: 1.5rem;
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
    }
    .links a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 500;
    }
    .links a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <header>
    <h1>@alexgorbatchev/dotfiles</h1>
    <p class="subtitle">Declarative, versioned dotfiles management with generated shims and zero-overhead shell startup.</p>
    
    <div class="install-box">
      <code id="cmd">curl -fsSL https://alexgorbatchev.github.io/dotfiles/install.sh | bash</code>
      <button onclick="copyCmd()">Copy</button>
    </div>
  </header>

  <section class="features">
    <div class="card">
      <h3>🚀 On-Demand Installation</h3>
      <p>Tools install automatically the first time you run them. No manual pre-install steps required.</p>
    </div>
    <div class="card">
      <h3>⚙️ Declarative TypeScript</h3>
      <p>Define tools, versions, binaries, symlinks, and shell aliases in type-safe <code>.tool.ts</code> files.</p>
    </div>
    <div class="card">
      <h3>⚡ Zero Startup Overhead</h3>
      <p>Your shell startup remains instant. Tool loading is deferred until execution time.</p>
    </div>
    <div class="card">
      <h3>🌐 Cross-Platform</h3>
      <p>Native Go implementation compiled for macOS (x64/arm64) and Linux (x64/arm64).</p>
    </div>
  </section>

  <h2>Example Tool Definition</h2>
  <div class="code-block">
    <pre><code>import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =&gt;
  install("github-release", {
    repo: "BurntSushi/ripgrep",
  })
    .bin("rg")
    .symlink("./ripgreprc", "~/.ripgreprc")
    .zsh((shell) =&gt;
      shell
        .path("\${ctx.currentDir}/bin")
        .env({ RIPGREP_CONFIG_PATH: "~/.ripgreprc" })
        .aliases({ rgi: "rg -i" })
    ),
);</code></pre>
  </div>

  <footer class="links">
    <a href="https://github.com/alexgorbatchev/dotfiles" target="_blank" rel="noopener">GitHub Repository</a>
    <a href="https://github.com/alexgorbatchev/dotfiles/blob/main/README.md" target="_blank" rel="noopener">README &amp; Documentation</a>
    <a href="https://github.com/alexgorbatchev/dotfiles/blob/main/.agents/skills/dotfiles/references/getting-started/cli-reference.md" target="_blank" rel="noopener">CLI Reference</a>
  </footer>

  <script>
    function copyCmd() {
      const text = document.getElementById("cmd").innerText;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector(".install-box button");
        btn.innerText = "Copied!";
        setTimeout(() => btn.innerText = "Copy", 2000);
      });
    }
  </script>
</body>
</html>
`;

await writeFile(join(outDir, "index.html"), html, "utf-8");
process.stdout.write("✅ Docs built to public/ (index.html & install.sh)\n");
