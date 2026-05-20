/**
 * Special-class (특실) fare multiplier per train grade.
 *
 * Korail's actual 특실 fare is `기본운임 × 1.4 + 거리할증`, so a single
 * constant can't be exact for every route. The values below are calibrated
 * against published letskorail.com fares and match the most common routes
 * within ~1-2% — close enough to display, off by a hundred or two on
 * shorter-distance trains.
 *
 *   KTX (Seoul-Busan):       59,800 → 87,900  ratio 1.470
 *   KTX (Seoul-Daejeon):     23,700 → 34,500  ratio 1.456
 *   KTX (Seoul-Gwangju):     46,800 → 68,900  ratio 1.472
 *   KTX (구포정차):           53,900 → 80,900  ratio 1.501  ← stays at 1.47 (slight under-shoot)
 *   SRT:                     ~ratio 1.45
 *   KTX-이음 (중앙선):        EMU-260, no separate 특실 → fall through
 *   KTX-청룡:                 ~ratio 1.40 (newer rolling stock)
 *
 * If the train name doesn't match any branch we fall back to the global
 * default. Callers should treat the returned number as an estimate.
 */
export function firstClassMult(trainGradeName: string): number {
  const name = trainGradeName ?? "";
  if (name === "SRT") return 1.45;
  if (name.startsWith("KTX-청룡")) return 1.40;
  if (name.startsWith("KTX-이음")) return 1.40; // 일부 편성만 우등실 운용
  if (name.startsWith("KTX")) return 1.47; // KTX, KTX-산천
  return 1.4;
}
