import { describe, expect, it } from 'bun:test';
import { BlockBuilder } from '../../blocks/BlockBuilder';
import {
  alias,
  completion,
  environment,
  fn,
  path,
  script,
  sourceFile,
  sourceFunction,
  withSource,
} from '../../emissions/factories';
import type { Block } from '../../types';
import { BlockRenderer } from '../BlockRenderer';
import { SectionPriority } from '../constants';
import { MockFormatter } from './helpers/mocks';

describe('BlockRenderer', () => {
  const renderer = new BlockRenderer();
  const formatter = new MockFormatter();

  describe('render', () => {
    it('renders empty blocks array', () => {
      const result = renderer.render([], formatter);

      expect(result).toMatchInlineSnapshot(`
        {
          "content": "",
          "fileExtension": ".mock",
          "onceScripts": [],
        }
      `);
    });

    it('renders file header and footer', () => {
      const blocks: Block[] = [
        { id: 'header', priority: SectionPriority.FileHeader, emissions: [], isFileHeader: true },
        { id: 'footer', priority: SectionPriority.FileFooter, emissions: [], isFileFooter: true },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# AUTO-GENERATED FILE - DO NOT EDIT

        # END OF FILE"
      `);
    });

    it('renders section with emissions', () => {
      const blocks: Block[] = [
        {
          id: 'env',
          title: 'Environment',
          priority: SectionPriority.Path,
          emissions: [environment({ NODE_ENV: 'production', DEBUG: 'false' })],
        },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# === Environment ===
        export NODE_ENV="production"
        export DEBUG="false""
      `);
    });

    it('renders multiple sections sorted by priority', () => {
      const blocks: Block[] = [
        {
          id: 'env',
          title: 'Environment',
          priority: SectionPriority.Environment,
          emissions: [environment({ NODE_ENV: 'production' })],
        },
        {
          id: 'path',
          title: 'PATH',
          priority: SectionPriority.Path,
          emissions: [path('/usr/local/bin')],
        },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# === PATH ===
        [[ ":$PATH:" != *":/usr/local/bin:"* ]] && export PATH="/usr/local/bin:$PATH"

        # === Environment ===
        export NODE_ENV="production""
      `);
    });

    it('renders child blocks', () => {
      const blocks: Block[] = [
        {
          id: 'main',
          title: 'Initializations',
          priority: SectionPriority.MainContent,
          emissions: [],
          children: [
            {
              id: 'node',
              title: 'node',
              priority: SectionPriority.FileHeader,
              emissions: [
                fn('initNode', 'eval "$(fnm env)"'),
                sourceFunction('initNode'),
              ],
            },
          ],
        },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# === Initializations ===

        # --- node ---
        initNode() {
          eval "$(fnm env)"
        }
        source <(initNode)"
      `);
    });

    it('renders source comments when source changes', () => {
      const blocks: Block[] = [
        {
          id: 'env',
          title: 'Environment',
          priority: SectionPriority.Path,
          emissions: [
            withSource(environment({ VAR1: 'a' }), '/config/a.ts'),
            withSource(environment({ VAR2: 'b' }), '/config/a.ts'),
            withSource(environment({ VAR3: 'c' }), '/config/b.ts'),
          ],
        },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# === Environment ===
        # /config/a.ts
        export VAR1="a"
        export VAR2="b"
        # /config/b.ts
        export VAR3="c""
      `);
    });

    it('skips empty sections', () => {
      const blocks: Block[] = [
        { id: 'empty', title: 'Empty Section', priority: SectionPriority.Path, emissions: [] },
        {
          id: 'env',
          title: 'Environment',
          priority: SectionPriority.Environment,
          emissions: [environment({ VAR: 'value' })],
        },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# === Environment ===
        export VAR="value""
      `);
    });

    it('skips empty child blocks', () => {
      const blocks: Block[] = [
        {
          id: 'main',
          title: 'Main',
          priority: SectionPriority.Path,
          emissions: [],
          children: [
            { id: 'empty', title: 'empty', priority: SectionPriority.FileHeader, emissions: [] },
            {
              id: 'filled',
              title: 'filled',
              priority: 1,
              emissions: [fn('test', 'echo')],
            },
          ],
        },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# === Main ===

        # --- filled ---
        test() {
          echo
        }"
      `);
    });

    it('renders source comments in child blocks when source changes', () => {
      const blocks: Block[] = [
        {
          id: 'main',
          title: 'Initializations',
          priority: SectionPriority.MainContent,
          emissions: [],
          children: [
            {
              id: 'tools',
              title: 'tools',
              priority: SectionPriority.FileHeader,
              emissions: [
                withSource(fn('initA', 'echo A'), '/config/a.ts'),
                withSource(fn('initB', 'echo B'), '/config/a.ts'),
                withSource(fn('initC', 'echo C'), '/config/b.ts'),
              ],
            },
          ],
        },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# === Initializations ===

        # --- tools ---
        # /config/a.ts
        initA() {
          echo A
        }
        initB() {
          echo B
        }
        # /config/b.ts
        initC() {
          echo C
        }"
      `);
    });

    it('handles once scripts in child blocks', () => {
      const blocks: Block[] = [
        {
          id: 'main',
          title: 'Main',
          priority: SectionPriority.MainContent,
          emissions: [],
          children: [
            {
              id: 'setup',
              title: 'setup',
              priority: SectionPriority.FileHeader,
              emissions: [
                withSource(script('echo "child once"', 'once'), '/child-config.ts'),
              ],
            },
          ],
        },
        { id: 'footer', priority: SectionPriority.FileFooter, emissions: [], isFileFooter: true },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# === Main ===

        # --- setup ---
        # /child-config.ts

        # Execute once scripts
        for script in "$ONCE_DIR"/*.mock; do
          [[ -x "$script" ]] && source "$script"
        done

        # END OF FILE"
      `);

      expect(result.onceScripts).toMatchInlineSnapshot(`
        [
          {
            "content": 
        "#!/bin/mock
        echo "child once"
        rm -f "$0""
        ,
            "executable": true,
            "filename": "-child-config.ts-001.mock",
          },
        ]
      `);
    });

    it('renders all emission types', () => {
      const blocks: Block[] = [
        {
          id: 'all-types',
          title: 'All Types',
          priority: SectionPriority.Path,
          emissions: [
            environment({ VAR: 'value' }),
            alias({ ll: 'ls -la' }),
            fn('greet', 'echo "Hello"'),
            fn('setup', 'mkdir $HOME/.config'),
            script('echo "startup"', 'always'),
            script('echo "raw"', 'raw'),
            sourceFile('$HOME/.rc'),
            sourceFile('$HOME/.config/init'),
            sourceFunction('initTool'),
            completion({ directories: ['$HOME/.completions'], commands: ['node'] }),
            path('/usr/local/bin'),
            path('/opt/bin', { position: 'append', deduplicate: false }),
          ],
        },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# === All Types ===
        export VAR="value"
        alias ll="ls -la"
        greet() {
          echo "Hello"
        }
        setup() {
          mkdir $HOME/.config
        }
        echo "startup"
        echo "raw"
        source "$HOME/.rc"
        source "$HOME/.config/init"
        source <(initTool)
        fpath=($HOME/.completions $fpath)
        autoload -Uz compinit && compinit
        [[ ":$PATH:" != *":/usr/local/bin:"* ]] && export PATH="/usr/local/bin:$PATH"
        export PATH="$PATH:/opt/bin""
      `);
    });
  });

  describe('once script handling', () => {
    it('collects once scripts and inserts initializer', () => {
      const blocks: Block[] = [
        { id: 'header', priority: SectionPriority.FileHeader, emissions: [], isFileHeader: true },
        {
          id: 'main',
          title: 'Main',
          priority: SectionPriority.MainContent,
          emissions: [
            withSource(script('echo "one-time setup"', 'once'), '/config.ts'),
          ],
        },
        {
          id: 'completions',
          title: 'Completions',
          priority: SectionPriority.Completions,
          emissions: [completion({ commands: ['node'] })],
        },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# AUTO-GENERATED FILE - DO NOT EDIT

        # === Main ===
        # /config.ts

        # Execute once scripts
        for script in "$ONCE_DIR"/*.mock; do
          [[ -x "$script" ]] && source "$script"
        done

        # === Completions ===
        autoload -Uz compinit && compinit"
      `);

      expect(result.onceScripts).toMatchInlineSnapshot(`
        [
          {
            "content": 
        "#!/bin/mock
        echo "one-time setup"
        rm -f "$0""
        ,
            "executable": true,
            "filename": "-config.ts-001.mock",
          },
        ]
      `);
    });

    it('handles multiple once scripts', () => {
      const blocks: Block[] = [
        {
          id: 'main',
          title: 'Main',
          priority: SectionPriority.MainContent,
          emissions: [
            script('echo "first"', 'once'),
            script('echo "second"', 'once'),
          ],
        },
        { id: 'footer', priority: SectionPriority.FileFooter, emissions: [], isFileFooter: true },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.onceScripts).toMatchInlineSnapshot(`
        [
          {
            "content": 
        "#!/bin/mock
        echo "first"
        rm -f "$0""
        ,
            "executable": true,
            "filename": "once-001.mock",
          },
          {
            "content": 
        "#!/bin/mock
        echo "second"
        rm -f "$0""
        ,
            "executable": true,
            "filename": "once-002.mock",
          },
        ]
      `);
    });

    it('returns empty onceScripts when no once scripts exist', () => {
      const blocks: Block[] = [
        {
          id: 'main',
          title: 'Main',
          priority: SectionPriority.MainContent,
          emissions: [script('echo "always"', 'always')],
        },
      ];

      const result = renderer.render(blocks, formatter);

      expect(result.onceScripts).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('integration with BlockBuilder', () => {
    it('renders a complete configuration', () => {
      const builder = new BlockBuilder()
        .addSection('header', { priority: SectionPriority.FileHeader, isFileHeader: true })
        .addSection('path', { title: 'PATH', priority: SectionPriority.Path, hoistKinds: ['path'] })
        .addSection('env', {
          title: 'Environment',
          priority: SectionPriority.Environment,
          hoistKinds: ['environment'],
        })
        .addSection('main', { title: 'Initializations', priority: SectionPriority.MainContent, allowChildren: true })
        .addSection('completions', {
          title: 'Completions',
          priority: SectionPriority.Completions,
          hoistKinds: ['completion'],
        })
        .addSection('footer', { priority: SectionPriority.FileFooter, isFileFooter: true });

      builder
        .addEmission(path('/usr/local/bin'))
        .addEmission(environment({ NODE_ENV: 'production' }))
        .addEmission(fn('initNode', 'eval "$(fnm env)"'), 'node')
        .addEmission(sourceFunction('initNode'), 'node')
        .addEmission(completion({ commands: ['node'] }));

      const blocks = builder.build();
      const result = renderer.render(blocks, formatter);

      expect(result.content).toMatchInlineSnapshot(`
        "# AUTO-GENERATED FILE - DO NOT EDIT

        # === PATH ===
        [[ ":$PATH:" != *":/usr/local/bin:"* ]] && export PATH="/usr/local/bin:$PATH"

        # === Environment ===
        export NODE_ENV="production"

        # === Initializations ===

        # --- node ---
        initNode() {
          eval "$(fnm env)"
        }
        source <(initNode)

        # === Completions ===
        autoload -Uz compinit && compinit

        # END OF FILE"
      `);
    });
  });
});
