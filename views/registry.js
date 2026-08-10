/* ═══════════════════════════════════════════════════════════════════════════
   View registry — the shell builds its tab bar from this list, in this order.

   Adding a view:
     1. make a folder beside this one, e.g. views/timeline/
     2. add an entry here with ready: true
     3. the shell hands it the indexed model (BraidCore.index) and the shared
        selection; the view returns geometry, never its own copy of the model

   `ready: false` keeps a planned view visible in the plan but out of the tab
   bar, so this file doubles as the roadmap.
   ═══════════════════════════════════════════════════════════════════════════ */
window.BraidViews = [
  { id: 'map',        label: 'Map',           folder: 'views/map',        ready: true,
    note: 'Ground plan from part_of, marks in their block, ties routed as roads' },
  { id: 'tree',       label: 'Institutions',  folder: 'views/structures', ready: true,
    note: 'part_of printed as an index — containment without geometry' },
  { id: 'graph',      label: 'Graph (debug)', folder: 'views/graph',      ready: true,
    note: 'Force-directed layout, kept for checking the tie model against the map' },
  { id: 'timeline',   label: 'Timeline',      folder: 'views/timeline',   ready: false,
    note: 'Events on a date scale, banded by thread; shares the as-of date' },
  { id: 'relations',  label: 'Relations',     folder: 'views/relations',  ready: false,
    note: 'Ties as a reading list, grouped by type and confidence' },
  { id: 'index',      label: 'Index',         folder: 'views/index',      ready: false,
    note: 'Every actor and body, sortable, with counts' },
  { id: 'feed',       label: 'Feed',          folder: 'views/feed',       ready: false,
    note: 'Records newest first, filtered by thread and confidence' }
];
