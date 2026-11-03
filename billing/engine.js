/* ============================================================
   HARMONY FLOORING — Weekly Installer Bill Engine
   Plain JavaScript, no dependencies. Works in the browser
   (window.HarmonyBilling) and in Node (require).

   What it does:
     job (what the installer reported + office info)
       -> customer charge lines + installer pay lines
       -> totals + flags for the bookkeeper / Israel

   Rates are loaded from the locked billing_manual table with
   HarmonyBilling.setManual(); this file holds no prices.
   ============================================================ */
(function (root) {
  'use strict';

  // ---------- Rates, customers and buildings ----------
  // None are stored in this file. The Bookkeeping page loads them for admins from the
  // locked billing_manual table and hands them over with setManual().
  let BASE_RATES = {}, RATES = {}, CUSTOMERS = [], BUILDINGS = {};
  function setPath(obj, path, val) {
    const keys = path.split('.'); let o = obj;
    keys.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    o[keys[keys.length - 1]] = val;
  }
  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }

  // ---------- helpers ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const has = (v) => v !== undefined && v !== null && v !== '';
  function lower(a, b) {
    if (has(a) && has(b)) return Math.min(Number(a), Number(b));
    return has(a) ? Number(a) : has(b) ? Number(b) : null;
  }
  function deepMerge(base, extra) {
    for (const k of Object.keys(extra || {})) {
      if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k])) {
        base[k] = deepMerge(base[k] || {}, extra[k]);
      } else base[k] = extra[k];
    }
    return base;
  }

  function findCustomer(nameOrEmail) {
    if (!nameOrEmail) return null;
    const q = String(nameOrEmail).toLowerCase();
    return CUSTOMERS.find((c) =>
      (c.email && c.email.toLowerCase() === q) ||
      c.name.toLowerCase() === q ||
      (c.aliases || []).some((a) => a.toLowerCase() === q) ||
      q.includes(c.name.toLowerCase())
    ) || null;
  }

  function buildingYardage(building, unit) {
    const b = BUILDINGS[building];
    return b && b[unit] ? b[unit] : null;
  }

  // ---------- main ----------
  /**
   * job = {
   *   day, address, customer, customerEmail, installer,
   *   status: 'estimate_on_file' | 'create_invoice' | 'create_estimate' | 'hold' | 'bookkeeper_handles' | 'correction',
   *   so, rateClass ('investor'|'residential'), unitEmpty (bool),
   *   flatRate: { charge, pay, difficult },
   *   payOverride (Israel's explicit pay figure — wins over everything),
   *   notes: [], items: [ ...see README ]
   * }
   */
  function computeJob(job) {
    const charge = [], pay = [], flags = [], notes = [...(job.notes || [])];
    const items = job.items || [];
    const status = job.status || 'create_invoice';
    const onFile = status === 'estimate_on_file';
    const cust = findCustomer(job.customerEmail) || findCustomer(job.customer);

    // investor vs residential
    let cls = job.rateClass;
    if (!cls) {
      if (cust) cls = cust.investor ? 'investor' : 'residential';
      else { cls = 'investor'; if (!onFile && status !== 'hold' && status !== 'bookkeeper_handles') flags.push('Customer not on investor list — confirm investor vs residential (defaulted to investor).'); }
    }

    // status notes
    if (onFile) notes.unshift(`Estimate on file${job.so ? ` (SO ${job.so})` : ''} — do not rewrite customer charge.`);
    if (status === 'create_invoice') notes.unshift('Create invoice.');
    if (status === 'create_estimate') notes.unshift('Create estimate — full customer pricing below.');
    if (job.installer) notes.push(`${job.installer} job.`);
    if (job.review) flags.push(job.review);

    if (status === 'hold' || status === 'bookkeeper_handles') {
      if (status === 'bookkeeper_handles') notes.push('Bookkeeper handling this one directly.');
      return finish(job, cls, charge, pay, flags, notes, { skipMin: true });
    }

    const C = (label, qty, unit, rate, amount, note) => {
      if (onFile && !note?.startsWith?.('ADD')) return; // estimate on file: no charge lines
      if (!has(amount) && (!has(qty) || !has(rate))) { flags.push(`${label}: quantity or rate missing — not billed.`); return; }
      charge.push({ label, qty, unit, rate, amount: r2(has(amount) ? amount : qty * rate), note: note && note.replace(/^ADD:?\s*/, '') });
    };
    const P = (label, qty, unit, rate, amount, note) => {
      if (!has(amount) && (!has(qty) || !has(rate))) { flags.push(`${label}: quantity or rate missing — not paid.`); return; }
      pay.push({ label, qty, unit, rate, amount: r2(has(amount) ? amount : qty * rate), note });
    };

    // context used across items
    const hasCarpetRipup = items.some((i) => i.type === 'ripup' && (i.material || 'carpet') === 'carpet' && !i.haulOnly);
    const carpetItems = items.filter((i) => i.type === 'carpet');
    const customerCarpetYds = carpetItems.reduce((s, i) => s + (Number(i.qty ?? i.installerQty) || 0), 0);
    const vinylSqf = items.filter((i) => i.type === 'vinyl').reduce((s, i) => s + (Number(i.qty ?? i.installerQty) || 0), 0);

    // ---- flat-rate job: whole job, no add-ons ----
    if (job.flatRate) {
      const f = job.flatRate;
      if (has(f.charge)) C('Flat rate', null, null, null, f.charge);
      const fp = has(f.pay) ? f.pay : f.difficult ? RATES.steps.flatSmall.difficult : RATES.steps.flatSmall.regular;
      P('Flat rate', null, null, null, fp);
      items.filter((i) => i.extra).forEach((i) => applyItem(i)); // only add-ons explicitly marked extra
      return finish(job, cls, charge, pay, flags, notes, { skipMin: true });
    }

    items.forEach(applyItem);

    // cross-item sanity checks
    const luans = items.filter((i) => i.type === 'luan').reduce((s, i) => s + Number(i.count || 0), 0);
    if (luans) {
      const cover = luans * RATES.luanSqf;
      if (vinylSqf && Math.abs(cover - vinylSqf) / vinylSqf > 0.25)
        flags.push(`Luan check: ${luans} sheets × 32 = ${cover} sqf vs ${vinylSqf} sqf vinyl — confirm luan count.`);
      if (items.some((i) => i.type === 'patch')) flags.push('Luan on job — give the prep/patch number a second look.');
    }
    const bags = items.filter((i) => i.type === 'patch').reduce((s, i) => s + Number(i.bags || 0), 0);
    if (bags && vinylSqf && bags * RATES.patchPayPerBag > vinylSqf * RATES.patchMaxPerSqf)
      flags.push(`Patch check: ${bags} bags ($${bags * RATES.patchPayPerBag}) is over $${RATES.patchMaxPerSqf}/sqf of ${vinylSqf} sqf — confirm bag count.`);

    return finish(job, cls, charge, pay, flags, notes, {});

    // ------------------------------------------------------------
    function applyItem(it) {
      const t = it.type;
      const add = it.addToCustomer ? 'ADD' : undefined; // forces a charge line even on estimate-on-file jobs

      if (t === 'carpet') {
        if (!has(it.qty) && !has(it.installerQty)) { flags.push(`Carpet${it.product ? ' ' + it.product : ''}: no quantity entered — not billed or paid.`); return; }
        const prod = it.product;
        if (!prod) flags.push(`Carpet product not entered — pay uses $${RATES.carpetDefaultPay.toFixed(2)}/yd and no customer charge was written.`);
        const rate = prod ? RATES.carpet[prod] : undefined;
        const custQty = has(it.qty) ? it.qty : it.installerQty;
        const payQty = it.payInstallerQty ? it.installerQty : lower(it.qty, it.installerQty);
        if (it.payInstallerQty) notes.push('Paying installer\'s own reported carpet quantity (per job note).');
        else if (has(it.qty) && has(it.installerQty) && Number(it.qty) !== Number(it.installerQty))
          notes.push(`Carpet: office ${it.qty} yds vs installer ${it.installerQty} yds — paid the lower.`);

        let cRate = has(it.chargeRate) ? it.chargeRate : (cust?.carpetOverrides?.[prod] ?? rate?.[cls]);
        if (prod && !rate && !has(it.chargeRate)) flags.push(`Carpet product "${prod}" not in manual — look up the rate.`);
        if (!onFile) {
          if (has(cRate)) C(`Carpet ${prod}`, custQty, 'yds', cRate, null, add);
          else if (prod) flags.push(`No ${cls} customer rate for carpet ${prod} — look up the rate.`);
        }
        const label = `Carpet${it.glueDown ? ' (glue down)' : ''}`;
        P(label, payQty, 'yds', rate ? rate.pay : RATES.carpetDefaultPay);
        const noPad = it.glueDown || it.runner || it.padding === 'ours' || it.padding === 'none' || rate?.noPadding;
        if (!noPad) P('Padding', payQty, 'yds', RATES.paddingPay);
        else if (it.padding === 'ours') notes.push('Our 8lb padding — do not pay installer for padding.');
        return;
      }

      if (t === 'vinyl') {
        if (!has(it.qty) && !has(it.installerQty)) { flags.push(`Vinyl${it.product ? ' ' + it.product : ''}: no quantity entered — not billed or paid.`); return; }
        const custQty = has(it.qty) ? it.qty : it.installerQty;
        const payQty = it.payInstallerQty ? it.installerQty : lower(it.qty, it.installerQty);
        const cRate = has(it.chargeRate) ? it.chargeRate : it.glueDown20mil ? RATES.vinyl.glueDown20mil : RATES.vinyl.charge;
        C(`Vinyl${it.product ? ' ' + it.product : ''}`, custQty, 'sqf', cRate, null, add);
        if (it.specialDesign && !has(it.payRate)) { flags.push('Special design vinyl — installer pay TBD, ask Israel.'); return; }
        P(`Vinyl${it.product ? ' ' + it.product : ''}`, payQty, 'sqf', has(it.payRate) ? it.payRate : RATES.vinyl.pay);
        if (has(it.qty) && has(it.installerQty) && Number(it.qty) !== Number(it.installerQty))
          notes.push(`Vinyl: office ${it.qty} sqf vs installer ${it.installerQty} sqf — paid the lower.`);
        return;
      }

      if (t === 'luan') {
        C('Luan', it.count, 'ea', has(it.chargeRate) ? it.chargeRate : RATES.luanCharge, null, add);
        P('Luan', it.count, 'ea', RATES.luanPay);
        return;
      }

      if (t === 'ripup') {
        const mat = it.material || 'carpet';
        if (it.haulOnly) {
          const q = has(it.qty) ? it.qty : customerCarpetYds;
          C('Haul away only', q, 'yds', RATES.ripup.haulOnly.charge, null, add);
          return; // no installer pay
        }
        if (mat === 'carpet') {
          const custQ = customerCarpetYds || it.qty; // customer rip-up always matches customer carpet yardage
          const payQ = lower(it.qty ?? customerCarpetYds, it.installerQty ?? (carpetItems[0] && lower(carpetItems[0].qty, carpetItems[0].installerQty)));
          if (it.noHaul) {
            C('Rip up carpet (leave onsite)', custQ, 'yds', RATES.ripup.carpetOnsite.charge, null, add);
            if (!it.noPay) P('Rip up carpet (no haul)', payQ, 'yds', RATES.ripup.carpetOnsite.pay);
          } else {
            const cr = has(it.chargeRate) ? it.chargeRate : RATES.ripup.carpetHaul[cls];
            if (cls === 'residential' && !has(it.chargeRate)) flags.push(`Residential rip-up is a range — used $${RATES.ripup.carpetHaul.residential.toFixed(2)}/yd, confirm.`);
            C('Rip up & haul away carpet', custQ, 'yds', cr, null, add);
            if (!it.noPay) P('Rip up & haul away carpet', payQ, 'yds', RATES.ripup.carpetHaul.pay);
          }
          if (it.noPay) notes.push('Do not pay installer for rip up.');
          return;
        }
        // vinyl / click / laminate / vct
        const tile = mat === 'carpetTile';
        const q = has(it.qty) ? it.qty : tile ? customerCarpetYds : vinylSqf;
        const payQ = lower(q, it.installerQty);
        const rr = tile ? RATES.ripup.carpetTile : mat === 'vct' ? RATES.ripup.vct : RATES.ripup.vinyl;
        const label = `Rip up ${tile ? 'carpet tile' : mat === 'vct' ? 'VCT' : mat}`;
        const u = tile ? 'yds' : 'sqf';
        if (has(rr.charge) || has(it.chargeRate)) C(label, q, u, has(it.chargeRate) ? it.chargeRate : rr.charge, null, add);
        else if (!onFile) flags.push(`${label}: no customer rate in manual — look up the rate.`);
        if (!it.noPay) P(label, payQ, u, rr.pay);
        return;
      }

      if (t === 'steps') {
        const style = it.style || 'box';
        if (!it.style) notes.push('Step type not stated — box.');
        if (style === 'floating' || style === 'vinyl') {
          const n = it.steps;
          if (!has(n)) { flags.push(`${style} steps: need the number of steps.`); return; }
          const pr = style === 'floating' ? RATES.steps.floatingPerStep
            : (hasCarpetRipup || it.ripup) ? RATES.steps.vinylPerStepRipup : RATES.steps.vinylPerStep;
          if (has(it.chargeTotal)) C(`Steps — ${style}`, null, null, null, it.chargeTotal, add);
          else if (!onFile) flags.push(`${style} steps: customer charge is set per job — ask Israel.`);
          P(`Steps — ${style}`, n, 'steps', pr);
          return;
        }
        let flights = it.flights;
        if (!has(flights)) { flights = 1; notes.push('No flight count given — paid 1 flight.'); }
        const base = RATES.steps[style];
        if (!base) { flags.push(`Unknown step style "${style}".`); return; }
        const ripAdd = (hasCarpetRipup || it.ripup) ? RATES.steps.ripupAddCharge : 0;
        const bc = Number(it.birdcage || 0);
        const chargePer = base.charge + ripAdd;
        const chargeTotal = has(it.chargeTotal) ? it.chargeTotal : chargePer * flights + bc * RATES.steps.birdcage.charge;
        const payTotal = base.pay * flights + bc * RATES.steps.birdcage.pay;
        const name = { box: 'Box steps', mixed: 'Mixed flight (box + cap)', cap: 'Full cap steps' }[style];
        // birdcage + rip-up add-ons are folded in, never their own lines
        C(name, flights, 'flights', bc ? null : chargePer, chargeTotal, add);
        if (it.noPay) notes.push('Do not pay installer step labor.');
        else P(name, flights, 'flights', bc ? null : base.pay, payTotal);
        return;
      }

      if (t === 'stringers') {
        const cr = has(it.chargeRate) ? it.chargeRate
          : (cls === 'residential' && (hasCarpetRipup || it.ripup)) ? RATES.stringers.residentialRipup : RATES.stringers.charge;
        C('Stringers', it.count, 'ea', cr, null, add);
        P('Stringers', lower(it.count, it.installerCount), 'ea', RATES.stringers.pay);
        return;
      }

      if (t === 'shoe') {
        const q = has(it.qty) ? it.qty : it.installerQty;
        C('Shoe molding', q, 'lf', has(it.chargeRate) ? it.chargeRate : RATES.shoe[cls], null, add);
        P('Shoe molding', lower(it.qty, it.installerQty), 'lf', RATES.shoe.pay);
        return;
      }

      if (t === 'transition') {
        const kind = it.kind || 'metal';
        const price = has(it.price) ? it.price : RATES.transitions[kind];
        C(`${kind[0].toUpperCase() + kind.slice(1)} transition`, it.count || 1, 'ea', price, null, add);
        return; // never pay installer
      }

      if (t === 'cove') {
        const q = has(it.qty) ? it.qty : it.installerQty;
        const cr = has(it.chargeRate) ? it.chargeRate : it.special ? RATES.cove.special : RATES.cove.standard;
        if (!has(it.chargeRate)) notes.push('Cove base: check email history for a customer-specific rate before using standard.');
        C(`Cove base${it.color ? ' (' + it.color + ')' : ''}`, q, 'ft', cr, null, add);
        P('Cove base', lower(it.qty, it.installerQty), 'ft', RATES.cove.pay);
        return;
      }

      if (t === 'patch') {
        if (has(it.flatCharge)) C('Prep/patch', null, null, null, it.flatCharge, add ? add : 'Flat rate');
        else if (has(it.chargePerBag)) C('Prep/patch', it.bags, 'bags', it.chargePerBag, null, add);
        else if (!onFile) flags.push('Prep/patch: customer charge not given (per bag or flat) — confirm with office.');
        P('Prep/patch', it.bags, 'bags', RATES.patchPayPerBag);
        return;
      }

      if (t === 'appliance') {
        const n = it.count || 1;
        C('Toilet/appliance removal', n, 'ea', RATES.appliance.charge, null, add);
        if (it.payRequested) P('Toilet/appliance removal', n, 'ea', it.reinstalled === false ? RATES.appliance.payNotReinstalled : RATES.appliance.pay);
        return;
      }

      if (t === 'furniture') {
        if (job.unitEmpty) { notes.push('Unit empty — furniture skipped.'); return; }
        if (has(it.charge)) C('Furniture moving', null, null, null, it.charge, add);
        if (it.onEstimate) {
          P('Furniture moving', null, null, null, lower(it.estimateAmount, it.installerAmount));
          if (has(it.installerAmount) && has(it.estimateAmount) && it.installerAmount > it.estimateAmount)
            flags.push(`Furniture: installer asked $${it.installerAmount}, estimate has $${it.estimateAmount} — paid lower, confirm with Israel.`);
        } else if (has(it.installerAmount)) {
          if (it.confirmed) P('Furniture moving', null, null, null, it.installerAmount);
          else flags.push(`Furniture not on estimate but installer asked $${it.installerAmount} — confirm with Israel (not paid).`);
        }
        return;
      }

      if (t === 'gas') { P('Gas', null, null, null, has(it.amount) ? it.amount : RATES.gasDefault, has(it.amount) ? undefined : `Standard $${RATES.gasDefault}`); return; }

      if (t === 'trip') {
        if (has(it.charge)) C('Trip charge', null, null, null, it.charge, add);
        if (it.noPay) notes.push('No extra pay for trip.');
        else if (has(it.pay)) P('Trip charge', null, null, null, it.pay);
        else flags.push('Trip charge pay not specified — TBD.');
        return;
      }

      if (t === 'repair') {
        if (!has(it.charge) || !has(it.pay)) flags.push('Repair: no fixed rate — ask Israel for repair charge and pay.');
        if (has(it.charge)) C(`Repair${it.label ? ' — ' + it.label : ''}`, null, null, null, it.charge, add);
        P(`Repair${it.label ? ' — ' + it.label : ''}`, null, null, null, has(it.pay) ? it.pay : RATES.repairDefaultPay);
        return;
      }

      if (t === 'custom') {
        if (has(it.chargeAmount) || has(it.chargeRate)) C(it.label, it.chargeQty ?? null, it.unit ?? null, it.chargeRate ?? null, it.chargeAmount ?? null, add);
        if (has(it.payAmount) || has(it.payRate)) P(it.label, it.payQty ?? null, it.unit ?? null, it.payRate ?? null, it.payAmount ?? null);
        return;
      }

      flags.push(`Unknown item type "${t}" — not billed.`);
    }
  }

  function finish(job, cls, charge, pay, flags, notes, opts) {
    let payTotal = r2(pay.reduce((s, l) => s + l.amount, 0));

    if (has(job.payOverride)) {
      // Israel's explicit figure wins over itemized calc and the minimum
      const diff = r2(job.payOverride - payTotal);
      if (diff !== 0) pay.push({ label: 'Adjustment to agreed pay', amount: diff, note: `Pay set to $${job.payOverride} per Israel` });
      payTotal = r2(job.payOverride);
    } else if (!opts.skipMin && job.status !== 'correction' && pay.some((l) => l.qty !== null && l.qty !== undefined)) {
      const base = RATES.minPayExcludesGas
        ? r2(pay.filter((l) => l.label !== 'Gas').reduce((s, l) => s + l.amount, 0))
        : payTotal;
      if (base < RATES.minInstallerPay) {
        const bump = r2(RATES.minInstallerPay - base);
        pay.push({ label: 'Minimum pay adjustment', amount: bump, note: `Rate-based pay $${base.toFixed(2)} < $${RATES.minInstallerPay} minimum` });
        payTotal = r2(payTotal + bump);
      }
    }

    // rule: installer rip-up pay needs a matching customer rip-up charge (invoice jobs)
    if (job.status !== 'estimate_on_file') {
      const payRip = pay.some((l) => /^Rip up/i.test(l.label));
      const chgRip = charge.some((l) => /^Rip up/i.test(l.label));
      if (payRip && !chgRip) flags.push('Rip-up paid to installer with no customer rip-up charge — add charge line.');
    }

    return {
      ...job,
      rateClass: cls,
      chargeLines: charge,
      payLines: pay,
      chargeTotal: r2(charge.reduce((s, l) => s + l.amount, 0)),
      payTotal,
      notes,
      flags,
    };
  }

  function computeWeek(week) {
    const jobs = (week.jobs || []).map(computeJob);
    const byInstaller = {};
    jobs.forEach((j) => { if (j.payTotal) { const k = j.installer || 'Installer not entered'; byInstaller[k] = r2((byInstaller[k] || 0) + j.payTotal); } });
    return {
      ...week,
      jobs,
      byInstaller,
      totals: {
        charge: r2(jobs.reduce((s, j) => s + j.chargeTotal, 0)),
        pay: r2(jobs.reduce((s, j) => s + j.payTotal, 0)),
        flags: jobs.reduce((s, j) => s + j.flags.length, 0),
      },
    };
  }

  const api = {
    computeJob, computeWeek, findCustomer, buildingYardage,
    getRates: () => clone(RATES),
    // accepts nested objects or flat dotted keys, e.g. { 'carpet.T2.residential': 14 }
    setRates: (overrides) => {
      const nested = {};
      Object.entries(overrides || {}).forEach(([k, v]) => {
        if (k.includes('.')) setPath(nested, k, v); else nested[k] = v;
      });
      RATES = deepMerge(clone(BASE_RATES), nested);
    },
    setManual: (m) => {
      BASE_RATES = clone(m.rates || {}); RATES = clone(BASE_RATES);
      CUSTOMERS = clone(m.customers || []); BUILDINGS = clone(m.buildings || {});
    },
    getCustomers: () => clone(CUSTOMERS),
    getBuildings: () => clone(BUILDINGS),
    getPath, setPath,
    setCustomers: (list) => { CUSTOMERS = list; },
    addCustomers: (list) => { CUSTOMERS = CUSTOMERS.concat(list); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HarmonyBilling = api;
})(typeof window !== 'undefined' ? window : this);
