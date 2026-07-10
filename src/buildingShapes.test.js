import { describe, it, expect } from 'vitest';
import { buildingShapes } from './buildingShapes.js';

// ~100m x 100m block near Turin with a ~30m courtyard in the middle
const outerRing = [
  [7.6860, 45.0700],
  [7.6873, 45.0700],
  [7.6873, 45.0709],
  [7.6860, 45.0709],
  [7.6860, 45.0700]
];

const courtyardRing = [
  [7.6864, 45.0703],
  [7.6868, 45.0703],
  [7.6868, 45.0706],
  [7.6864, 45.0706],
  [7.6864, 45.0703]
];

describe('buildingShapes', () => {
  it('builds a shape with holes from a Polygon with inner rings', () => {
    const shapes = buildingShapes({ type: 'Polygon', coordinates: [outerRing, courtyardRing] });
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(1);

    // The courtyard must reduce the footprint area accordingly
    const outerOnly = buildingShapes({ type: 'Polygon', coordinates: [outerRing] });
    const areaWithHole = Math.abs(shapes[0].getPoints().length) && shapeArea(shapes[0]);
    const areaSolid = shapeArea(outerOnly[0]);
    expect(areaWithHole).toBeLessThan(areaSolid);
  });

  it('builds one shape per MultiPolygon part, each with its own holes', () => {
    const secondPart = outerRing.map(([lng, lat]) => [lng + 0.002, lat]);
    const shapes = buildingShapes({
      type: 'MultiPolygon',
      coordinates: [[outerRing, courtyardRing], [secondPart]]
    });
    expect(shapes).toHaveLength(2);
    expect(shapes[0].holes).toHaveLength(1);
    expect(shapes[1].holes).toHaveLength(0);
  });

  it('returns null when no usable rings exist', () => {
    expect(buildingShapes(null)).toBeNull();
    expect(buildingShapes({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).toBeNull();
  });
});

// Signed area of the shape minus its holes (shoelace on sampled points)
function shapeArea(shape) {
  const ringArea = (points) => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    return Math.abs(area / 2);
  };

  let area = ringArea(shape.getPoints());
  for (const hole of shape.holes) {
    area -= ringArea(hole.getPoints());
  }
  return area;
}
