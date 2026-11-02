// Erreurs HTTP publiques partagées (lib/contracts) : table unifiée, aucun secret.
import test from 'node:test';
import assert from 'node:assert/strict';
import { publicHttpError } from '../lib/contracts/dist/index.js';

test('publicHttpError : table unifiée des statuts publics', () => {
  const expected = [
    [400, 'invalid_argument'],
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [405, 'invalid_argument'],
    [409, 'conflict'],
    [413, 'invalid_argument'],
    [415, 'invalid_argument'],
    [422, 'invalid_argument'],
    [429, 'rate_limited'],
    [503, 'unavailable'],
    [418, 'internal_error'],
    [500, 'internal_error'],
    [502, 'internal_error'],
  ];
  for (const [status, code] of expected) {
    const result = publicHttpError(status, 'request-a');
    assert.equal(result.status, status);
    assert.equal(result.error.code, code);
    assert.equal(result.error.correlationId, 'request-a');
    assert.equal(typeof result.error.message, 'string');
    assert.ok(result.error.message.length > 0);
  }
});

test('publicHttpError : niveau de log aligné sur la sévérité du statut', () => {
  assert.equal(publicHttpError(400, 'a').logLevel, 'warn');
  assert.equal(publicHttpError(404, 'a').logLevel, 'warn');
  assert.equal(publicHttpError(429, 'a').logLevel, 'warn');
  assert.equal(publicHttpError(500, 'a').logLevel, 'error');
  assert.equal(publicHttpError(503, 'a').logLevel, 'error');
});

test('publicHttpError : aucun détail interne ni secret dans le payload ou le niveau', () => {
  for (const status of [400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 500, 503]) {
    const result = publicHttpError(status, 'request-secret');
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('password'));
    assert.ok(!serialized.includes('stack'));
    assert.ok(!serialized.includes('secret-test'));
    assert.equal(Object.keys(result.error).sort().join(','), 'code,correlationId,message');
  }
});

test('publicHttpError : la fonction est pure et sans dépendance NestJS', () => {
  const first = publicHttpError(404, 'request-a');
  const second = publicHttpError(404, 'request-a');
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['error', 'logLevel', 'status']);
});
