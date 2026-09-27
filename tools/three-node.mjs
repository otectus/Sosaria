// Use the same vendored Three.js in Node validation as the browser import map.
import { registerHooks } from 'node:module';
const three = new URL('../vendor/three/three.module.js', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === 'three' ? { url: three, shortCircuit: true } : nextResolve(specifier, context);
} });
