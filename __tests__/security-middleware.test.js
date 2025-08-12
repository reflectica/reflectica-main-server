const request = require('supertest');
const express = require('express');
const { enforceHTTPS, setHSTSHeaders } = require('../utils/security-middleware');

describe('Security Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.set('trust proxy', true);
    // Reset environment variables
    delete process.env.NODE_ENV;
    delete process.env.ENFORCE_HTTPS;
    delete process.env.HSTS_MAX_AGE;
    delete process.env.HSTS_INCLUDE_SUBDOMAINS;
    delete process.env.HSTS_PRELOAD;
  });

  describe('enforceHTTPS middleware', () => {
    beforeEach(() => {
      app.use(enforceHTTPS);
      app.get('/test', (req, res) => res.send('OK'));
    });

    it('should allow HTTP requests in development environment', async () => {
      process.env.NODE_ENV = 'development';
      
      const res = await request(app)
        .get('/test')
        .expect(200);
      
      expect(res.text).toBe('OK');
    });

    it('should redirect HTTP to HTTPS in production environment', async () => {
      process.env.NODE_ENV = 'production';
      
      const res = await request(app)
        .get('/test')
        .set('Host', 'example.com')
        .expect(301);
      
      expect(res.headers.location).toBe('https://example.com/test');
    });

    it('should redirect HTTP to HTTPS when ENFORCE_HTTPS is true', async () => {
      process.env.ENFORCE_HTTPS = 'true';
      
      const res = await request(app)
        .get('/test')
        .set('Host', 'example.com')
        .expect(301);
      
      expect(res.headers.location).toBe('https://example.com/test');
    });

    it('should allow HTTPS requests with x-forwarded-proto header', async () => {
      process.env.NODE_ENV = 'production';
      
      const res = await request(app)
        .get('/test')
        .set('x-forwarded-proto', 'https')
        .expect(200);
      
      expect(res.text).toBe('OK');
    });

    it('should allow HTTPS requests with x-forwarded-ssl header', async () => {
      process.env.NODE_ENV = 'production';
      
      const res = await request(app)
        .get('/test')
        .set('x-forwarded-ssl', 'on')
        .expect(200);
      
      expect(res.text).toBe('OK');
    });

    it('should preserve query parameters in redirect', async () => {
      process.env.NODE_ENV = 'production';
      
      const res = await request(app)
        .get('/test?param1=value1&param2=value2')
        .set('Host', 'example.com')
        .expect(301);
      
      expect(res.headers.location).toBe('https://example.com/test?param1=value1&param2=value2');
    });
  });

  describe('setHSTSHeaders middleware', () => {
    beforeEach(() => {
      app.use(setHSTSHeaders);
      app.get('/test', (req, res) => res.send('OK'));
    });

    it('should set default HSTS headers on HTTPS request', async () => {
      const res = await request(app)
        .get('/test')
        .set('x-forwarded-proto', 'https')
        .expect(200);
      
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    });

    it('should not set HSTS headers on HTTP request', async () => {
      const res = await request(app)
        .get('/test')
        .expect(200);
      
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('should use custom max-age from environment variable', async () => {
      process.env.HSTS_MAX_AGE = '86400';
      
      const res = await request(app)
        .get('/test')
        .set('x-forwarded-proto', 'https')
        .expect(200);
      
      expect(res.headers['strict-transport-security']).toBe('max-age=86400; includeSubDomains');
    });

    it('should exclude subdomains when configured', async () => {
      process.env.HSTS_INCLUDE_SUBDOMAINS = 'false';
      
      const res = await request(app)
        .get('/test')
        .set('x-forwarded-proto', 'https')
        .expect(200);
      
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
    });

    it('should include preload directive when configured', async () => {
      process.env.HSTS_PRELOAD = 'true';
      
      const res = await request(app)
        .get('/test')
        .set('x-forwarded-proto', 'https')
        .expect(200);
      
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains; preload');
    });

    it('should work with x-forwarded-ssl header', async () => {
      const res = await request(app)
        .get('/test')
        .set('x-forwarded-ssl', 'on')
        .expect(200);
      
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    });

    it('should combine custom settings', async () => {
      process.env.HSTS_MAX_AGE = '604800';
      process.env.HSTS_INCLUDE_SUBDOMAINS = 'false';
      process.env.HSTS_PRELOAD = 'true';
      
      const res = await request(app)
        .get('/test')
        .set('x-forwarded-proto', 'https')
        .expect(200);
      
      expect(res.headers['strict-transport-security']).toBe('max-age=604800; preload');
    });
  });

  describe('Combined middleware', () => {
    beforeEach(() => {
      app.use(enforceHTTPS);
      app.use(setHSTSHeaders);
      app.get('/test', (req, res) => res.send('OK'));
    });

    it('should redirect HTTP and not set HSTS headers', async () => {
      process.env.NODE_ENV = 'production';
      
      const res = await request(app)
        .get('/test')
        .set('Host', 'example.com')
        .expect(301);
      
      expect(res.headers.location).toBe('https://example.com/test');
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('should allow HTTPS and set HSTS headers', async () => {
      process.env.NODE_ENV = 'production';
      
      const res = await request(app)
        .get('/test')
        .set('x-forwarded-proto', 'https')
        .expect(200);
      
      expect(res.text).toBe('OK');
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    });
  });
});