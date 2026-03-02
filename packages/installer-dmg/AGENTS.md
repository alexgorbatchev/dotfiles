# @dotfiles/installer-dmg

DMG installer plugin for the dotfiles tool installer system. Downloads macOS .dmg disk images, mounts them, and copies .app bundles. Silently skips on non-macOS platforms. Shims are not supported — `.bin()` should not be used with this installer.
