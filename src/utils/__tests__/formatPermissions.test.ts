import { formatPermissions } from '../formatPermissions';
import { describe, expect, it } from 'bun:test';

describe('formatPermissions', () => {
  it('should format octal number correctly', () => {
    expect(formatPermissions(0o755)).toBe('rwxr-xr-x');
    expect(formatPermissions(0o644)).toBe('rw-r--r--');
    expect(formatPermissions(0o600)).toBe('rw-------');
    expect(formatPermissions(0o777)).toBe('rwxrwxrwx');
  });

  it('should format decimal number correctly', () => {
    expect(formatPermissions(493)).toBe('rwxr-xr-x'); // 493 decimal = 755 octal
    expect(formatPermissions(420)).toBe('rw-r--r--'); // 420 decimal = 644 octal
  });

  it('should format string correctly', () => {
    expect(formatPermissions('755')).toBe('rwxr-xr-x');
    expect(formatPermissions('644')).toBe('rw-r--r--');
  });
});