package dashboard

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

type toolAction struct {
	Enabled bool   `json:"enabled"`
	Reason  string `json:"reason"`
}

type toolMetadata struct {
	Applicability    string      `json:"applicability"`
	Reason           string      `json:"reason"`
	Kind             string      `json:"kind"`
	RequestedVersion string      `json:"requestedVersion"`
	UpdateMode       string      `json:"updateMode"`
	Actions          toolActions `json:"actions"`
}

type toolActions struct {
	Install   toolAction `json:"install"`
	Check     toolAction `json:"check"`
	Update    toolAction `json:"update"`
	Reinstall toolAction `json:"reinstall"`
}

// toolMetadata describes the resolved configuration without running an installer
// or contacting upstream. Mutation handlers retain their existing semantics.
func (s *Server) toolMetadata(tool *config.ToolConfig, installed bool) toolMetadata {
	m := toolMetadata{Applicability: "active", Kind: "installable", UpdateMode: "update", RequestedVersion: tool.RequestedVersion()}
	if m.RequestedVersion == "" && tool.InstallationMethod != "" {
		m.RequestedVersion = "latest"
	}
	if tool.InstallationMethod == "" {
		m.Kind = "configuration-only"
		m.Reason = "Configuration only. There is no package to install or update; use state generate to apply declarations."
		if len(tool.Binaries) > 0 {
			m.Kind = "invalid"
			m.Reason = "Binaries are declared without an installation method. Review the tool configuration."
		}
	}
	switch {
	case tool.InstallationMethod == "" && len(tool.InactivePlatformConfigs) > 0 && !hasActiveDeclarations(tool):
		m.Applicability, m.Reason = "inactive-platform", "No declarations apply to the platform and architecture selected when this dashboard started."
	case tool.Disabled:
		m.Applicability, m.Reason = "disabled", "Disabled in the tool configuration."
	case tool.Hostname != "" && !config.MatchesHostname(tool.Hostname):
		m.Applicability, m.Reason = "different-host", fmt.Sprintf("Configured for host %s, not this host.", tool.Hostname)
	}
	blocked := m.Reason
	if blocked == "" {
		if s.installers == nil {
			blocked = "Installer registry is unavailable."
		} else if _, err := s.installers.Get(tool.InstallationMethod); err != nil {
			blocked = err.Error()
		}
	}
	if blocked != "" {
		a := toolAction{Reason: blocked}
		m.Actions = toolActions{Install: a, Check: a, Update: a, Reinstall: a}
		return m
	}
	m.Actions.Install = toolAction{Enabled: !installed}
	m.Actions.Reinstall = toolAction{Enabled: installed}
	m.Actions.Check = toolAction{Enabled: installed}
	m.Actions.Update = toolAction{Enabled: installed}
	if !installed {
		m.Actions.Check.Reason, m.Actions.Update.Reason, m.Actions.Reinstall.Reason = "Install this tool first.", "Install this tool first.", "Install this tool first."
	} else {
		m.Actions.Install.Reason = "Already installed. Reinstall is available under More actions."
	}
	if reason := unsupportedUpdateReason(tool); reason != "" {
		m.UpdateMode = "reinstall"
		m.Actions.Check = toolAction{Reason: reason}
		m.Actions.Update.Reason = reason + " Updating runs the installer again without comparing versions."
	}
	if !tool.UpdateCheckEnabled() {
		reason := "Update checks are disabled by updateCheck.enabled in the tool configuration."
		m.Actions.Check, m.Actions.Update = toolAction{Reason: reason}, toolAction{Reason: reason}
	} else if reason, refused := tool.UpdateRefusal(); refused {
		m.Actions.Update = toolAction{Reason: reason}
	}
	return m
}

func hasActiveDeclarations(tool *config.ToolConfig) bool {
	shell := tool.ShellConfigs
	hasShell := shell != nil && (shell.Zsh != nil || shell.Bash != nil || shell.Powershell != nil)
	return len(tool.Binaries) > 0 || hasShell || len(tool.Symlinks) > 0 || len(tool.Copies) > 0 ||
		len(tool.Directories) > 0 || len(tool.Blocks) > 0 || len(tool.Templates) > 0
}

// These methods have explicitly unsupported CheckUpdate implementations. Keep
// this presentation policy pinned to their behavior with installer contract tests.
func unsupportedUpdateReason(tool *config.ToolConfig) string {
	switch tool.InstallationMethod {
	case "manual", "curl-binary", "curl-tar", "curl-script", "zsh-plugin":
		return fmt.Sprintf("%s cannot check for a newer upstream version.", tool.InstallationMethod)
	case "dmg", "pkg":
		source, _ := tool.InstallParams["source"].(map[string]any)
		if source != nil {
			if url, _ := source["url"].(string); source["type"] != "github-release" && url != "" {
				return "A direct download URL cannot report a newer upstream version."
			}
		} else if url, _ := tool.InstallParams["url"].(string); url != "" {
			return "A direct download URL cannot report a newer upstream version."
		}
	}
	return ""
}
