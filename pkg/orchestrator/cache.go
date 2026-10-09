package orchestrator

import (
	"context"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// ClearDownloadCache removes archives for versions no longer installed, regardless
// of the automatic pruning policy or whether downloads are cached on this run.
func (o *Orchestrator) ClearDownloadCache(ctx context.Context, project *config.ProjectConfig) (downloader.PruneResult, error) {
	if project == nil || o.reg == nil {
		return downloader.PruneResult{}, fmt.Errorf("cache cleanup requires a project and installation registry")
	}
	if config.IsDryRunEnabled(ctx) {
		return downloader.PruneResult{}, nil
	}
	records, err := o.reg.GetAllToolInstallations(ctx)
	if err != nil {
		return downloader.PruneResult{}, fmt.Errorf("reading installed versions for cache cleanup: %w", err)
	}
	installed := make(map[string]string, len(records))
	for _, record := range records {
		installed[record.ToolName] = record.Version
	}
	d := downloader.NewDownloader(o.fs, nil)
	d.CacheDir = downloadSettings(project).CacheDir
	retention := installedCacheURLs(project, o.cacheTools, records)
	return d.Prune(ctx, installed, retention.keep)
}

func (o *Orchestrator) finishDownloadCache(ctx context.Context, tool string, session *downloader.CacheSession, project *config.ProjectConfig) {
	log := o.logger.WithTag(tool)
	record, err := o.recordedInstallation(ctx, tool)
	if err != nil || record == nil {
		log.Warn(logger.Message(fmt.Sprintf("Could not read installed version for cache ownership: %v", err)))
		return
	}
	if err := session.Commit(o.fs, tool, record.Version); err != nil {
		log.Warn(logger.Message(fmt.Sprintf("Could not record download cache ownership: %v", err)))
		return
	}
	if !downloader.PruningEnabled(ctx) {
		return
	}
	result, err := o.ClearDownloadCache(ctx, project)
	if err != nil {
		log.Warn(logger.Message(fmt.Sprintf("Could not prune download cache: %v", err)))
	} else if result.Entries > 0 {
		log.Info(logger.Message(fmt.Sprintf("Removed %d old cached downloads (%d bytes)", result.Entries, result.Bytes)))
	}
}
