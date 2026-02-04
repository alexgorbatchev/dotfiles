// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from '../../../../testing/ui-setup';

import { describe, expect, test } from 'bun:test';

setupUITests();

import { Badge } from '../Badge';

describe('Badge', () => {
  test('renders children', () => {
    render(<Badge>Test Badge</Badge>);

    expect(screen.getByText('Test Badge')).toBeInTheDocument();
  });

  test('applies default variant styles', () => {
    render(<Badge>Default</Badge>);

    const badge = screen.getByText('Default');
    expect(badge).toHaveClass('bg-primary');
  });

  test('applies secondary variant styles', () => {
    render(<Badge variant='secondary'>Secondary</Badge>);

    const badge = screen.getByText('Secondary');
    expect(badge).toHaveClass('bg-secondary');
  });

  test('applies destructive variant styles', () => {
    render(<Badge variant='destructive'>Destructive</Badge>);

    const badge = screen.getByText('Destructive');
    expect(badge).toHaveClass('bg-destructive');
  });

  test('applies outline variant styles', () => {
    render(<Badge variant='outline'>Outline</Badge>);

    const badge = screen.getByText('Outline');
    expect(badge).toHaveClass('text-foreground');
  });

  test('applies success variant styles', () => {
    render(<Badge variant='success'>Success</Badge>);

    const badge = screen.getByText('Success');
    expect(badge).toHaveClass('bg-green-500/20');
    expect(badge).toHaveClass('text-green-500');
  });

  test('applies warning variant styles', () => {
    render(<Badge variant='warning'>Warning</Badge>);

    const badge = screen.getByText('Warning');
    expect(badge).toHaveClass('bg-yellow-500/20');
    expect(badge).toHaveClass('text-yellow-400');
  });

  test('applies error variant styles', () => {
    render(<Badge variant='error'>Error</Badge>);

    const badge = screen.getByText('Error');
    expect(badge).toHaveClass('bg-red-500/20');
    expect(badge).toHaveClass('text-red-400');
  });

  test('merges custom className', () => {
    render(<Badge class='custom-class'>Custom</Badge>);

    const badge = screen.getByText('Custom');
    expect(badge).toHaveClass('custom-class');
  });

  test('passes additional props to element', () => {
    render(<Badge data-testid='badge-element'>Props Test</Badge>);

    expect(screen.getByTestId('badge-element')).toBeInTheDocument();
  });
});
