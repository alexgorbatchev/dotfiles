/**
 * Central plugin registration module.
 *
 * Importing this module has two effects:
 * 1. Runtime: Makes plugin packages available for dynamic import
 * 2. Compile-time: Loads TypeScript module augmentations from all plugins
 *
 * This ensures that both the CLI and tests get consistent plugin types.
 */

// Import all plugins to load their type augmentations
// These side-effect imports register the plugin types with TypeScript
import "@dotfiles/installer-brew";
import "@dotfiles/installer-cargo";
import "@dotfiles/installer-curl-script";
import "@dotfiles/installer-curl-tar";
import "@dotfiles/installer-dmg";
import "@dotfiles/installer-pkg";
import "@dotfiles/installer-gitea";
import "@dotfiles/installer-github";
import "@dotfiles/installer-manual";
