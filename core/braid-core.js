/* ═══════════════════════════════════════════════════════════════════════════
   Braid core — the model every view shares.

   No UI, no layout, no colour. This file answers only: what is in the braid,
   what connects to what, and what is true on a given date. Views (map,
   timeline, relations, index, structures) build their own geometry on top of
   it and must not re-implement anything here — the schema doc's warning about
   clones drifting on rules applies to code as much as to documents.

   Loads as a plain script and registers window.BraidCore. No build step.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* the day the record is read as "now" when a position carries no end date */
  var TODAY = '2026-08-09';

  function money(v) {
    if (v == null) return 'undisclosed';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'bn';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'm';
    if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'k';
    return '$' + v;
  }

  /* a post is live if it has not ended by the date being read */
  function live(p, asof) { return !p.end || p.end > (asof || TODAY); }

  /* a tie is open at a date, or it is not: posts by their term, records by
     their date, nesting always. This is the single definition of "present
     day" for the whole application. */
  function openAt(t, asof) {
    if (t.type === 'part_of') return true;
    if (t.type === 'position') return (!t.start || t.start <= asof) && (!t.end || t.end > asof);
    return !t.start || t.start <= asof;
  }

  /* how a body is titled when there is no room for its full name */
  function shortLabel(m, id) {
    var o = m.orgMap[id];
    if (!o) { var a = m.actorMap[id]; return a ? a.name : id; }
    if (o.acronym) return o.acronym;
    var n = String(o.name || '').replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/^the\s+/i, '').replace(/^(united states|u\.s\.|us)\s+/i, '')
      .replace(/^government of\s+/i, '').trim();
    return n.length >= 3 ? n : String(o.name || id);
  }

  /* ── ties ──────────────────────────────────────────────────────────────
     Every atomic connection the braid states, collapsed so one pair of
     entities carries one tie per type, with the records that produced it.
     Five types, and no view may invent a sixth without adding it here.   */
  var TIE_TYPES = ['position', 'part_of', 'coappear', 'stance', 'money'];

  function buildTies(db, m) {
    var ties = [], key = {};
    var has = function (id) { return !!(m.actorMap[id] || m.orgMap[id]); };
    var nameOf = function (id) { var n = m.actorMap[id] || m.orgMap[id]; return n ? n.name : id; };

    function add(from, to, type, label, when) {
      if (!from || !to || from === to || !has(from) || !has(to)) return;
      var a = from < to ? from : to, b = from < to ? to : from;
      var k = a + '|' + b + '|' + type, w = when || {};
      if (key[k]) {
        var t2 = key[k];
        t2.n++;
        if (label && t2.labels.length < 4) t2.labels.push(label);
        if (w.start && (!t2.start || w.start < t2.start)) t2.start = w.start;
        if (!w.end) t2.end = null; else if (t2.end && w.end > t2.end) t2.end = w.end;
        return;
      }
      var t = { from: from, to: to, type: type, n: 1, labels: label ? [label] : [], start: w.start || null, end: w.end || null };
      key[k] = t; ties.push(t);
    }

    m.evc = {}; m.evOf = {};
    (db.events || []).forEach(function (ev) {
      var parts = [];
      [].concat(ev.actors || [], ev.orgs || []).forEach(function (x) { if (x && x.id) parts.push(x.id); });
      var f = ev.money_flow, on = { start: ev.date || null, end: null };
      if (f && f.from && f.to) add(f.from, f.to, 'money', money(f.amount) + (f.purpose ? '  \u00b7  ' + f.purpose : ''), on);
      if (ev.stance && ev.stance.holder) add(ev.stance.holder, ev.stance.toward, 'stance', (ev.stance.valence || '') + (ev.stance.basis ? '  \u00b7  ' + ev.stance.basis : ''), on);
      if (ev.procedure) { if (ev.procedure.actor) parts.push(ev.procedure.actor); if (ev.procedure.toward) parts.push(ev.procedure.toward); }
      var uniq = parts.filter(function (v, i) { return parts.indexOf(v) === i && has(v); });
      for (var i = 0; i < uniq.length; i++) for (var j = i + 1; j < uniq.length; j++) add(uniq[i], uniq[j], 'coappear', ev.summary, on);
      uniq.forEach(function (id) { m.evc[id] = (m.evc[id] || 0) + 1; (m.evOf[id] = m.evOf[id] || []).push(ev); });
      if (f) [f.from, f.to].forEach(function (id) {
        if (has(id) && uniq.indexOf(id) < 0) { m.evc[id] = (m.evc[id] || 0) + 1; (m.evOf[id] = m.evOf[id] || []).push(ev); }
      });
    });
    (db.actors || []).forEach(function (a) {
      (a.positions || []).forEach(function (p) {
        add(a.id, p.entity, 'position', p.title || 'position', { start: p.start || null, end: p.end || null });
      });
    });
    (db.orgs || []).forEach(function (o) {
      if (o.part_of) add(o.id, o.part_of, 'part_of', 'part of ' + nameOf(o.part_of));
    });
    return ties;
  }

  /* ── containment ───────────────────────────────────────────────────────
     part_of read as a tree: which bodies hold others, how many posts each
     carries, which stand alone. The map draws districts from this and the
     structures outline prints it directly.                                */
  function buildTree(db, m) {
    var orgs = db.orgs || [];
    m.kids = {}; m.posts = {};
    orgs.forEach(function (o) {
      if (o.part_of && m.orgMap[o.part_of]) (m.kids[o.part_of] = m.kids[o.part_of] || []).push(o.id);
    });
    (db.actors || []).forEach(function (a) {
      (a.positions || []).forEach(function (p) {
        if (!m.orgMap[p.entity]) return;
        var s = m.posts[p.entity] = m.posts[p.entity] || { all: 0, live: 0 };
        s.all++; if (live(p)) s.live++;
      });
    });
    var size = function (id) {
      var n = 1;
      (m.kids[id] || []).forEach(function (k) { n += size(k); });
      return n;
    };
    m.subtree = {};
    orgs.forEach(function (o) { m.subtree[o.id] = size(o.id); });
    var nameOf = function (id) { var n = m.actorMap[id] || m.orgMap[id]; return n ? n.name : id; };
    var byName = function (a, b) { return nameOf(a).localeCompare(nameOf(b)); };
    Object.keys(m.kids).forEach(function (k) {
      m.kids[k].sort(function (a, b) { return (m.subtree[b] - m.subtree[a]) || byName(a, b); });
    });
    var roots = orgs.filter(function (o) { return !(o.part_of && m.orgMap[o.part_of]); }).map(function (o) { return o.id; });
    m.roots = roots.filter(function (id) { return (m.kids[id] || []).length; })
      .sort(function (a, b) { return (m.subtree[b] - m.subtree[a]) || byName(a, b); });
    m.loose = roots.filter(function (id) { return !(m.kids[id] || []).length; }).sort(byName);
  }

  /* ── the one entry point ───────────────────────────────────────────────
     Hand it a parsed political-braid.json; get back the indexed model every
     view reads. Cheap enough to call once at load, expensive enough that it
     should never be called twice — the shell owns the result.             */
  function index(db) {
    var m = { db: db, actorMap: {}, orgMap: {} };
    (db.actors || []).forEach(function (a) { m.actorMap[a.id] = a; });
    (db.orgs || []).forEach(function (o) { m.orgMap[o.id] = o; });
    m.ties = buildTies(db, m);
    buildTree(db, m);
    m.counts = {
      actors: (db.actors || []).length,
      orgs: (db.orgs || []).length,
      events: (db.events || []).length,
      threads: (db.threads || []).length,
      ties: m.ties.length
    };
    return m;
  }

  global.BraidCore = {
    TODAY: TODAY,
    TIE_TYPES: TIE_TYPES,
    index: index,
    openAt: openAt,
    live: live,
    money: money,
    shortLabel: shortLabel,
    nameOf: function (m, id) { var n = m.actorMap[id] || m.orgMap[id]; return n ? n.name : id; },
    isOrg: function (m, id) { return !!m.orgMap[id]; }
  };
})(window);
