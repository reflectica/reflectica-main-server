const tls = require('tls');

describe('TLS Configuration', () => {
  it('should enforce TLS minimum version 1.2', () => {
    expect(tls.DEFAULT_MIN_VERSION).toBe('TLSv1.2');
  });

  it('should not allow TLS 1.1 or lower', () => {
    expect(tls.DEFAULT_MIN_VERSION).not.toBe('TLSv1.1');
    expect(tls.DEFAULT_MIN_VERSION).not.toBe('TLSv1.0');
  });
});