package installer

import "github.com/alexgorbatchev/dotfiles/pkg/config"

// packageForUninstall prefers the identity recorded by Install. A caller with no
// installation identity must supply a real tool configuration, never a guessed one.
func packageForUninstall(tool *config.ToolConfig, installed Installation, nameKey string) PackageIdentity {
	if installed.Package != nil {
		return *installed.Package
	}
	name := getStringParam(tool.InstallParams, nameKey, tool.Name)
	if name == "" {
		name = tool.Name
	}
	return PackageIdentity{
		Name:    name,
		Manager: getStringParam(tool.InstallParams, "packageManager", "npm"),
		Cask:    getBoolParam(tool.InstallParams, "cask", false),
		Sudo:    tool.Sudo,
	}
}
