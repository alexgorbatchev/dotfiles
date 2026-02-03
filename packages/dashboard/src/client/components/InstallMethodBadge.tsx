import {
  Box,
  Download,
  FileCode,
  GitBranch,
  Package,
  Terminal,
  Wrench,
} from 'lucide-preact';
import { type JSX } from 'preact';

import { Badge } from './ui/Badge';

interface InstallMethodBadgeProps {
  method: string;
}

const methodIcons: Record<string, JSX.Element> = {
  'github-release': <GitBranch class='h-3 w-3' />,
  'homebrew': <Package class='h-3 w-3' />,
  'brew': <Package class='h-3 w-3' />,
  'cargo': <Box class='h-3 w-3' />,
  'curl-tar': <Download class='h-3 w-3' />,
  'curl-script': <FileCode class='h-3 w-3' />,
  'zsh-plugin': <Terminal class='h-3 w-3' />,
  'manual': <Wrench class='h-3 w-3' />,
};

export function InstallMethodBadge({ method }: InstallMethodBadgeProps): JSX.Element {
  const icon = methodIcons[method] || <Package class='h-3 w-3' />;

  return (
    <Badge variant='outline' class='gap-1'>
      {icon}
      {method}
    </Badge>
  );
}
