import * as assert from 'assert';
import { escapeHtml } from './htmlEscape';

console.log('Running UI & HTML Escape tests...\n');

// 1. escapeHtml
{
  assert.strictEqual(escapeHtml('Hello & World'), 'Hello &amp; World');
  assert.strictEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.strictEqual(escapeHtml("Tom's Diner"), 'Tom&#039;s Diner');
  assert.strictEqual(escapeHtml(''), '');
}

console.log('✓ escapeHtml passed');
