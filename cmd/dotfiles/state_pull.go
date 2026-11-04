package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	osexec "os/exec"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	execRunner "github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/spf13/cobra"
)

const statePullLong = `Update the configuration from its git repository, then regenerate.

The repository is the one the configuration file lives in, after following symlinks.
Its current branch is fast-forwarded to its upstream branch, and then everything
"state generate" does runs against the updated configuration.

The pull never merges or rebases. Diverged history (local commits while the upstream
branch also moved on), uncommitted changes the update would overwrite, a detached HEAD,
or a branch with no upstream stop the command before anything is generated. A branch
that is only ahead of its upstream is left as it is and generation still runs. A
configuration that is not inside a git repository is an error.

With --dry-run nothing is pulled, and generation is simulated against the current
checkout.`

var statePullCmd = &cobra.Command{
	Use:   "pull",
	Args:  cobra.NoArgs,
	Short: "Update the configuration from its git repository, then regenerate",
	Long:  statePullLong,
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := pullConfigRepository(cmd); err != nil {
			return err
		}
		return generateState(cmd)
	},
}

// pullConfigRepository fast-forwards the git repository holding the configuration
// file. It runs before the configuration is loaded, so the generation that follows
// reads the pulled files rather than the ones on disk when the command started.
func pullConfigRepository(cmd *cobra.Command) error {
	ctx := cmd.Context()
	log := GetLogger("pull", cmd.ErrOrStderr())

	configPath, err := resolveConfigPath(cfgFile)
	if err != nil {
		return err
	}
	// A configuration symlinked from elsewhere (~/.dotfiles.config.ts pointing into a
	// checkout) belongs to the repository its target is in.
	realPath, err := filepath.EvalSymlinks(configPath)
	if err != nil {
		return fmt.Errorf("reading configuration file %s: %w", displayPath(configPath), pathErrorCause(err))
	}

	runner := execRunner.NewOSRunner()
	repoDir, err := gitRepositoryRoot(ctx, runner, filepath.Dir(realPath))
	if err != nil {
		return fmt.Errorf("finding the git repository of %s: %w", displayPath(realPath), err)
	}

	if config.IsDryRunEnabled(ctx) {
		log.Info(logger.Message(fmt.Sprintf("Dry run: not pulling %s; generating from the current checkout", displayPath(repoDir))))
		return nil
	}

	log.Info(logger.Message(fmt.Sprintf("Pulling %s...", displayPath(repoDir))))
	// --ff-only refuses to create a merge commit, and --no-rebase keeps a configured
	// pull.rebase from rewriting local commits instead: when the branch cannot simply
	// move forward the pull fails, and the user decides how to reconcile.
	//
	// git runs in the terminal's foreground process group with no timeout, so that a
	// credential or SSH passphrase prompt can read the terminal and Ctrl-C reaches git.
	// A separate process group would stop git with SIGTTIN on the first prompt.
	pull := runner.CommandContext(ctx, "git", "-C", repoDir, "pull", "--ff-only", "--no-rebase")
	out := logger.NewLineWriter(log, "|")
	pull.SetStdout(out)
	pull.SetStderr(out)
	err = pull.Run()
	out.Flush()
	if err != nil {
		return fmt.Errorf("pulling %s: %w", displayPath(repoDir), err)
	}
	return nil
}

// gitRepositoryRoot returns the top-level directory of the git work tree containing
// dir. When dir is in no work tree, or git cannot answer, the error carries git's own
// explanation.
func gitRepositoryRoot(ctx context.Context, runner execRunner.CommandRunner, dir string) (string, error) {
	out, err := runner.CommandContext(ctx, "git", "-C", dir, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		var exitErr *osexec.ExitError
		if errors.As(err, &exitErr) && len(exitErr.Stderr) > 0 {
			return "", errors.New(strings.TrimSpace(string(exitErr.Stderr)))
		}
		return "", fmt.Errorf("running git: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// displayPath shows path with the user's home directory folded to ~.
func displayPath(path string) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return path
	}
	return utils.ContractHomePath(home, path)
}

// pathErrorCause drops the path an *os.PathError repeats, so a message that already
// names the file with displayPath does not print it a second time unfolded.
func pathErrorCause(err error) error {
	var pathErr *os.PathError
	if errors.As(err, &pathErr) {
		return pathErr.Err
	}
	return err
}

func init() {
	statePullCmd.Flags().BoolVar(&overwrite, "overwrite", false, overwriteUsage)
}
