// Anonymized numerical replay: first period, 87 shots. No account or match IDs.
// Times are rounded to the 0.1 ms precision of the original client inputs.
// This linear goalie ignores the seed; only these anonymous phase offsets matter.
export const referenceSeed = 'anonymous-marksmanship-replay';
export const referenceOffsets = {
  goalie: 5636.793051982708,
  goal: 4937.469511789346,
  shooter: 9084.257482637371,
} as const;

// Colleague's initial labels: h=behind, d=counter, p=precise, n=near,
// o=ordinary, b=board, s=super, c=closed. These are comparison data, not ground truth.
export const manualLabels = [
  'hddphnonpb', 'odoooshnph', 'ddpooooncb', 'oooonhopho',
  'ocoooonnpo', 'ooodhophoo', 'coooonpnoo', 'ooocspbooo', 'cdodphs',
].join('');

export const referenceShots = [
  [1983.2, 1983.2, 'goal'], [3056.1, 2645.1, 'goal'], [4111.9, 3290.1, 'goal'],
  [5172.3, 3940, 'save'], [6227.7, 4585.8, 'goal'], [7267.7, 5198.8, 'goal'],
  [8340.3, 5844.7, 'goal'], [9364.9, 6443.1, 'goal'], [10421, 7089.8, 'save'],
  [11478.8, 7737.6, 'goal'], [12066.4, 7899, 'goal'], [12691, 8108.1, 'miss'],
  [13777.9, 8773, 'goal'], [14817.7, 9403.4, 'goal'], [15856.6, 10032.2, 'goal'],
  [16978.6, 10726.9, 'goal'], [17968.5, 11289.4, 'miss'], [19095, 11987.9, 'goal'],
  [20101.1, 12585.2, 'goal'], [21191, 13265.5, 'goal'], [22230.9, 13895.5, 'goal'],
  [23272, 14508.9, 'goal'], [24330.6, 15156.4, 'goal'], [25369.3, 15785.4, 'goal'],
  [26426.3, 16414.2, 'goal'], [27499.2, 17059.7, 'goal'], [28507.3, 17656.4, 'goal'],
  [29165.9, 17886.9, 'goal'], [30721, 19013.5, 'save'], [31629.6, 19511.1, 'goal'],
  [32721.4, 20175.2, 'goal'], [33726.2, 20770.9, 'goal'], [34817.6, 21434.5, 'goal'],
  [35874, 22079.4, 'goal'], [36932.5, 22726.7, 'goal'], [37939.5, 23322.6, 'goal'],
  [39029.1, 24001.5, 'goal'], [40072.6, 24617.6, 'goal'], [41160.7, 25296.6, 'goal'],
  [42168.5, 25876.2, 'goal'], [43225.7, 26522.3, 'goal'], [44281.3, 27166.8, 'save'],
  [45337.1, 27811.3, 'goal'], [46429.1, 28475.6, 'goal'], [47459.2, 29089.3, 'goal'],
  [48517.9, 29719.8, 'goal'], [49111.1, 29885.7, 'goal'], [50385.8, 30733.2, 'save'],
  [51540.8, 31462.6, 'save'], [52679.1, 32172.6, 'goal'], [53752, 32833.9, 'goal'],
  [54812.8, 33466, 'goal'], [55871.6, 34109.8, 'goal'], [56948.6, 34758.5, 'miss'],
  [57978.4, 35356.4, 'goal'], [59051.6, 36021.3, 'goal'], [60049, 36602.7, 'goal'],
  [61129.7, 37267.2, 'goal'], [62177.3, 37898.6, 'goal'], [63238.5, 38543.6, 'goal'],
  [64297.9, 39191.5, 'save'], [65372.6, 39839.7, 'goal'], [66376.6, 40434.1, 'goal'],
  [67432.6, 41061.3, 'goal'], [68521.7, 41722.6, 'goal'], [69582.4, 42371.4, 'goal'],
  [70681.2, 43052.9, 'miss'], [71390.8, 43346.8, 'goal'], [72641.7, 44182.4, 'goal'],
  [73683.2, 44812.6, 'goal'], [74764.7, 45478, 'goal'], [75811.5, 46109.5, 'goal'],
  [76842.4, 46724.2, 'goal'], [77855.4, 47321.5, 'save'], [79718, 48768.3, 'miss'],
  [80797.9, 49430.7, 'save'], [81840.4, 50045.4, 'goal'], [82934.2, 50723.4, 'goal'],
  [83960.5, 51338.6, 'goal'], [85007.7, 51969.7, 'goal'], [86080.1, 52625.7, 'save'],
  [87111.8, 53239.4, 'goal'], [88184.3, 53902.3, 'goal'], [89207.1, 54498.1, 'goal'],
  [90296.6, 55160, 'save'], [91320.8, 55773.5, 'goal'], [92359.5, 56384.7, 'miss'],
] as const satisfies readonly (readonly [number, number, 'goal' | 'save' | 'miss'])[];
