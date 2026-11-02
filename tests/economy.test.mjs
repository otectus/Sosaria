// Resources: transactional inventories. Reservation is not consumption, transfers are atomic,
// losses are recorded once with a cause, stocks never go negative and coin is never created.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reserve, release, transfer, consume, produce, lose, available, held, balance, negativeStock, seed, emptyLedger } from '../src/sim/inventory.js';
import { onArrival } from '../src/sim/travel.js';
import { world, fresh, advance, until, balanced } from './helpers.mjs';

const blank = () => ({ inventories: {}, ledger: emptyLedger() });

test('two jobs cannot reserve the same sack, and cancelling releases the reservation', () => {
  const s = blank();
  seed(s, 'inv:a', { grain: 10 });
  assert.ok(reserve(s, 'inv:a', { grain: 8 }));
  assert.equal(reserve(s, 'inv:a', { grain: 3 }), false, 'contention');
  assert.equal(available(s, 'inv:a', 'grain'), 2);
  assert.equal(held(s, 'inv:a', 'grain'), 10, 'reserved is not consumed');
  release(s, 'inv:a', { grain: 8 });
  assert.equal(available(s, 'inv:a', 'grain'), 10);
});

test('transfers and consumption are all-or-nothing; losses are bounded and recorded once', () => {
  const s = blank();
  seed(s, 'inv:a', { grain: 5, flour: 1 });
  assert.equal(transfer(s, 'inv:a', 'inv:b', { grain: 3, flour: 2 }), false);
  assert.equal(held(s, 'inv:a', 'grain'), 5, 'a failed transfer changes nothing');
  assert.ok(transfer(s, 'inv:a', 'inv:b', { grain: 3 }));
  assert.equal(consume(s, 'inv:b', { grain: 4 }, 'eaten'), false);
  assert.ok(consume(s, 'inv:b', { grain: 2 }, 'eaten'));
  assert.equal(lose(s, 'inv:a', 'grain', 50, 'burned'), 2, 'cannot burn more than exists');
  assert.equal(s.ledger.burned.grain, 2); assert.equal(s.ledger.eaten.grain, 2);
  assert.ok(Object.values(balance(s)).every(n => n === 0));
  assert.equal(negativeStock(s), null);
  assert.throws(() => produce(s, 'inv:a', { coin: 5 }), /Invalid production/, 'coin is never minted');
});

test('a loss that eats into reserved stock trims the reservation, never leaving it larger than stock', () => {
  const s = blank();
  seed(s, 'inv:g', { grain: 10 });
  reserve(s, 'inv:g', { grain: 8 });
  lose(s, 'inv:g', 'grain', 7, 'burned');
  assert.ok(s.inventories['inv:g'].reserved.grain <= s.inventories['inv:g'].goods.grain);
  assert.equal(negativeStock(s), null);
});

test('a delivery happens exactly once even if an arrival is replayed', () => {
  const { catalog } = world();
  const s = fresh();
  assert.ok(until(s, st => Object.values(st.shipments).some(x => x.kind === 'contract' && x.status === 'unloading'), 1440 * 2));
  const sh = Object.values(s.shipments).find(x => x.kind === 'contract' && x.status === 'unloading');
  assert.ok(until(s, st => st.shipments[sh.id].status === 'delivered', 200));
  const before = JSON.stringify(s.inventories);
  onArrival(s, catalog, s.shipments[sh.id], { unload: true });
  assert.equal(JSON.stringify(s.inventories), before, 'a second arrival is ignored');
});

test('perishable food spoils into a recorded sink; long runs stay balanced and non-negative', () => {
  const s = fresh();
  advance(s, 1440 * 5);
  assert.ok(s.ledger.spoiled.bread > 0 || s.ledger.spoiled.fish > 0);
  assert.ok(balanced(s));
  const coin = Object.values(s.inventories).reduce((n, inv) => n + (inv.goods.coin || 0), 0);
  assert.equal(coin, s.ledger.initial.coin, 'coin only moves between treasuries');
});
