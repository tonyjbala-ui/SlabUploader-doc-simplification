export type Point2 = { x: number; y: number };

export type AxisBox = {
  center: Point2;
  lengthPx: number;
  widthPx: number;
  angleRad: number;
};

export type ConfirmedAxis = AxisBox & {
  confirmed: true;
  userRotationRad: number;
};

export function pickLengthAxis(box: AxisBox, opts?: { forceSwap?: boolean }): AxisBox {
  let { lengthPx, widthPx, angleRad, center } = box;
  const shouldSwap = opts?.forceSwap === true || widthPx > lengthPx;
  if (shouldSwap) {
    const tmp = lengthPx;
    lengthPx = widthPx;
    widthPx = tmp;
    angleRad = angleRad + Math.PI / 2;
  }
  return { center, lengthPx, widthPx, angleRad };
}

export function confirmAxis(box: AxisBox, userRotationRad = 0): ConfirmedAxis {
  return {
    ...box,
    angleRad: box.angleRad + userRotationRad,
    userRotationRad,
    confirmed: true
  };
}

export function rotateBox(box: AxisBox, deltaRad: number): AxisBox {
  return { ...box, angleRad: box.angleRad + deltaRad };
}
