/* ============================================================
   HARMONY FLOORING — Weekly Installer Bill Engine
   Plain JavaScript, no dependencies. Works in the browser
   (window.HarmonyBilling) and in Node (require).

   What it does:
     job (what the installer reported + office info)
       -> customer charge lines + installer pay lines
       -> totals + flags for the bookkeeper / Yisroel

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

  // words that show an item is on an estimate's lines
  const EST_WORDS = {
    carpet: /carpet|\bt2\b|\bm[12]\b|truffle|toffee|pad/, vinyl: /vinyl|lvt|lvp|plank|laminate|spc|click/, ripup: /rip|remov|haul|tear/,
    steps: /step|stair|flight/, luan: /lu?an|lauan|underlay|plywood/, patch: /patch|prep|level|skim/, shoe: /shoe|quarter|mold/,
    cove: /cove/, stringers: /stringer/, appliance: /toilet|appliance/, furniture: /furniture/, hallway: /hall/, transition: /transition|threshold|reducer/,
  };
  const itemName = (it) => it.name || it.label || ({ ripup: 'Rip up', luan: 'Luan', patch: 'Patch / prep', shoe: 'Shoe molding', cove: 'Cove base',
    appliance: 'Toilet / appliance', hallway: 'Common hallway' }[it.type]) || it.type[0].toUpperCase() + it.type.slice(1);
  // name words too common to mean a customer when they show up in a note
  const GENERIC = /^(management|construction|contracting|builders|homes|realty|estates|equity|capital|holdings|property|flooring|group|services|development|street|avenue)$/;

  // a customer whose saved addresses match the job's address ("33 Presidential" → Magenta Management)
  const normAddr = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  function customerAtAddress(address) {
    const a = normAddr(address);
    if (!a) return null;
    // saved as one line, addresses separated by ";"
    return CUSTOMERS.find((c) => [].concat(c.addresses || []).join(';').split(';').some((x) => { const n = normAddr(x); return n && (a === n || a.startsWith(n + ' ')); })) || null;
  }

  // "Office 69 vs installer 64 — paid the lower" goes in the line's own Notes cell
  function lowNote(a, b, unit) {
    return has(a) && has(b) && Number(a) !== Number(b) ? `Office ${a} ${unit} vs installer ${b} ${unit} — paid the lower` : undefined;
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
   *   payOverride (Yisroel's explicit pay figure — wins over everything),
   *   notes: [], items: [ ...see README ]
   * }
   */
  // A job's building: picked on the job, or found in the address ("Bucks 7-30" → Bucks)
  function findBuilding(job) {
    if (job.building && BUILDINGS[job.building]) return job.building;
    const a = String(job.address || '').toLowerCase();
    // a building with a town ("Manor", Woodbury) only matches when the town is in the address too
    return Object.keys(BUILDINGS).find((n) => {
      const b = BUILDINGS[n];
      if (b.town && !a.includes(String(b.town).toLowerCase())) return false;
      return a.includes(n.toLowerCase().replace(/\s*\(.*\)$/, '')) || (b.aliases || []).some((x) => x && a.includes(String(x).toLowerCase()));
    }) || null;
  }

  function computeJob(job) {
    let charge = [], pay = [];
    const flags = [], notes = [...(job.notes || [])];
    // What the bill doesn't know yet: listed on the Missing Info page, filled in once, saved everywhere
    const missing = [];
    const items = job.items || [];
    const status = job.status || 'create_invoice';
    const onFile = status === 'estimate_on_file';
    const parked = status === 'hold' || status === 'bookkeeper_handles';
    const bName = findBuilding(job), bld = bName ? BUILDINGS[bName] : null;
    // no customer written: the building's customer, or the customer who has this address on file
    const named = findCustomer(job.customerEmail) || findCustomer(job.customer);
    const cust = named || (!job.customer && (findCustomer(bld?.customer) || customerAtAddress(job.address))) || null;
    if (cust && !named) notes.push(`Customer: ${cust.name} (${bld?.customer ? bName + ' is on file under them' : 'address on file'}).`);
    if (cust?.note) notes.push(`${cust.name}: ${cust.note}`);
    const payAsks = []; // { q, i, key }: pay held until someone says yes (gas approval, appliance not on the estimate)
    const chargeAsks = []; // { q, i }: "not on the estimate — added to the customer, confirm?" for item i
    const notOnEst = new Set(); // items charged to the customer because they aren't on the estimate
    const done = (opts) => { const r = finish(job, cls, charge, pay, flags, notes, opts); r.missing = missing; r.chargeAsks = chargeAsks; r.payAsks = payAsks; return r; };

    // investor vs residential
    let cls = job.rateClass;
    if (!cls) {
      if (cust) cls = cust.investor ? 'investor' : 'residential';
      else { cls = 'investor'; if (!onFile && !parked) flags.push('Customer not on investor list — confirm investor vs residential (defaulted to investor).'); }
    }
    if (!cust && !parked && status !== 'correction') missing.push({ kind: 'customer', name: job.customer || '' });
    if (onFile && !job.so) missing.push({ kind: 'so' });

    // status notes
    if (onFile) notes.unshift(`Estimate on file${job.so ? ` (SO ${job.so})` : ''} — do not rewrite customer charge.`);
    if (status === 'create_invoice') notes.unshift('Create invoice.');
    if (status === 'create_estimate') notes.unshift('Create estimate — full customer pricing below.');
    if (job.installer) notes.push(`${job.installer} job.`);
    if (job.review) flags.push(job.review);
    if (bld?.note) notes.push(`${bName}: ${bld.note}`);
    // return trip finishing a past job: installer's issue = no minimum, our mistake = minimum — someone has to say which
    if (job.returnTrip === 'installer') notes.push('Return trip — installer\'s issue, no $100 minimum. Add to past bill.');
    else if (job.returnTrip === 'ours') notes.push('Return trip — our mistake, $100 minimum applies.');
    else if (job.returnTrip) flags.push('Return trip finishing a past job: was it the installer\'s issue (no $100 minimum) or our mistake ($100 minimum)? Pick it on the job — no minimum added until then.');
    // questions that come with a suggested line: answering "Yes" adds the line to the job
    (job.asks || []).forEach((a) => { if (a.q && !flags.includes(a.q)) flags.push(a.q); });

    if (parked) {
      if (status === 'bookkeeper_handles') notes.push('Bookkeeper handling this one directly.');
      return done({ skipMin: true });
    }

    // path = where the rate lives in the manual, so a changed rate can be saved as the rule
    const C = (label, qty, unit, rate, amount, note, path) => {
      const isAdd = !!note?.startsWith?.('ADD');
      if (onFile && !isAdd) return; // estimate on file: no charge lines
      if (!has(amount) && (!has(qty) || !has(rate))) { flags.push(`${label}: quantity or rate missing — not billed.`); return; }
      note = note && note.replace(/^ADD:?\s*/, '') || undefined;
      charge.push({ label: onFile && isAdd ? `Estimate change: ${label}` : label, qty, unit, rate, amount: r2(has(amount) ? amount : qty * rate), note, path });
    };
    const P = (label, qty, unit, rate, amount, note, path) => {
      if (!has(amount) && (!has(qty) || !has(rate))) { flags.push(`${label}: quantity or rate missing — not paid.`); return; }
      pay.push({ label, qty, unit, rate, amount: r2(has(amount) ? amount : qty * rate), note, path });
    };
    // A line with no price yet ("Same as past job", "On file"): printed, not added to the totals
    const T = (label, qty, unit, rateText, note) => {
      const isAdd = !!note?.startsWith?.('ADD');
      charge.push({ label: onFile && isAdd ? `Estimate change: ${label}` : label, qty: has(qty) ? qty : null, unit, rate: null, rateText, amount: null, note: note && note.replace(/^ADD:?\s*/, '') || undefined });
    };

    // context used across items
    const hasCarpetRipup = items.some((i) => i.type === 'ripup' && (i.material || 'carpet') === 'carpet' && !i.haulOnly);
    const carpetItems = items.filter((i) => i.type === 'carpet');
    const customerCarpetYds = carpetItems.reduce((s, i) => s + (Number(i.qty ?? i.installerQty) || 0), 0);
    const vinylSqf = items.filter((i) => i.type === 'vinyl').reduce((s, i) => s + (Number(i.qty ?? i.installerQty) || 0), 0);
    // sqf actually installed (lower of office and installer) — what the luan and patch checks measure against
    const laidSqf = items.filter((i) => i.type === 'vinyl').reduce((s, i) => s + (Number(lower(i.qty, i.installerQty)) || 0), 0);
    const luans = items.filter((i) => i.type === 'luan').reduce((s, i) => s + Number(i.count || 0), 0);
    const bags = items.filter((i) => i.type === 'patch').reduce((s, i) => s + Number(i.bags || 0), 0);

    // ---- flat-rate job: whole job, no add-ons ----
    if (job.flatRate) {
      const f = job.flatRate;
      if (has(f.charge)) C('Flat rate', null, null, null, f.charge);
      const fp = has(f.pay) ? f.pay : f.difficult ? RATES.steps.flatSmall.difficult : RATES.steps.flatSmall.regular;
      P('Flat rate', null, null, null, fp);
      items.filter((i) => i.extra).forEach((i) => applyItem(i)); // only add-ons explicitly marked extra
      return done({ skipMin: true });
    }

    // Work the installer did that isn't on the estimate: paid, and added to the customer's charge marked
    // "Not on the estimate" — flagged until someone confirms it (or says don't charge)
    const estLines = job.estimate?.lines;
    if (onFile && estLines?.length) {
      const est = estLines.map((l) => String(l.desc || '')).join(' | ').toLowerCase();
      items.forEach((it, i) => {
        if (it.addToCustomer || !EST_WORDS[it.type] && !['extra', 'custom'].includes(it.type)) return;
        const own = [it.product, it.name, it.label].filter(Boolean).join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
        if ((EST_WORDS[it.type] && EST_WORDS[it.type].test(est)) || own.some((w) => est.includes(w))) return;
        if (it.noCharge) { notes.push(`${itemName(it)} is not on the estimate — not charged to the customer.`); return; }
        notOnEst.add(it);
        if (it.chargeConfirmed) return;
        const q = `${itemName(it)} is not on the estimate${job.so ? ` (SO ${job.so})` : ''} — added to the customer's charge. Confirm?`;
        flags.push(q); chargeAsks.push({ q, i });
      });
    }

    items.forEach(applyItem);

    // A customer's name in the job note where a material would go ("compton") — warn, it's not a product
    const noteText = (job.notes || []).concat(items.map((i) => i.product || '')).join(' ').toLowerCase();
    const addr = String(job.address || '').toLowerCase();
    for (const c of CUSTOMERS) {
      if (c === cust) continue;
      const w = [c.name].concat(c.aliases || []).join(' ').toLowerCase().split(/[^a-z]+/)
        .find((t) => t.length >= 5 && !GENERIC.test(t) && !addr.includes(t) && new RegExp('\\b' + t + '\\b').test(noteText));
      if (w) { flags.push(`The note says "${w}" — that's a customer name (${c.name}), not a material. Check what was meant.`); break; }
    }

    // cross-item sanity checks (the manual's luan and patch checks)
    if (luans) {
      const cover = luans * RATES.luanSqf;
      if (laidSqf && Math.abs(cover - laidSqf) / laidSqf > 0.25)
        flags.push(`Luan check: ${luans} sheets × ${RATES.luanSqf} = ${cover} sqf vs ${laidSqf} sqf vinyl — confirm luan count.`);
      if (items.some((i) => i.type === 'patch')) flags.push('Luan on job — give the prep/patch number a second look.');
    }
    if (bags && laidSqf && bags * RATES.patchPayPerBag > laidSqf * RATES.patchMaxPerSqf)
      flags.push(`Patch check: ${bags} bags ($${bags * RATES.patchPayPerBag}) is over $${RATES.patchMaxPerSqf}/sqf of ${laidSqf} sqf — confirm bag count.`);

    return done({});

    // ------------------------------------------------------------
    function applyItem(it, idx) {
      const t = it.type;
      // forces a charge line even on estimate-on-file jobs
      const add = it.addToCustomer ? 'ADD' : notOnEst.has(it) ? 'ADD Not on the estimate' : undefined;

      if (t === 'carpet') {
        const prod = it.product;
        const unit = it.unitLabel ? String(it.unitLabel).toUpperCase().replace(/\s+/g, '') : null;
        // Installer's feet: carpet roll is 12 ft wide, feet × 12 ÷ 9 = yards
        const feetYds = has(it.feet) ? r2(Number(it.feet) * 12 / 9) : null;
        let instQ = it.installerQty, ftNote;
        if (has(feetYds)) {
          if (has(it.installerQty) && Math.abs(Number(it.installerQty) - feetYds) > 0.1)
            flags.push(`Installer wrote ${it.feet} ft and ${it.installerQty} yds — ${it.feet} ft × 12 ÷ 9 = ${feetYds} yds, so ${feetYds} was used. Check it.`);
          instQ = feetYds; ftNote = `${it.feet} ft × 12 ÷ 9 = ${feetYds} yds ✓`;
        }
        // a building unit with no office yards uses the building's standard yards
        const offQ = has(it.qty) ? it.qty : unit && bld && has(bld[unit]) ? bld[unit] : undefined;
        if (!has(offQ) && !has(instQ)) { flags.push(`Carpet${prod ? ' ' + prod : ''}: no quantity entered — not billed or paid.`); return; }
        if (!prod && !unit && !onFile) flags.push(`Carpet product not entered — pay uses $${RATES.carpetDefaultPay.toFixed(2)}/yd and no customer charge was written.`);
        const rate = prod ? RATES.carpet[prod] : undefined;
        const custQty = has(offQ) ? offQ : instQ;
        const payQty = it.payInstallerQty ? instQ : lower(offQ, instQ);
        const payNote = it.payInstallerQty ? 'Paid the installer\'s own quantity (per job note)' : (lowNote(offQ, instQ, 'yds') || ftNote);
        const chgNote = add ? (ftNote ? 'ADD ' + ftNote : add) : ftNote;

        // customer's own price for this product, else the customer's or the building's price for any carpet
        const own = cust?.carpetOverrides?.[prod] ?? cust?.carpetRate ?? bld?.rate;
        let cRate = has(it.chargeRate) ? it.chargeRate : (own ?? rate?.[cls]);
        // M2 put in because T2 ran out: the customer pays the T2 price
        const forT2 = it.forT2 && RATES.carpet.T2 && !has(it.chargeRate);
        if (forT2) { cRate = cust?.carpetOverrides?.T2 ?? cust?.carpetRate ?? bld?.rate ?? RATES.carpet.T2[cls]; notes.push(`${prod || 'Carpet'} used because T2 ran out — charged the T2 price.`); }
        if (unit) {
          // building unit: price per unit or per yard from the manual's Buildings list
          const label = `Unit — ${unit}${bName ? ' (' + bName + ')' : ''}`, price = bld && bld['price' + unit];
          if (!bld) { flags.push(`Unit ${unit}: which building is this? Pick it on the job.`); missing.push({ kind: 'buildingName', unit }); }
          if (!onFile || add) {
            if (has(price)) charge.push({ label, qty: custQty, unit: 'yds', rate: null, rateText: `Building price per ${unit}`, amount: r2(price), note: ftNote });
            else if (has(bld?.rate)) C(label, custQty, 'yds', bld.rate, null, chgNote);
            else { T(label, custQty, 'yds', 'On file', chgNote); if (bld) missing.push({ kind: 'building', building: bName, unit }); }
          }
        } else if (!onFile || add) {
          if (has(cRate)) C(`Carpet ${prod}`, custQty, 'yds', cRate, null, chgNote, has(it.chargeRate) || has(own) || forT2 ? undefined : `carpet.${prod}.${cls}`);
          else if (prod) {
            flags.push(rate ? `No ${cls} customer rate for carpet ${prod} — look up the rate.` : `Carpet product "${prod}" not in manual — look up the rate.`);
            missing.push({ kind: 'carpet', product: prod, cls });
          }
        }
        const label = `Carpet${it.glueDown ? ' (glue down)' : ''}`;
        P(label, payQty, 'yds', rate ? rate.pay : RATES.carpetDefaultPay, null, payNote, rate ? `carpet.${prod}.pay` : 'carpetDefaultPay');
        const noPad = it.glueDown || it.runner || it.padding === 'ours' || it.padding === 'none' || rate?.noPadding;
        if (!noPad) P('Padding', payQty, 'yds', RATES.paddingPay, null, undefined, 'paddingPay');
        else if (it.padding === 'ours') notes.push('Our 8lb padding — do not pay installer for padding.');
        return;
      }

      if (t === 'vinyl') {
        if (!has(it.qty) && !has(it.installerQty)) { flags.push(`Vinyl${it.product ? ' ' + it.product : ''}: no quantity entered — not billed or paid.`); return; }
        const custQty = has(it.qty) ? it.qty : it.installerQty;
        const payQty = it.payInstallerQty ? it.installerQty : lower(it.qty, it.installerQty);
        const vOwn = cust?.vinylRate ?? bld?.vinylRate;
        // standard price by kind: glue-down 20 mil, click 20 mil, or 12 mil (glue-down or click)
        const vKey = it.glueDown20mil ? 'glueDown20mil' : it.click20mil && has(RATES.vinyl.click20mil) ? 'click20mil' : 'charge';
        const std = RATES.vinyl[vKey];
        const cRate = has(it.chargeRate) ? it.chargeRate : has(vOwn) ? vOwn : std;
        const vName = (it.laminate ? 'Laminate' : 'Vinyl') + (it.product ? ' ' + it.product : '');
        // laminate: customer price is per estimate, installer paid the same as vinyl
        if (it.laminate && !has(it.chargeRate)) { if (!onFile) flags.push(`${vName}: customer price is per estimate — enter the charge rate.`); }
        // (label unchanged: changes made on the bill are saved against it)
        else C(vName, custQty, 'sqf', cRate, null, add, has(it.chargeRate) || has(vOwn) ? undefined : 'vinyl.' + vKey);        if (it.specialDesign && !has(it.payRate)) { flags.push('Special design vinyl — installer pay TBD, ask Yisroel.'); return; }
        P(vName, payQty, 'sqf', has(it.payRate) ? it.payRate : RATES.vinyl.pay, null,
          it.payInstallerQty ? 'Paid the installer\'s own quantity (per job note)' : lowNote(it.qty, it.installerQty, 'sqf'), has(it.payRate) ? undefined : 'vinyl.pay');
        // The estimate's vinyl price tells whether prep/luan is already in it (manual):
        // about $5 = luan is in it (wood subfloor); about $4–$4.25 = concrete, patch is in it (no luan on concrete)
        if (has(it.estimateRate)) {
          const er = Number(it.estimateRate), $er = '$' + er.toFixed(2) + '/sqf';
          const luanFrom = RATES.vinyl.estLuanFrom, patchFrom = RATES.vinyl.estPatchFrom;
          const askLuan = items.some((i) => i.type === 'luan' && !i.addToCustomer), askPatch = items.some((i) => i.type === 'patch' && !i.addToCustomer);
          if (er <= std) { if (askLuan || askPatch) flags.push(`Estimate vinyl is ${$er} (standard) — the patch/luan is not in the price. Add it to the customer as an estimate change?`); }
          else if (has(luanFrom) && er >= luanFrom) notes.push(`Estimate vinyl is ${$er} (about $5) — luan is usually in that price${askLuan ? ', so the installer\'s luan makes sense' : ''}. No extra charge to the customer.`);
          else if (has(patchFrom) && er >= patchFrom) {
            notes.push(`Estimate vinyl is ${$er} (the $4–$4.25 range) — concrete floor, patch is in the price${askPatch ? ', so the installer\'s patch makes sense' : ''}. No extra charge to the customer.`);
            if (askLuan) flags.push(`Estimate vinyl is ${$er} — that's the concrete/patch price, and we don't use luan on concrete. Check the installer's luan.`);
          } else notes.push(`Estimate vinyl is ${$er}, above the standard $${std.toFixed(2)} — prep is in the price, no extra charge to the customer.`);
        }
        return;
      }

      if (t === 'luan') {
        const cover = luans * RATES.luanSqf;
        const lNote = laidSqf && Math.abs(cover - laidSqf) / laidSqf <= 0.25 ? `${luans} × ${RATES.luanSqf} = ${cover} sqf ≈ ${laidSqf} sqf vinyl ✓` : undefined;
        C('Luan', it.count, 'ea', has(it.chargeRate) ? it.chargeRate : RATES.luanCharge, null, add ? (lNote ? 'ADD ' + lNote : add) : lNote, has(it.chargeRate) ? undefined : 'luanCharge');
        P('Luan', it.count, 'ea', RATES.luanPay, null, lNote, 'luanPay');
        return;
      }

      // Common hallway at a building: yards and price from the manual's Buildings list
      if (t === 'hallway') {
        const q = has(it.qty) ? it.qty : bld?.hallYds;
        const label = 'Common hallway' + (bName ? ` (${bName})` : '');
        if (!onFile || add) {
          if (has(bld?.hallPrice)) charge.push({ label, qty: has(q) ? q : null, unit: 'yds', rate: null, rateText: 'Building price', amount: r2(bld.hallPrice) });
          else if (has(q) && has(bld?.rate)) C(label, q, 'yds', bld.rate, null, add);
          else { T(label, q, 'yds', 'On file', add); missing.push({ kind: 'hall', building: bName }); }
        }
        if (!has(q)) { flags.push('Common hallway: yards not known — installer pay not written yet.'); return; }
        P(label + ' — carpet', q, 'yds', RATES.carpetDefaultPay, null, undefined, 'carpetDefaultPay');
        if (!it.noPadding) P('Padding — hallway', q, 'yds', RATES.paddingPay, null, undefined, 'paddingPay');
        return;
      }

      if (t === 'ripup') {
        const mat = it.material || 'carpet';
        if (it.haulOnly) {
          const q = has(it.qty) ? it.qty : customerCarpetYds;
          C('Haul away only', q, 'yds', RATES.ripup.haulOnly.charge, null, add, 'ripup.haulOnly.charge');
          return; // no installer pay
        }
        if (mat === 'carpet') {
          const custQ = customerCarpetYds || it.qty; // customer rip-up always matches customer carpet yardage
          const officeQ = has(it.qty) ? it.qty : (customerCarpetYds || undefined); // no carpet on the job: go by the installer's number
          const instQ = it.installerQty ?? (carpetItems[0] && lower(carpetItems[0].qty, carpetItems[0].installerQty));
          const payQ = lower(officeQ, instQ), ripNote = lowNote(officeQ, it.installerQty, 'yds');
          if (it.noHaul) {
            C('Rip up carpet (leave onsite)', custQ, 'yds', RATES.ripup.carpetOnsite.charge, null, add, 'ripup.carpetOnsite.charge');
            if (!it.noPay) P('Rip up carpet (no haul)', payQ, 'yds', RATES.ripup.carpetOnsite.pay, null, ripNote, 'ripup.carpetOnsite.pay');
          } else {
            const rOwn = cust?.ripupRate ?? bld?.ripupRate;
            const cr = has(it.chargeRate) ? it.chargeRate : has(rOwn) ? rOwn : RATES.ripup.carpetHaul[cls];
            C('Rip up & haul away carpet', custQ, 'yds', cr, null, add, has(it.chargeRate) || has(rOwn) ? undefined : `ripup.carpetHaul.${cls}`);
            if (!it.noPay) P('Rip up & haul away carpet', payQ, 'yds', RATES.ripup.carpetHaul.pay, null, ripNote, 'ripup.carpetHaul.pay');
          }
          if (it.noPay) notes.push('Do not pay installer for rip up.');
          return;
        }
        // vinyl / click / laminate / vct
        const tile = mat === 'carpetTile';
        const q = has(it.qty) ? it.qty : tile ? customerCarpetYds : vinylSqf;
        const payQ = lower(q, it.installerQty);
        const rk = tile ? 'carpetTile' : mat === 'vct' ? 'vct' : 'vinyl', rr = RATES.ripup[rk];
        const label = `Rip up ${tile ? 'carpet tile' : mat === 'vct' ? 'VCT' : mat}`;
        const u = tile ? 'yds' : 'sqf';
        if (has(rr.charge) || has(it.chargeRate)) C(label, q, u, has(it.chargeRate) ? it.chargeRate : rr.charge, null, add, has(it.chargeRate) ? undefined : `ripup.${rk}.charge`);
        else if (!onFile) flags.push(`${label}: no customer rate in manual — look up the rate.`);
        if (!it.noPay) P(label, payQ, u, rr.pay, null, lowNote(q, it.installerQty, u), `ripup.${rk}.pay`);
        return;
      }

      if (t === 'steps') {
        const style = it.style || 'box';
        if (!it.style) notes.push('Step type not stated — box.');
        if (style === 'floating' || style === 'vinyl') {
          const n = it.steps;
          if (!has(n)) { flags.push(`${style} steps: need the number of steps.`); return; }
          const flo = style === 'floating';
          const pk = flo ? 'floatingPerStep' : (hasCarpetRipup || it.ripup) ? 'vinylPerStepRipup' : 'vinylPerStep';
          if (has(it.chargeTotal)) C(`Steps — ${style}`, null, null, null, it.chargeTotal, add);
          else if (flo && has(RATES.steps.floatingChargePerStep)) C('Steps — floating', n, 'steps', RATES.steps.floatingChargePerStep, null, add, 'steps.floatingChargePerStep');
          else if (!onFile) flags.push(`${style} steps: customer charge is set per job — ask Yisroel.`);
          P(`Steps — ${style}`, n, 'steps', RATES.steps[pk], null, undefined, `steps.${pk}`);
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
        const name = { box: 'Box steps', mixed: 'Mixed flight (box + cap)', cap: 'Full cap steps' }[style];
        // Short box flight: the customer pays a full flight, the installer gets half
        const maxShort = RATES.steps.halfFlightMaxSteps;
        const short = style === 'box' && Number(flights) === 1 && !bc && has(it.steps) && has(maxShort) && Number(it.steps) <= maxShort;
        const payFlights = short ? 0.5 : flights;
        const payTotal = base.pay * payFlights + bc * RATES.steps.birdcage.pay;
        // birdcage + rip-up add-ons are folded in, never their own lines
        C(name, flights, 'flights', bc ? null : chargePer, chargeTotal, add, bc || ripAdd || has(it.chargeTotal) ? undefined : `steps.${style}.charge`);
        if (it.noPay) notes.push('Do not pay installer step labor.');
        else P(short ? `${name} (${it.steps} steps)` : name, payFlights, 'flights', bc ? null : base.pay, payTotal,
          short ? `${it.steps} steps — half a flight` : undefined, bc ? undefined : `steps.${style}.pay`);
        return;
      }

      if (t === 'stringers') {
        const ck = (cls === 'residential' && (hasCarpetRipup || it.ripup)) ? 'residentialRipup' : 'charge';
        C('Stringers', it.count, 'ea', has(it.chargeRate) ? it.chargeRate : RATES.stringers[ck], null, add, has(it.chargeRate) ? undefined : `stringers.${ck}`);
        P('Stringers', lower(it.count, it.installerCount), 'ea', RATES.stringers.pay, null, lowNote(it.count, it.installerCount, ''), 'stringers.pay');
        return;
      }

      if (t === 'shoe') {
        const q = has(it.qty) ? it.qty : it.installerQty;
        C('Shoe molding', q, 'lf', has(it.chargeRate) ? it.chargeRate : RATES.shoe[cls], null, add, has(it.chargeRate) ? undefined : `shoe.${cls}`);
        P('Shoe molding', lower(it.qty, it.installerQty), 'lf', RATES.shoe.pay, null, lowNote(it.qty, it.installerQty, 'lf'), 'shoe.pay');
        return;
      }

      if (t === 'transition') {
        const kind = it.kind || 'metal';
        const price = has(it.price) ? it.price : RATES.transitions[kind];
        C(`${kind[0].toUpperCase() + kind.slice(1)} transition`, it.count || 1, 'ea', price, null, add, has(it.price) ? undefined : `transitions.${kind}`);
        return; // never pay installer
      }

      if (t === 'cove') {
        const q = has(it.qty) ? it.qty : it.installerQty;
        const ck = it.special ? 'special' : 'standard';
        const cOwn = cust?.coveRate;
        const cr = has(it.chargeRate) ? it.chargeRate : has(cOwn) ? cOwn : RATES.cove[ck];
        C(`Cove base${it.color ? ' (' + it.color + ')' : ''}`, q, 'ft', cr, null, add, has(it.chargeRate) || has(cOwn) ? undefined : `cove.${ck}`);
        if (!has(it.chargeRate) && !has(cOwn)) notes.push('Cove base: check email history for a customer-specific rate before using standard.');
        P('Cove base', lower(it.qty, it.installerQty), 'ft', RATES.cove.pay, null, lowNote(it.qty, it.installerQty, 'ft'), 'cove.pay');
        return;
      }

      if (t === 'patch') {
        if (has(it.flatCharge)) C('Prep/patch', null, null, null, it.flatCharge, add ? add : 'Flat rate');
        else if (has(it.chargePerBag)) C('Prep/patch', it.bags, 'bags', it.chargePerBag, null, add);
        else if (!onFile) flags.push('Prep/patch: customer charge not given (per bag or flat) — confirm with office.');
        const perSqf = laidSqf ? bags * RATES.patchPayPerBag / laidSqf : null;
        const pNote = has(perSqf) && perSqf <= RATES.patchMaxPerSqf ? `${bags} bags on ${laidSqf} sqf = $${perSqf.toFixed(2)}/sqf, within $${RATES.patchMaxPerSqf} ✓` : undefined;
        P('Prep/patch', it.bags, 'bags', RATES.patchPayPerBag, null, pNote, 'patchPayPerBag');
        return;
      }

      if (t === 'appliance') {
        const n = it.count || 1;
        C('Toilet/appliance removal', n, 'ea', RATES.appliance.charge, null, add, 'appliance.charge');
        const pk = it.reinstalled === false ? 'payNotReinstalled' : 'pay';
        if (!it.payRequested) return; // installer didn't ask: not paid
        const onEst = it.onEstimate || (onFile && estLines?.length > 0 && !notOnEst.has(it));
        if (onEst || it.confirmed || job._final) { P('Toilet/appliance removal', n, 'ea', RATES.appliance[pk], null, onEst ? undefined : 'Not on the estimate — Yisroel confirmed', `appliance.${pk}`); return; }
        if (it.noPay) { notes.push('Installer asked for appliance pay — not on the estimate, not paid.'); return; }
        const q = `Installer asked for appliance pay (${n}) but it's not on the estimate — not paid yet. Pay it?`;
        flags.push(q); payAsks.push({ q, i: idx, key: 'confirmed' });
        return;
      }

      // Priced work from the manual's "Other work" list (e.g. restretch per room)
      if (t === 'extra') {
        const list = RATES.extras || [], i = list.findIndex((x) => x.name === it.name), x = list[i];
        if (!x) { flags.push(`"${it.name || 'Other work'}" is not in the manual's Other work list.`); return; }
        const q = has(it.qty) ? Number(it.qty) : 1;
        if (x.note) notes.push(`${x.name}: ${x.note}`);
        if (has(it.chargeAmount)) C(x.name, null, null, null, it.chargeAmount, add);
        else if (has(x.charge)) C(x.name, q, x.unit, x.charge, null, add, `extras.${i}.charge`);
        else if (!onFile && !x.payOnly) flags.push(`${x.name}: no customer price in the manual — ask Yisroel.`);
        if (x.noPay) return; // the manual says do not pay the installer for this
        if (has(it.payAmount)) P(x.name, null, null, null, it.payAmount);
        else if (has(x.pay)) P(x.name, q, x.unit, x.pay, null, undefined, `extras.${i}.pay`);
        else flags.push(`${x.name}: installer pay is set per job — enter it on the job.`);
        return;
      }

      if (t === 'furniture') {
        if (job.unitEmpty) { notes.push('Unit empty — furniture skipped.'); return; }
        if (has(it.charge)) C('Furniture moving', null, null, null, it.charge, add);
        if (it.onEstimate) {
          P('Furniture moving', null, null, null, lower(it.estimateAmount, it.installerAmount));
          if (has(it.installerAmount) && has(it.estimateAmount) && it.installerAmount > it.estimateAmount)
            flags.push(`Furniture: installer asked $${it.installerAmount}, estimate has $${it.estimateAmount} — paid lower, confirm with Yisroel.`);
        } else if (has(it.installerAmount)) {
          // asked for but not on the estimate: put in, flagged until Yisroel confirms
          P('Furniture moving', null, null, null, it.installerAmount, it.confirmed ? undefined : 'Not on the estimate');
          if (!it.confirmed) flags.push(`Furniture not on the estimate — installer asked $${it.installerAmount}, put in. Confirm with Yisroel (tick "Yisroel confirmed").`);
        }
        return;
      }

      if (t === 'gas' && bld?.noGas && !has(it.amount)) { flags.push(`${bName}: no gas at this building — not paid. Enter an amount if Yisroel says to pay it.`); return; }
      if (t === 'gas') {
        const amt = has(it.amount) ? it.amount : RATES.gasDefault;
        if (it.noPay) { notes.push('Gas asked for — not approved, not paid.'); return; }
        if (!it.approved && !job._final) { const q = `Installer asked for gas ($${amt}) — approved?`; flags.push(q); payAsks.push({ q, i: idx, key: 'approved' }); return; }
        P('Gas', null, null, null, amt, has(it.amount) ? undefined : `Standard $${RATES.gasDefault}`); return;
      }

      if (t === 'trip') {
        if (has(it.charge)) C('Trip charge', null, null, null, it.charge, add);
        if (it.noPay) notes.push('No extra pay for trip.');
        else P('Trip charge', null, null, null, has(it.pay) ? it.pay : TRIP_PAY(), has(it.pay) ? undefined : `Standard $${TRIP_PAY()}`);
        return;
      }

      // repair, grinding and trip ride along with a bigger job: no $100 minimum of their own (they are dollar lines)
      if (t === 'repair') {
        if (has(it.charge)) C(`Repair${it.label ? ' — ' + it.label : ''}`, null, null, null, it.charge, add);
        else if (!onFile) flags.push('Repair: no customer charge entered — ask Yisroel.');
        P(`Repair${it.label ? ' — ' + it.label : ''}`, null, null, null, has(it.pay) ? it.pay : REPAIR_PAY(), has(it.pay) ? undefined : `Standard $${REPAIR_PAY()}`);
        return;
      }

      if (t === 'custom') {
        const label = it.label || 'Other work';
        // "Other work" picked from the list: Grinding has no set price, Repair and Trip charge have a standard pay
        if (!has(it.payAmount) && !has(it.payRate) && !it.noPay) {
          if (/^grind/i.test(label)) flags.push('Grinding: no set price — enter the installer pay from the installer\'s notes.');
          else if (/^repair/i.test(label)) it = { ...it, payAmount: REPAIR_PAY() };
          else if (/^trip/i.test(label)) it = { ...it, payAmount: TRIP_PAY() };
        }
        if (has(it.chargeAmount) || has(it.chargeRate)) C(label, it.chargeQty ?? it.qty ?? null, it.unit ?? null, it.chargeRate ?? null, it.chargeAmount ?? null, add);
        else if (has(it.rateText)) T(label, it.chargeQty ?? it.qty, it.unit ?? null, it.rateText, add);
        if (has(it.payAmount) || has(it.payRate)) P(label, it.payQty ?? (has(it.payRate) ? it.qty : null) ?? null, it.unit ?? null, it.payRate ?? null, it.payAmount ?? null);
        return;
      }

      flags.push(`Unknown item type "${t}" — not billed.`);
    }
  }

  // Every line gets a key ("pay|Carpet|0") so a change made on the bill sticks to that line
  function applyEdits(job, side, lines, flags, used) {
    const seen = {};
    const out = [];
    lines.forEach((l) => {
      const base = side + '|' + l.label; const n = seen[base] = (seen[base] ?? -1) + 1;
      l.key = base + '|' + n;
      const e = (job.edits || {})[l.key];
      if (!e) { out.push(l); return; }
      used.add(l.key);
      if (e.remove) return;
      const q = has(e.qty) ? Number(e.qty) : l.qty, rt = has(e.rate) ? Number(e.rate) : l.rate;
      const amount = has(e.amount) ? Number(e.amount) : has(q) && has(rt) ? r2(q * rt) : l.amount;
      out.push({ ...l, qty: q, rate: rt, amount: has(amount) ? r2(amount) : null, rateText: has(amount) ? undefined : l.rateText,
        note: [has(e.note) ? e.note : l.note, e.by ? 'Per ' + e.by : ''].filter(Boolean).join(' — '), edited: true });
    });
    return out;
  }
  const sum = (lines) => r2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const REPAIR_PAY = () => RATES.repairDefaultPay ?? 50, TRIP_PAY = () => RATES.tripPay ?? 50;

  function finish(job, cls, charge, pay, flags, notes, opts) {
    const used = new Set();
    charge = applyEdits(job, 'charge', charge, flags, used);
    pay = applyEdits(job, 'pay', pay, flags, used);
    Object.keys(job.edits || {}).forEach((k) => { if (!used.has(k)) flags.push(`A change to "${k.split('|')[1]}" no longer matches a line on this job — check it.`); });
    const payEdited = pay.some((l) => l.edited);
    let payTotal = sum(pay);

    if (has(job.payOverride)) {
      // Yisroel's explicit figure wins over itemized calc and the minimum
      const diff = r2(job.payOverride - payTotal);
      if (diff !== 0) pay.push({ label: 'Adjustment to agreed pay', amount: diff, note: `Pay set to $${job.payOverride} per Yisroel` });
      payTotal = r2(job.payOverride);
    } else if (!opts.skipMin && !payEdited && job.status !== 'correction' && (!job.returnTrip || job.returnTrip === 'ours') && pay.some((l) => l.qty !== null && l.qty !== undefined)) {
      // a pay line changed by hand means Yisroel set the pay, so no minimum top-up
      const base = RATES.minPayExcludesGas ? sum(pay.filter((l) => l.label !== 'Gas')) : payTotal;
      if (base < RATES.minInstallerPay) {
        // small job: one flat-rate line instead of the rate lines plus a top-up (gas stays its own line)
        const work = pay.filter((l) => !(RATES.minPayExcludesGas && l.label === 'Gas')), gas = pay.filter((l) => !work.includes(l));
        const label = work.length === 1 ? work[0].label : 'Whole job (' + work.map((l) => l.label.toLowerCase()).join(', ') + ')';
        pay = [{ label, qty: null, unit: null, rate: null, amount: r2(RATES.minInstallerPay),
          note: `Flat rate rule — small job, $${RATES.minInstallerPay} minimum (by the rates it came to $${base.toFixed(2)})` }].concat(gas);
        payTotal = sum(pay);
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
      chargeTotal: sum(charge),
      payTotal,
      notes,
      flags,
    };
  }

  function computeWeek(week) {
    const jobs = (week.jobs || []).map((j) => computeJob(week.final ? { ...j, _final: true } : j));
    const byInstaller = {}, sep = RATES.separateChecks || ['Mynor'];
    const words = (x) => " " + String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
    const checkOf = (name) => sep.find((s) => words(name).includes(words(s))) || "Crew check";
    jobs.forEach((j) => { if (j.payTotal) { const k = checkOf(j.installer); byInstaller[k] = r2((byInstaller[k] || 0) + j.payTotal); } });
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
    computeJob, computeWeek, findCustomer, customerAtAddress, buildingYardage,
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
