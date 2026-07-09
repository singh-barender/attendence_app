import { FACE_CROP_MARGIN_RATIO, mapFaceBoundsToCropRect } from './faceCrop';

describe('mapFaceBoundsToCropRect', () => {
  it('scales a centered box proportionally when the image is larger than the frame', () => {
    // Frame is 640x480, photo is 2x the resolution at the same aspect ratio.
    const bounds = { x: 220, y: 100, width: 200, height: 280 };
    const rect = mapFaceBoundsToCropRect(bounds, 640, 480, 1280, 960, 0);

    expect(rect.startX).toBeCloseTo(440);
    expect(rect.startY).toBeCloseTo(200);
    expect(rect.endX).toBeCloseTo(840);
    expect(rect.endY).toBeCloseTo(760);
  });

  it('maps 1:1 when frame and image dimensions match', () => {
    const bounds = { x: 50, y: 60, width: 100, height: 120 };
    const rect = mapFaceBoundsToCropRect(bounds, 640, 480, 640, 480, 0);

    expect(rect).toEqual({ startX: 50, startY: 60, endX: 150, endY: 180 });
  });

  it('expands the box by the given margin ratio on each side', () => {
    const bounds = { x: 100, y: 100, width: 200, height: 200 };
    const rect = mapFaceBoundsToCropRect(bounds, 640, 480, 640, 480, 0.2);

    // margin = 200 * 0.2 = 40 on each side
    expect(rect.startX).toBeCloseTo(60);
    expect(rect.startY).toBeCloseTo(60);
    expect(rect.endX).toBeCloseTo(340);
    expect(rect.endY).toBeCloseTo(340);
  });

  it('uses FACE_CROP_MARGIN_RATIO by default', () => {
    const bounds = { x: 100, y: 100, width: 200, height: 200 };
    const withDefault = mapFaceBoundsToCropRect(bounds, 640, 480, 640, 480);
    const withExplicit = mapFaceBoundsToCropRect(
      bounds,
      640,
      480,
      640,
      480,
      FACE_CROP_MARGIN_RATIO,
    );

    expect(withDefault).toEqual(withExplicit);
  });

  it('clamps the start coordinates to zero when the margin pushes past the frame edge', () => {
    const bounds = { x: 10, y: 10, width: 100, height: 100 };
    const rect = mapFaceBoundsToCropRect(bounds, 640, 480, 640, 480, 0.5);

    expect(rect.startX).toBe(0);
    expect(rect.startY).toBe(0);
  });

  it('clamps the end coordinates to the image bounds when the margin pushes past the far edge', () => {
    const bounds = { x: 550, y: 400, width: 80, height: 70 };
    const rect = mapFaceBoundsToCropRect(bounds, 640, 480, 640, 480, 0.5);

    expect(rect.endX).toBe(640);
    expect(rect.endY).toBe(480);
  });
});
