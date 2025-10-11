import { type AppZoneNode, type CombinedNode } from "@/lib/types";
import { clsx, type ClassValue } from "clsx";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { twMerge } from "tailwind-merge";

export const MAX_SEARCH_DISTANCE = 20;
export const OVERLAP_OFFSET = 20;
export const DEFAULT_TABLE_WIDTH = 288;
export const DEFAULT_TABLE_HEIGHT = 100;
export const DEFAULT_NOTE_WIDTH = 192;
export const DEFAULT_NOTE_HEIGHT = 192;
export const DEFAULT_ZONE_WIDTH = 300;
export const DEFAULT_ZONE_HEIGHT = 300;
export const DEFAULT_NODE_SPACING = 50;

export function getCanvasDimensions(): { width: number; height: number } {
  const selectors = [
    '.react-flow__viewport',
    '.react-flow',
    '[data-panel-id]',
    '.react-flow__renderer'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) {
        return { width: rect.width, height: rect.height };
      }
    }
  }
  
  // fallback: use window dimensions
  return { width: window.innerWidth, height: window.innerHeight };
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
interface MigrationFile {
  filename: string;
  content: string;
}

export async function downloadZip(
  files: MigrationFile[],
  zipName: string
): Promise<void> {
  if (files.length === 0) {
    throw new Error("No files to download");
  }

  const zip = new JSZip();
  files.forEach((file) => {
    zip.file(file.filename, file.content);
  });

  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, zipName);
}

/**
 * Check if a point is inside a rectangle
 */
function isPointInRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Check if a node is completely inside a zone
 */
export function isNodeInsideZone(
  node: CombinedNode,
  zone: AppZoneNode
): boolean {
  if (!node.position || !zone.position) return false;

  // Get node dimensions (use defaults if not specified)
  const nodeWidth =
    node.width ||
    (node.type === "table" ? DEFAULT_TABLE_WIDTH : node.type === "note" ? DEFAULT_NOTE_WIDTH : DEFAULT_ZONE_WIDTH);
  const nodeHeight =
    node.height ||
    (node.type === "table" ? DEFAULT_TABLE_HEIGHT : node.type === "note" ? DEFAULT_NOTE_HEIGHT : DEFAULT_ZONE_HEIGHT);

  const zoneWidth = zone.width || DEFAULT_ZONE_WIDTH;
  const zoneHeight = zone.height || DEFAULT_ZONE_HEIGHT;

  // Check if all four corners of the node are inside the zone
  const topLeft = { x: node.position.x, y: node.position.y };
  const topRight = { x: node.position.x + nodeWidth, y: node.position.y };
  const bottomLeft = { x: node.position.x, y: node.position.y + nodeHeight };
  const bottomRight = {
    x: node.position.x + nodeWidth,
    y: node.position.y + nodeHeight,
  };

  const zoneRect = {
    x: zone.position.x,
    y: zone.position.y,
    width: zoneWidth,
    height: zoneHeight,
  };

  return (
    isPointInRect(topLeft, zoneRect) &&
    isPointInRect(topRight, zoneRect) &&
    isPointInRect(bottomLeft, zoneRect) &&
    isPointInRect(bottomRight, zoneRect)
  );
}

/**
 * Find all locked zones that contain a node
 */
export function getLockedZonesForNode(
  node: CombinedNode,
  zones: AppZoneNode[]
): AppZoneNode[] {
  return zones.filter(
    (zone) => zone.data.isLocked && isNodeInsideZone(node, zone)
  );
}

/**
 * Check if a node is inside any locked zone
 */
export function isNodeInLockedZone(
  node: CombinedNode,
  zones: AppZoneNode[]
): boolean {
  return zones.some(
    (zone) => zone.data.isLocked && isNodeInsideZone(node, zone)
  );
}

// Check if two rectangles overlap
function doRectanglesOverlap(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    rect1.x + rect1.width <= rect2.x ||
    rect2.x + rect2.width <= rect1.x ||
    rect1.y + rect1.height <= rect2.y ||
    rect2.y + rect2.height <= rect1.y
  );
}

function isPositionInViewport(
  position: { x: number; y: number },
  nodeWidth: number,
  nodeHeight: number,
  viewportBounds?: { x: number; y: number; width: number; height: number; zoom: number }
): boolean {
  if (!viewportBounds) return true; 
  
  // Convert viewport bounds to flow coordinates
  const viewportX = -viewportBounds.x / viewportBounds.zoom;
  const viewportY = -viewportBounds.y / viewportBounds.zoom;
  const viewportWidth = viewportBounds.width / viewportBounds.zoom;
  const viewportHeight = viewportBounds.height / viewportBounds.zoom;
  
  // Check if the node (with some padding) fits within the viewport
  const padding = DEFAULT_NODE_SPACING;
  return (
    position.x >= viewportX + padding &&
    position.x + nodeWidth <= viewportX + viewportWidth - padding &&
    position.y >= viewportY + padding &&
    position.y + nodeHeight <= viewportY + viewportHeight - padding
  );
}

export function findNonOverlappingPosition(
  existingNodes: CombinedNode[],
  preferredPosition: { x: number; y: number },
  nodeWidth: number = DEFAULT_TABLE_WIDTH,
  nodeHeight: number = DEFAULT_TABLE_HEIGHT,
  spacing: number = DEFAULT_NODE_SPACING,
  viewportBounds?: { x: number; y: number; width: number; height: number; zoom: number }
): { x: number; y: number } {
  
  const isValidPosition = (position: { x: number; y: number }): boolean => {
    const hasOverlap = existingNodes.some((node) => {
      if (!node.position) return false;
      
      const existingRect = {
        x: node.position.x,
        y: node.position.y,
        width: node.width || (node.type === "table" ? DEFAULT_TABLE_WIDTH : node.type === "note" ? DEFAULT_NOTE_WIDTH : DEFAULT_ZONE_WIDTH),
        height: node.height || (node.type === "table" ? DEFAULT_TABLE_HEIGHT : node.type === "note" ? DEFAULT_NOTE_HEIGHT : DEFAULT_ZONE_HEIGHT),
      };

      const newRect = { x: position.x, y: position.y, width: nodeWidth, height: nodeHeight };
      return doRectanglesOverlap(newRect, existingRect);
    });
    
    return !hasOverlap && isPositionInViewport(position, nodeWidth, nodeHeight, viewportBounds);
  };

  if (isValidPosition(preferredPosition)) {
    return preferredPosition;
  }

  const gridSize = nodeWidth + spacing;
  for (let distance = 1; distance <= MAX_SEARCH_DISTANCE; distance++) {
    const positions = [
      { x: preferredPosition.x + distance * gridSize, y: preferredPosition.y },
      { x: preferredPosition.x - distance * gridSize, y: preferredPosition.y },
      { x: preferredPosition.x, y: preferredPosition.y + distance * gridSize },
      { x: preferredPosition.x, y: preferredPosition.y - distance * gridSize },
      { x: preferredPosition.x + distance * gridSize, y: preferredPosition.y + distance * gridSize },
      { x: preferredPosition.x - distance * gridSize, y: preferredPosition.y - distance * gridSize },
      { x: preferredPosition.x + distance * gridSize, y: preferredPosition.y - distance * gridSize },
      { x: preferredPosition.x - distance * gridSize, y: preferredPosition.y + distance * gridSize },
    ];

    for (const candidate of positions) {
      if (isValidPosition(candidate)) {
        return candidate;
      }
    }
  }
  
  // If viewport is full, try systematic search across entire viewport
  if (viewportBounds) {
    const viewportX = -viewportBounds.x / viewportBounds.zoom;
    const viewportY = -viewportBounds.y / viewportBounds.zoom;
    const viewportWidth = viewportBounds.width / viewportBounds.zoom;
    const viewportHeight = viewportBounds.height / viewportBounds.zoom;
    
    // Try systematic grid search across the entire viewport
    const gridSpacing = nodeWidth + spacing;
    const maxX = Math.floor(viewportWidth / gridSpacing);
    const maxY = Math.floor(viewportHeight / gridSpacing);
    
    for (let x = 0; x < maxX; x++) {
      for (let y = 0; y < maxY; y++) {
        const candidate = {
          x: viewportX + x * gridSpacing + spacing,
          y: viewportY + y * gridSpacing + spacing
        };
        
        // Check if position has no overlap (allow overlap with viewport bounds)
        const hasOverlap = existingNodes.some((node) => {
          if (!node.position) return false;
          
          const existingRect = {
            x: node.position.x,
            y: node.position.y,
            width: node.width || (node.type === "table" ? DEFAULT_TABLE_WIDTH : node.type === "note" ? DEFAULT_NOTE_WIDTH : DEFAULT_ZONE_WIDTH),
            height: node.height || (node.type === "table" ? DEFAULT_TABLE_HEIGHT : node.type === "note" ? DEFAULT_NOTE_HEIGHT : DEFAULT_ZONE_HEIGHT),
          };

          const newRect = { x: candidate.x, y: candidate.y, width: nodeWidth, height: nodeHeight };
          return doRectanglesOverlap(newRect, existingRect);
        });
        
        if (!hasOverlap && isPositionInViewport(candidate, nodeWidth, nodeHeight, viewportBounds)) {
          return candidate;
        }
      }
    }
    
    // Try center of viewport as last resort before overlap
    const centerPosition = {
      x: viewportX + viewportWidth / 2 - nodeWidth / 2,
      y: viewportY + viewportHeight / 2 - nodeHeight / 2
    };
    
    if (isPositionInViewport(centerPosition, nodeWidth, nodeHeight, viewportBounds)) {
      return centerPosition;
    }
  }
  
  // Final fallback: overlap on last added table
  const lastAddedNode = existingNodes
    .filter(node => node.position)
    .sort((a, b) => {
      const orderA = typeof a.data.order === 'number' ? a.data.order : 0;
      const orderB = typeof b.data.order === 'number' ? b.data.order : 0;
      return orderB - orderA;
    })[0];
  
  if (lastAddedNode && lastAddedNode.position) {
    return {
      x: lastAddedNode.position.x + OVERLAP_OFFSET,
      y: lastAddedNode.position.y + OVERLAP_OFFSET,
    };
  }
  
  return preferredPosition;
}