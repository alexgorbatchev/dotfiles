import type { AsyncConfigureTool } from '@types';

/**
 * Test tool configuration that demonstrates shell-specific initialization code.
 * Creates a simple "hello" function for each shell type.
 */
const configure: AsyncConfigureTool = async (c) => {
  // Zsh hello world function
  c.zsh(`
    # Hello World function for Zsh
    hello() {
      echo "Hello World from Zsh! 🐚"
      echo "Current shell: $0"
      echo "Zsh version: $ZSH_VERSION"
    }
  `);

  // Bash hello world function  
  c.bash(`
    # Hello World function for Bash
    hello() {
      echo "Hello World from Bash! 🐚"
      echo "Current shell: $0"
      echo "Bash version: $BASH_VERSION"
    }
  `);

  // PowerShell hello world function
  c.powershell(`
    # Hello World function for PowerShell
    function hello {
      Write-Host "Hello World from PowerShell! 🐚" -ForegroundColor Green
      Write-Host "Current shell: PowerShell"
      Write-Host "PowerShell version: $($PSVersionTable.PSVersion)"
    }
  `);
};

export default configure;