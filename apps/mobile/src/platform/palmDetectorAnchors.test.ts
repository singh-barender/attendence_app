import { EXPECTED_ANCHOR_COUNT, generatePalmDetectionAnchors } from './palmDetectorAnchors';

describe('generatePalmDetectionAnchors', () => {
  it('produces exactly the model-documented anchor count (2016)', () => {
    expect(generatePalmDetectionAnchors()).toHaveLength(EXPECTED_ANCHOR_COUNT);
  });

  it('splits anchors 1152 (stride-8 layer) / 864 (merged stride-16 layers)', () => {
    const anchors = generatePalmDetectionAnchors();
    // Stride-8 feature map is 24x24 cells x 2 anchors/cell = 1152.
    expect(anchors.slice(0, 1152)).toHaveLength(1152);
    // Every anchor from index 1152 onward belongs to the stride-16 group,
    // which contributes 12x12 cells x 6 anchors/cell = 864.
    expect(anchors.slice(1152)).toHaveLength(864);
  });

  it('centers the first stride-8 cell anchor at (0.5/24, 0.5/24)', () => {
    const [first] = generatePalmDetectionAnchors();
    expect(first?.xCenter).toBeCloseTo(0.5 / 24);
    expect(first?.yCenter).toBeCloseTo(0.5 / 24);
  });

  it('gives identical centers to both anchors sharing a stride-8 grid cell', () => {
    const anchors = generatePalmDetectionAnchors();
    expect(anchors[0]).toEqual(anchors[1]);
  });

  it('advances to the next grid column only after all of a cell’s anchors are emitted', () => {
    const anchors = generatePalmDetectionAnchors();
    // Index 2 is the first anchor of the second stride-8 cell (x=1, y=0).
    expect(anchors[2]?.xCenter).toBeCloseTo(1.5 / 24);
    expect(anchors[2]?.yCenter).toBeCloseTo(0.5 / 24);
  });

  it('gives identical centers to all six anchors sharing a stride-16 grid cell', () => {
    const anchors = generatePalmDetectionAnchors();
    const stride16Start = 1152;
    const cell = anchors.slice(stride16Start, stride16Start + 6);
    expect(
      cell.every((a) => a.xCenter === cell[0]?.xCenter && a.yCenter === cell[0]?.yCenter),
    ).toBe(true);
  });

  it('centers the first stride-16 cell anchor at (0.5/12, 0.5/12)', () => {
    const anchors = generatePalmDetectionAnchors();
    const firstStride16 = anchors[1152];
    expect(firstStride16?.xCenter).toBeCloseTo(0.5 / 12);
    expect(firstStride16?.yCenter).toBeCloseTo(0.5 / 12);
  });
});
