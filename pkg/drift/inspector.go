package drift

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/block"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// Item represents the drift status and diff for a single managed or declared artifact.
type Item struct {
	ToolName       string `json:"toolName"`
	FilePath       string `json:"filePath"`
	BlockID        string `json:"blockId,omitempty"`
	Type           string `json:"type"` // "symlink", "copy", "template", "block"
	State          State  `json:"state"`
	Diff           string `json:"diff,omitempty"`
	CurrentContent string `json:"currentContent,omitempty"`
	DesiredContent string `json:"desiredContent,omitempty"`
}

// Inspector evaluates the drift state of all declared files and blocks.
type Inspector struct {
	fs      fs.FS
	reg     *registry.Registry
	projCfg *config.ProjectConfig
}

// NewInspector creates a new drift inspector.
func NewInspector(fsys fs.FS, reg *registry.Registry, projCfg *config.ProjectConfig) *Inspector {
	return &Inspector{
		fs:      fsys,
		reg:     reg,
		projCfg: projCfg,
	}
}

// InspectTool inspects drift for a single tool configuration.
func (ins *Inspector) InspectTool(ctx context.Context, tool *config.ToolConfig) ([]Item, error) {
	var items []Item

	resolveTarget := func(target string) string {
		resolved, err := config.ResolvePathPlaceholders(target, tool.Name, ins.projCfg)
		if err != nil {
			resolved = target
		}
		if ins.projCfg != nil {
			resolved = utils.ExpandHomePath(ins.projCfg.Paths.HomeDir, resolved)
		}
		return resolved
	}

	resolveSource := func(source string) string {
		if ins.fs.IsAbs(source) || tool.ConfigFilePath == "" {
			return source
		}
		return filepath.Join(filepath.Dir(tool.ConfigFilePath), source)
	}

	// 1. Inspect Symlinks
	for _, sym := range tool.Symlinks {
		target := resolveTarget(sym.Target)
		source := resolveSource(sym.Source)

		recorded, _ := ins.reg.GetFileState(ctx, target)
		base := ""
		if recorded != nil && recorded.TargetPath != nil {
			base = *recorded.TargetPath
		}

		current := ""
		if isSym, _ := ins.isSymlink(target); isSym {
			if linkTarget, err := ins.fs.Readlink(target); err == nil {
				current = linkTarget
			}
		}

		desired := source
		state := StateInSync
		if current != desired {
			if current == "" {
				if base == "" {
					state = StateNew
				} else {
					state = StateMissing
				}
			} else if base == "" {
				state = StateUnmanaged
			} else if current == base {
				state = StateUpstreamUpdate
			} else if desired == base {
				state = StateLocalDrift
			} else {
				state = StateConflict
			}
		}

		diffText := ""
		if state != StateInSync {
			diffText = fmt.Sprintf("Symlink target: %s -> %s (expected -> %s)\n", target, current, desired)
		}

		items = append(items, Item{
			ToolName:       tool.Name,
			FilePath:       target,
			Type:           "symlink",
			State:          state,
			Diff:           diffText,
			CurrentContent: current,
			DesiredContent: desired,
		})
	}

	// 2. Inspect Templates
	for _, tmpl := range tool.Templates {
		target := resolveTarget(tmpl.Target)
		source := resolveSource(tmpl.Source)

		raw, err := ins.fs.ReadFile(source)
		desired := ""
		if err == nil {
			desired, _ = config.RenderTemplate(string(raw), tmpl.Variables, tool.Name, ins.projCfg)
		}

		currentData, err := ins.fs.ReadFile(target)
		current := ""
		currentExists := err == nil
		if currentExists {
			current = string(currentData)
		}

		recorded, _ := ins.reg.GetFileState(ctx, target)
		baseHash := ""
		if recorded != nil && recorded.ContentHash != nil {
			baseHash = *recorded.ContentHash
		}

		currentHash := ""
		if currentExists {
			currentHash = fs.HashContent([]byte(current))
		}
		desiredHash := fs.HashContent([]byte(desired))

		state := Evaluate(Versions{
			Base:    baseHash,
			Current: currentHash,
			Desired: desiredHash,
		})

		diffText := ""
		if state != StateInSync {
			diffText = UnifiedDiff(target+" (current)", target+" (desired)", current, desired)
		}

		items = append(items, Item{
			ToolName:       tool.Name,
			FilePath:       target,
			Type:           "template",
			State:          state,
			Diff:           diffText,
			CurrentContent: current,
			DesiredContent: desired,
		})
	}

	// 3. Inspect Blocks
	for _, blk := range tool.Blocks {
		target := resolveTarget(blk.Target)
		desiredBody := blk.Content

		currentContent := ""
		currentBlockBody := ""
		found := false
		if data, err := ins.fs.ReadFile(target); err == nil {
			currentContent = string(data)
			if reg, f, err := block.Find(currentContent, blk.ID); err == nil && f {
				found = true
				currentBlockBody = reg.Body
			}
		}

		recorded, _ := ins.reg.GetBlockState(ctx, target, blk.ID)
		baseHash := ""
		if recorded != nil && recorded.ContentHash != nil {
			baseHash = *recorded.ContentHash
		}

		currentHash := ""
		if found {
			currentHash = fs.HashContent([]byte(currentBlockBody))
		}
		desiredHash := fs.HashContent([]byte(desiredBody))

		state := Evaluate(Versions{
			Base:    baseHash,
			Current: currentHash,
			Desired: desiredHash,
		})

		diffText := ""
		if state != StateInSync {
			label := fmt.Sprintf("%s [%s]", target, blk.ID)
			diffText = UnifiedDiff(label+" (current)", label+" (desired)", currentBlockBody, desiredBody)
		}

		items = append(items, Item{
			ToolName:       tool.Name,
			FilePath:       target,
			BlockID:        blk.ID,
			Type:           "block",
			State:          state,
			Diff:           diffText,
			CurrentContent: currentBlockBody,
			DesiredContent: desiredBody,
		})
	}

	return items, nil
}

// InspectAll inspects all provided tools.
func (ins *Inspector) InspectAll(ctx context.Context, tools []*config.ToolConfig) ([]Item, error) {
	var all []Item
	for _, tool := range tools {
		if tool.Disabled {
			continue
		}
		items, err := ins.InspectTool(ctx, tool)
		if err != nil {
			return nil, err
		}
		all = append(all, items...)
	}
	return all, nil
}

func (ins *Inspector) isSymlink(path string) (bool, error) {
	info, err := ins.fs.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return info.Mode()&os.ModeSymlink != 0, nil
}
