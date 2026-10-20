import cytoscape, {
  type CollectionReturnValue,
  type Core,
  type ElementDefinition,
  type EventObject,
  type LayoutOptions,
  type StylesheetJson,
} from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

let registered = false;
if (!registered) {
  cytoscape.use(fcose);
  registered = true;
}

export interface GraphNode {
  id: string;
  label: string;
  role: string;
  color: string;
  size: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  color: string;
  width: number;
  line: string;
}

export type Selection = { kind: 'node' | 'edge'; id: string } | null;

export interface GraphHandle {
  zoomBy(factor: number): void;
  fit(): void;
  relayout(): void;
  /** Centre on a node; `yFraction` places it higher (e.g. above a bottom sheet). */
  focus(id: string, yFraction?: number): void;
  toPng(): string | undefined;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selection: Selection;
  dark: boolean;
  onSelect(sel: Selection): void;
  /** Stable seed so the first layout of a book always looks the same. */
  seed: string;
  ariaLabel: string;
}

function themeColors(dark: boolean) {
  return dark
    ? { fg: '#f1ece4', bg: '#14120f', accent: '#e0788a', ring: '#14120f' }
    : { fg: '#1d1a16', bg: '#f7f4ee', accent: '#8b2c3b', ring: '#ffffff' };
}

function buildStyle(dark: boolean): StylesheetJson {
  const c = themeColors(dark);
  const labelBox = {
    'text-background-color': c.bg,
    'text-background-opacity': 0.85,
    'text-background-padding': '2px',
    'text-background-shape': 'roundrectangle',
  } as const;
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        width: 'data(size)',
        height: 'data(size)',
        label: 'data(label)',
        color: c.fg,
        'font-family': '"Figtree Variable", ui-sans-serif, system-ui, sans-serif',
        'font-size': 12,
        'font-weight': 500,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 5,
        'text-wrap': 'wrap',
        'text-max-width': '120px',
        'border-width': 2.5,
        'border-color': c.ring,
        'overlay-opacity': 0,
        'transition-property': 'opacity, border-width',
        'transition-duration': 180,
        ...labelBox,
      },
    },
    { selector: 'node[role = "protagonist"]', style: { 'font-size': 14, 'font-weight': 700, 'border-width': 3.5, 'border-color': c.accent } },
    { selector: 'node[role = "major"]', style: { 'font-weight': 600, 'font-size': 13 } },
    { selector: 'node[role = "minor"]', style: { 'font-size': 10.5 } },
    { selector: 'node.hover', style: { 'border-color': c.accent, 'border-width': 3.5 } },
    {
      selector: 'edge',
      style: {
        width: 'data(width)',
        'line-color': 'data(color)',
        'line-style': 'data(line)' as never,
        'line-dash-pattern': [7, 5],
        'curve-style': 'bezier',
        opacity: 0.5,
        'overlay-padding': 6,
        'overlay-opacity': 0,
        'transition-property': 'opacity, width',
        'transition-duration': 180,
      },
    },
    {
      selector: 'edge.highlighted, edge.hover, edge.selected',
      style: {
        opacity: 1,
        label: 'data(label)',
        color: c.fg,
        'font-family': '"Figtree Variable", ui-sans-serif, system-ui, sans-serif',
        'font-size': 10.5,
        'font-weight': 500,
        'text-rotation': 'autorotate',
        'z-index': 10,
        ...labelBox,
        'text-background-opacity': 0.92,
      },
    },
    { selector: 'edge.selected', style: { width: 5, 'z-index': 20 } },
    { selector: 'node.selected', style: { 'border-width': 5, 'border-color': c.accent, 'z-index': 30 } },
    { selector: 'node.dim', style: { opacity: 0.3, 'text-opacity': 0.4 } },
    { selector: 'edge.dim', style: { opacity: 0.08 } },
    { selector: 'node.faded', style: { opacity: 0.18, 'text-opacity': 0.35 } },
    { selector: 'edge.faded', style: { opacity: 0.06 } },
  ];
}

/** Deterministic PRNG so the initial layout is stable per book. */
function mulberry32(seedStr: string) {
  let a = 0;
  for (let i = 0; i < seedStr.length; i++) a = (Math.imul(a ^ seedStr.charCodeAt(i), 2654435761) + i) | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fade freshly added elements in; nodes arrive with a light stagger. */
function animateEntrance(added: CollectionReturnValue) {
  if (reduceMotion() || added.empty()) return;
  added.style('opacity', 0);
  added.nodes().forEach((n, i) => {
    n.delay(Math.min(i, 30) * 14).animate(
      { style: { opacity: 1 } },
      { duration: 420, easing: 'ease-out-cubic', complete: () => void n.removeStyle('opacity') },
    );
  });
  added.edges().forEach((e) => {
    e.delay(220).animate(
      { style: { opacity: 0.5 } },
      { duration: 500, easing: 'ease-out-cubic', complete: () => void e.removeStyle('opacity') },
    );
  });
}

/** A quick ring pulse on the node that was just selected. */
function pulse(cy: Core, id: string) {
  if (reduceMotion()) return;
  const n = cy.nodes().getElementById(id);
  if (n.empty()) return;
  n.stop(true, false)
    .animate({ style: { 'border-width': 10 } }, { duration: 140, easing: 'ease-out-cubic' })
    .animate({ style: { 'border-width': 5 } }, { duration: 320, easing: 'ease-in-out-cubic', complete: () => void n.removeStyle('border-width') });
}

function runLayout(cy: Core, opts: { randomize: boolean; seed?: string }) {
  if (cy.nodes().length === 0) return;
  const animate = !opts.randomize && !reduceMotion();
  const layoutOpts = {
    name: 'fcose',
    quality: 'proof',
    randomize: opts.randomize,
    animate,
    animationDuration: 500,
    animationEasing: 'ease-out-cubic',
    fit: true,
    padding: 48,
    nodeDimensionsIncludeLabels: true,
    uniformNodeDimensions: false,
    packComponents: true,
    idealEdgeLength: () => 120,
    nodeRepulsion: () => 12000,
    edgeElasticity: () => 0.3,
    nestingFactor: 0.1,
    gravity: 0.3,
    gravityRange: 3.2,
    numIter: 3000,
    tile: true,
    tilingPaddingVertical: 24,
    tilingPaddingHorizontal: 24,
  } as unknown as LayoutOptions;

  const original = Math.random;
  if (opts.seed) Math.random = mulberry32(opts.seed);
  try {
    cy.layout(layoutOpts).run();
  } finally {
    Math.random = original;
  }
}

export const GraphCanvas = forwardRef<GraphHandle, Props>(function GraphCanvas(
  { nodes, edges, selection, dark, onSelect, seed, ariaLabel },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const laidOut = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the Cytoscape instance once.
  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current!,
      style: buildStyle(dark),
      elements: [],
      minZoom: 0.15,
      maxZoom: 3.5,
      boxSelectionEnabled: false,
      autounselectify: true,
      pixelRatio: 'auto',
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (e: EventObject) => onSelectRef.current({ kind: 'node', id: e.target.id() }));
    cy.on('tap', 'edge', (e: EventObject) => onSelectRef.current({ kind: 'edge', id: e.target.id() }));
    cy.on('tap', (e: EventObject) => {
      if (e.target === cy) onSelectRef.current(null);
    });
    cy.on('mouseover', 'node', (e: EventObject) => {
      e.target.addClass('hover');
      e.target.connectedEdges().addClass('hover');
      if (cy.$('.selected').empty()) cy.elements().not(e.target.closedNeighborhood()).addClass('dim');
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    });
    cy.on('mouseout', 'node', (e: EventObject) => {
      e.target.removeClass('hover');
      e.target.connectedEdges().removeClass('hover');
      cy.elements().removeClass('dim');
      if (containerRef.current) containerRef.current.style.cursor = '';
    });
    cy.on('mouseover', 'edge', (e: EventObject) => e.target.addClass('hover'));
    cy.on('mouseout', 'edge', (e: EventObject) => e.target.removeClass('hover'));

    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(containerRef.current!);
    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
      laidOut.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme.
  useEffect(() => {
    cyRef.current?.style(buildStyle(dark));
  }, [dark]);

  // Sync elements with props (add / remove / update), re-layout when the node set changes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edgeIds = new Set(edges.map((e) => e.id));
    let nodesChanged = false;
    let added = cy.collection();

    cy.batch(() => {
      cy.edges().forEach((e) => {
        if (!edgeIds.has(e.id())) e.remove();
      });
      cy.nodes().forEach((n) => {
        if (!nodeIds.has(n.id())) {
          n.remove();
          nodesChanged = true;
        }
      });

      const toAdd: ElementDefinition[] = [];
      for (const n of nodes) {
        const existing = cy.getElementById(n.id);
        if (existing.nonempty()) {
          existing.data(n);
          continue;
        }
        nodesChanged = true;
        // Place newcomers next to an already-placed neighbour for a smooth incremental layout.
        const neighbour = edges
          .filter((e) => e.source === n.id || e.target === n.id)
          .map((e) => cy.getElementById(e.source === n.id ? e.target : e.source))
          .find((el) => el.nonempty());
        const base = neighbour?.position() ?? { x: 0, y: 0 };
        toAdd.push({
          group: 'nodes',
          data: { ...n },
          position: { x: base.x + (Math.random() - 0.5) * 80, y: base.y + (Math.random() - 0.5) * 80 },
        });
      }
      added = added.union(cy.add(toAdd));

      const edgesToAdd: ElementDefinition[] = [];
      for (const e of edges) {
        const existing = cy.getElementById(e.id);
        if (existing.nonempty()) existing.data(e);
        else edgesToAdd.push({ group: 'edges', data: { ...e } });
      }
      added = added.union(cy.add(edgesToAdd));
    });

    if (nodesChanged || !laidOut.current) {
      runLayout(cy, laidOut.current ? { randomize: false } : { randomize: true, seed });
      laidOut.current = true;
    }
    animateEntrance(added);
  }, [nodes, edges, seed]);

  // Pulse the newly selected node.
  const lastPulsed = useRef<string | null>(null);
  useEffect(() => {
    const cy = cyRef.current;
    const id = selection?.kind === 'node' ? selection.id : null;
    if (cy && id && id !== lastPulsed.current) pulse(cy, id);
    lastPulsed.current = id;
  }, [selection]);

  // Selection highlighting.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('faded highlighted selected dim');
      if (!selection) return;
      const el = cy.getElementById(selection.id);
      if (el.empty()) return;
      const keep =
        selection.kind === 'node' ? cy.nodes().getElementById(selection.id).closedNeighborhood() : el.union(cy.edges().getElementById(selection.id).connectedNodes());
      cy.elements().not(keep).addClass('faded');
      keep.edges().addClass('highlighted');
      el.addClass('selected');
    });
  }, [selection, nodes, edges]);

  useImperativeHandle(
    ref,
    () => ({
      zoomBy(factor) {
        const cy = cyRef.current;
        if (!cy) return;
        const level = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor));
        cy.animate({ zoom: { level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }, duration: 180 });
      },
      fit() {
        cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 48 }, duration: 300 });
      },
      relayout() {
        const cy = cyRef.current;
        if (cy) runLayout(cy, { randomize: true, seed: `${seed}:${Date.now()}` });
      },
      focus(id, yFraction = 0.5) {
        const cy = cyRef.current;
        const el = cy?.getElementById(id);
        if (!cy || !el || el.empty() || !el.isNode()) return;
        const zoom = Math.max(cy.zoom(), 1);
        const p = el.position();
        cy.animate({
          zoom,
          pan: { x: cy.width() / 2 - p.x * zoom, y: cy.height() * yFraction - p.y * zoom },
          duration: 350,
          easing: 'ease-in-out-cubic',
        });
      },
      toPng() {
        return cyRef.current?.png({ full: true, scale: 2, bg: themeColors(dark).bg, output: 'base64uri' }) as string | undefined;
      },
    }),
    [seed, dark],
  );

  // Cytoscape forces `position: relative` on its container, so it fills an absolutely positioned wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" role="img" aria-label={ariaLabel} />
    </div>
  );
});
