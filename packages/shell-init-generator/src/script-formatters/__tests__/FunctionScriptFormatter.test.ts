import { describe, expect, it } from 'bun:test';
import { FunctionScriptFormatter } from '../FunctionScriptFormatter';

describe('FunctionScriptFormatter', () => {
  const HOME_DIR = '/home/test/.dotfiles';

  describe('zsh', () => {
    it('should format a simple function with HOME override', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);
      const result = formatter.format('myfunction', 'echo "hello"', 'zsh');

      expect(result.content).toContain('myfunction() {');
      expect(result.content).toContain(`HOME="${HOME_DIR}"`);
      expect(result.content).toContain('echo "hello"');
      expect(result.content).toContain('}');
    });

    it('should wrap function body in subshell', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);
      const result = formatter.format('testfunc', 'export VAR=value', 'zsh');

      // Check that the function body is in a subshell
      expect(result.content).toContain('(');
      expect(result.content).toMatch(/\(\s+HOME=/);
    });

    it('should handle multi-line function bodies', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);
      const multiLineBody = `
        cd /some/path
        source ./setup.sh
        ./run-command
      `;
      const result = formatter.format('setup', multiLineBody, 'zsh');

      expect(result.content).toContain('cd /some/path');
      expect(result.content).toContain('source ./setup.sh');
      expect(result.content).toContain('./run-command');
    });
  });

  describe('bash', () => {
    it('should format a simple function with HOME override', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);
      const result = formatter.format('myfunction', 'echo "hello"', 'bash');

      expect(result.content).toContain('myfunction() {');
      expect(result.content).toContain(`HOME="${HOME_DIR}"`);
      expect(result.content).toContain('echo "hello"');
      expect(result.content).toContain('}');
    });

    it('should wrap function body in subshell', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);
      const result = formatter.format('testfunc', 'export VAR=value', 'bash');

      // Check that the function body is in a subshell
      expect(result.content).toContain('(');
      expect(result.content).toMatch(/\(\s+HOME=/);
    });
  });

  describe('powershell', () => {
    it('should format a function with HOME override using try-finally', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);
      const result = formatter.format('myfunction', 'Write-Host "hello"', 'powershell');

      expect(result.content).toContain('function myfunction {');
      expect(result.content).toContain('$homeOrig = $env:HOME');
      expect(result.content).toContain('$userProfileOrig = $env:USERPROFILE');
      expect(result.content).toContain('try {');
      expect(result.content).toContain(`$env:HOME = "${HOME_DIR}"`);
      expect(result.content).toContain(`$env:USERPROFILE = "${HOME_DIR}"`);
      expect(result.content).toContain('Write-Host "hello"');
      expect(result.content).toContain('finally {');
      expect(result.content).toContain('$env:HOME = $homeOrig');
      expect(result.content).toContain('$env:USERPROFILE = $userProfileOrig');
    });

    it('should clean up temporary variables in finally block', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);
      const result = formatter.format('cleanup', 'Get-Item .', 'powershell');

      expect(result.content).toContain("Remove-Variable -Name 'homeOrig' -ErrorAction SilentlyContinue");
      expect(result.content).toContain("Remove-Variable -Name 'userProfileOrig' -ErrorAction SilentlyContinue");
    });
  });

  describe('unsupported shell types', () => {
    it('should throw an error for unsupported shell types', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);

      expect(() => {
        formatter.format('func', 'body', 'fish' as 'zsh');
      }).toThrow('Unsupported shell type: fish');
    });
  });

  describe('function name validation', () => {
    it('should accept valid function names', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);

      expect(() => formatter.format('myfunction', 'echo test', 'zsh')).not.toThrow();
      expect(() => formatter.format('my_function', 'echo test', 'zsh')).not.toThrow();
      expect(() => formatter.format('_private', 'echo test', 'zsh')).not.toThrow();
      expect(() => formatter.format('func123', 'echo test', 'zsh')).not.toThrow();
      expect(() => formatter.format('my-func', 'echo test', 'zsh')).not.toThrow();
      expect(() => formatter.format('My_Func-2', 'echo test', 'zsh')).not.toThrow();
    });

    it('should reject empty function names', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);

      expect(() => formatter.format('', 'echo test', 'zsh')).toThrow('Function name cannot be empty');
    });

    it('should reject function names starting with a number', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);

      expect(() => formatter.format('123func', 'echo test', 'zsh')).toThrow('Invalid function name: "123func"');
    });

    it('should reject function names with spaces', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);

      expect(() => formatter.format('my function', 'echo test', 'zsh')).toThrow('Invalid function name: "my function"');
    });

    it('should reject function names with special characters', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);

      expect(() => formatter.format('func!', 'echo test', 'zsh')).toThrow('Invalid function name: "func!"');
      expect(() => formatter.format('func$var', 'echo test', 'zsh')).toThrow('Invalid function name: "func$var"');
      expect(() => formatter.format('func()', 'echo test', 'zsh')).toThrow('Invalid function name: "func()"');
      expect(() => formatter.format('func;rm', 'echo test', 'zsh')).toThrow('Invalid function name: "func;rm"');
    });

    it('should reject function names starting with a hyphen', () => {
      const formatter = new FunctionScriptFormatter(HOME_DIR);

      expect(() => formatter.format('-func', 'echo test', 'zsh')).toThrow('Invalid function name: "-func"');
    });
  });
});
